-- GeniusAI Workspace: database setup for project wxvaahhlywaklpfuocak ONLY (not Playbook).
-- Run once in Supabase → SQL Editor. Runs as one transaction: if anything fails, nothing is changed.
begin;

-- ===== 202610220002_security_and_onboarding_fixes.sql =====
-- GeniusAI Workspace: follow-up to 202610220001_geniusai_core_schema.sql
-- Safe to apply on top of the already-applied core schema. Does not drop data.
--
-- Fixes:
--   1. Workspace owners are now added as members automatically (they were locked out).
--      Each new workspace also gets a zero-balance credit account and an audit entry.
--   2. Members can no longer rewrite any column of any file row. Clients can only
--      write safe columns; scan status, storage location and uploader are server-owned.
--   3. Corrects the misleading comment on is_workspace_member (it is SECURITY DEFINER).
--   4. Keeps updated_at current via triggers.
--   5. Adds module_key checks to files and usage_events (matching ai_jobs).
--   6. Lets signed-out visitors read active plans (for a public pricing page).

-- ---------------------------------------------------------------------------
-- 1. Helper functions
-- ---------------------------------------------------------------------------

comment on function public.is_workspace_member(uuid) is
  'SECURITY DEFINER on purpose: bypasses RLS on workspace_members so policies that '
  'call it do not recurse. Only answers for the calling user (auth.uid()).';

create or replace function public.is_workspace_admin(target_workspace uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = target_workspace
      and wm.user_id = (select auth.uid())
      and wm.role in ('owner', 'admin')
  );
$$;

comment on function public.is_workspace_admin(uuid) is
  'SECURITY DEFINER for the same reason as is_workspace_member. True when the caller '
  'is an owner or admin of the workspace.';

revoke all on function public.is_workspace_admin(uuid) from public;
grant execute on function public.is_workspace_admin(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. updated_at maintenance
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.set_updated_at() from public;

create trigger profiles_set_updated_at        before update on public.profiles        for each row execute function public.set_updated_at();
create trigger workspaces_set_updated_at      before update on public.workspaces      for each row execute function public.set_updated_at();
create trigger credit_accounts_set_updated_at before update on public.credit_accounts for each row execute function public.set_updated_at();
create trigger plan_catalog_set_updated_at    before update on public.plan_catalog    for each row execute function public.set_updated_at();
create trigger subscriptions_set_updated_at   before update on public.subscriptions   for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 3. Workspace onboarding: owner membership + credit account on creation
-- ---------------------------------------------------------------------------

-- Abuse guard: a signed-in user may own at most 10 workspaces when creating them
-- from the client. Server-side inserts (no auth.uid()) are not limited.
create or replace function public.enforce_workspace_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  owned_count integer;
begin
  if (select auth.uid()) is not null then
    select count(*) into owned_count
    from public.workspaces w
    where w.owner_user_id = new.owner_user_id;

    if owned_count >= 10 then
      raise exception 'workspace_limit_reached'
        using errcode = 'P0001',
              hint = 'A user can own at most 10 workspaces.';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.handle_new_workspace()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.workspace_members (workspace_id, user_id, role)
  values (new.id, new.owner_user_id, 'owner')
  on conflict (workspace_id, user_id) do update set role = 'owner';

  insert into public.credit_accounts (workspace_id)
  values (new.id)
  on conflict (workspace_id) do nothing;

  insert into public.audit_logs (workspace_id, actor_user_id, action_key, target_type, target_id)
  values (new.id, new.owner_user_id, 'workspace.created', 'workspace', new.id::text);

  return null;
end;
$$;

revoke all on function public.enforce_workspace_limit() from public;
revoke all on function public.handle_new_workspace() from public;

create trigger workspaces_enforce_limit
  before insert on public.workspaces
  for each row execute function public.enforce_workspace_limit();

create trigger workspaces_after_insert
  after insert on public.workspaces
  for each row execute function public.handle_new_workspace();

-- Backfill any workspaces created before this migration.
insert into public.workspace_members (workspace_id, user_id, role)
select w.id, w.owner_user_id, 'owner'
from public.workspaces w
on conflict (workspace_id, user_id) do update set role = 'owner';

insert into public.credit_accounts (workspace_id)
select w.id from public.workspaces w
on conflict (workspace_id) do nothing;

-- Clients may change a workspace's name, kind and currency only, never its owner.
revoke update on public.workspaces from anon, authenticated;
grant update (name, kind, default_currency) on public.workspaces to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Files: restrict what clients can write
-- ---------------------------------------------------------------------------

-- Column privileges: clients can only supply descriptive columns on insert and
-- only rename / re-tag / soft-delete on update. scan_status, storage_bucket,
-- sha256, retention and uploader/workspace moves are server-only.
revoke insert, update on public.files from anon, authenticated;
grant insert (id, workspace_id, uploaded_by, object_key, original_filename, mime_type, byte_size, module_key)
  on public.files to authenticated;
grant update (original_filename, module_key, deleted_at)
  on public.files to authenticated;

drop policy if exists "files_insert_member" on public.files;
create policy "files_insert_member" on public.files
for insert to authenticated with check (
  uploaded_by = (select auth.uid())
  and public.is_workspace_member(workspace_id)
  -- Storage keys must live under the workspace's folder: '<workspace_id>/...'
  and object_key like workspace_id::text || '/%'
);

drop policy if exists "files_update_member" on public.files;
create policy "files_update_own_or_admin" on public.files
for update to authenticated
using (
  public.is_workspace_member(workspace_id)
  and (uploaded_by = (select auth.uid()) or public.is_workspace_admin(workspace_id))
)
with check (
  public.is_workspace_member(workspace_id)
  and (uploaded_by = (select auth.uid()) or public.is_workspace_admin(workspace_id))
);

-- ---------------------------------------------------------------------------
-- 5. module_key consistency
-- ---------------------------------------------------------------------------

alter table public.files
  add constraint files_module_key_check
  check (module_key is null or module_key in ('documents','career','creative','invoices','contracts'));

alter table public.usage_events
  add constraint usage_events_module_key_check
  check (module_key in ('documents','career','creative','invoices','contracts'));

-- ---------------------------------------------------------------------------
-- 6. Public pricing
-- ---------------------------------------------------------------------------

drop policy if exists "plan_catalog_read_active" on public.plan_catalog;
create policy "plan_catalog_read_active" on public.plan_catalog
for select to anon, authenticated using (active = true);

-- STILL TO DO (separate migrations):
--   * Private Storage bucket 'private-user-files' + storage.objects policies keyed on
--     the '<workspace_id>/' prefix enforced above.
--   * Server-side invitation flow for adding members.
--   * Credit reserve/settle/refund and job state transitions as trusted server functions.
--   * Module tables (resumes, invoices, expenses, contracts, generated assets).

-- ===== 202610220003_private_storage.sql =====
-- GeniusAI Workspace: private file storage
-- Apply after 202610220002_security_and_onboarding_fixes.sql.
--
-- Every uploaded file lives in the private bucket 'private-user-files' at:
--
--     <workspace_id>/<uploader_user_id>/<file_id>-<safe_filename>
--
-- Rules enforced here (on storage.objects) and on public.files:
--   * Only workspace members can read a workspace's files, via signed URLs or
--     authenticated downloads. Nothing in the bucket is public.
--   * Users can only upload into their own folder inside a workspace they belong to.
--   * Users can overwrite only their own files; owners/admins can also delete others'.
--   * Files the scanner has quarantined, and files soft-deleted in public.files,
--     can no longer be downloaded by clients.
--   * Size and type limits are enforced by the bucket itself.

-- ---------------------------------------------------------------------------
-- 1. Bucket
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'private-user-files',
  'private-user-files',
  false,
  26214400, -- 25 MB
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/csv',
    'text/plain',
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/heic'
  ]
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------------------
-- 2. Path helpers
-- ---------------------------------------------------------------------------

-- Returns the n-th folder of an object path as a uuid, or null if it is not a uuid.
-- Never raises, so a malformed path simply fails the policy instead of erroring.
create or replace function public.storage_path_uuid(object_name text, part integer)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case
    when split_part(object_name, '/', part)
         ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then split_part(object_name, '/', part)::uuid
  end;
$$;

revoke all on function public.storage_path_uuid(text, integer) from public;
grant execute on function public.storage_path_uuid(text, integer) to authenticated;

-- True when public.files marks this object as quarantined or soft-deleted.
-- SECURITY DEFINER so the check also works when the caller cannot see the row.
create or replace function public.is_file_blocked(object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.files f
    where f.storage_bucket = 'private-user-files'
      and f.object_key = object_name
      and (f.scan_status = 'quarantined' or f.deleted_at is not null)
  );
$$;

revoke all on function public.is_file_blocked(text) from public;
grant execute on function public.is_file_blocked(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. storage.objects policies (bucket-scoped; other buckets are unaffected)
-- ---------------------------------------------------------------------------

drop policy if exists "geniusai_files_select" on storage.objects;
create policy "geniusai_files_select" on storage.objects
for select to authenticated
using (
  bucket_id = 'private-user-files'
  and public.is_workspace_member(public.storage_path_uuid(name, 1))
  and not public.is_file_blocked(name)
);

drop policy if exists "geniusai_files_insert" on storage.objects;
create policy "geniusai_files_insert" on storage.objects
for insert to authenticated
with check (
  bucket_id = 'private-user-files'
  and public.is_workspace_member(public.storage_path_uuid(name, 1))
  and public.storage_path_uuid(name, 2) = (select auth.uid())
  and split_part(name, '/', 3) <> ''
  and split_part(name, '/', 4) = ''          -- exactly three levels deep
);

-- Overwrite (upsert) only your own file.
drop policy if exists "geniusai_files_update" on storage.objects;
create policy "geniusai_files_update" on storage.objects
for update to authenticated
using (
  bucket_id = 'private-user-files'
  and public.is_workspace_member(public.storage_path_uuid(name, 1))
  and public.storage_path_uuid(name, 2) = (select auth.uid())
)
with check (
  bucket_id = 'private-user-files'
  and public.is_workspace_member(public.storage_path_uuid(name, 1))
  and public.storage_path_uuid(name, 2) = (select auth.uid())
);

-- Delete your own file, or any file in a workspace you administer.
drop policy if exists "geniusai_files_delete" on storage.objects;
create policy "geniusai_files_delete" on storage.objects
for delete to authenticated
using (
  bucket_id = 'private-user-files'
  and public.is_workspace_member(public.storage_path_uuid(name, 1))
  and (
    public.storage_path_uuid(name, 2) = (select auth.uid())
    or public.is_workspace_admin(public.storage_path_uuid(name, 1))
  )
);

-- ---------------------------------------------------------------------------
-- 4. Keep public.files in line with the storage layout
-- ---------------------------------------------------------------------------

-- Tighten 202610220002: file records must point at the uploader's own folder.
drop policy if exists "files_insert_member" on public.files;
create policy "files_insert_member" on public.files
for insert to authenticated with check (
  uploaded_by = (select auth.uid())
  and public.is_workspace_member(workspace_id)
  and object_key like workspace_id::text || '/' || (select auth.uid())::text || '/%'
);

-- ===== 202610220004_auth_onboarding.sql =====
-- GeniusAI Workspace: sign-up profile + onboarding
-- Apply after 202610220003_private_storage.sql.
--
--   * Every new auth user gets a profiles row automatically.
--   * complete_onboarding() saves the user's name and creates their first workspace
--     in one transaction. Calling it twice never creates a second workspace.
--   * Helper functions are no longer executable by signed-out (anon) callers.
--     Supabase grants EXECUTE to anon by default, which "revoke ... from public"
--     does not remove.

-- ---------------------------------------------------------------------------
-- 1. Profile on sign-up
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (user_id, display_name)
  values (
    new.id,
    nullif(left(btrim(coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      ''
    )), 80), '')
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill users who signed up before this migration.
insert into public.profiles (user_id)
select u.id from auth.users u
on conflict (user_id) do nothing;

-- ---------------------------------------------------------------------------
-- 2. Onboarding
-- ---------------------------------------------------------------------------

create or replace function public.complete_onboarding(
  p_display_name   text,
  p_workspace_name text,
  p_kind           public.workspace_kind default 'personal',
  p_currency       text default 'USD'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid      uuid := (select auth.uid());
  dn       text := btrim(coalesce(p_display_name, ''));
  wn       text := btrim(coalesce(p_workspace_name, ''));
  cur      text := upper(btrim(coalesce(p_currency, '')));
  ws       uuid;
begin
  if uid is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;
  if char_length(dn) not between 1 and 80 then
    raise exception 'invalid_display_name' using errcode = '22023';
  end if;
  if char_length(wn) not between 1 and 80 then
    raise exception 'invalid_workspace_name' using errcode = '22023';
  end if;
  if cur !~ '^[A-Z]{3}$' then
    raise exception 'invalid_currency' using errcode = '22023';
  end if;

  -- Serialise concurrent submissions from the same user (double-clicks, two tabs).
  perform pg_advisory_xact_lock(hashtextextended('geniusai.onboarding:' || uid::text, 0));

  insert into public.profiles (user_id, display_name, onboarding_completed_at)
  values (uid, dn, now())
  on conflict (user_id) do update
    set display_name = excluded.display_name,
        onboarding_completed_at = coalesce(public.profiles.onboarding_completed_at, now());

  select wm.workspace_id into ws
  from public.workspace_members wm
  where wm.user_id = uid
  order by wm.created_at
  limit 1;

  if ws is null then
    -- The workspaces triggers add the owner membership, credit account and audit entry.
    insert into public.workspaces (name, kind, owner_user_id, default_currency)
    values (wn, coalesce(p_kind, 'personal'), uid, cur)
    returning id into ws;
  end if;

  return ws;
end;
$$;

revoke all on function public.complete_onboarding(text, text, public.workspace_kind, text) from public, anon;
grant execute on function public.complete_onboarding(text, text, public.workspace_kind, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Tidy function privileges from earlier migrations
-- ---------------------------------------------------------------------------

revoke execute on function public.is_workspace_member(uuid)          from anon;
revoke execute on function public.is_workspace_admin(uuid)           from anon;
revoke execute on function public.storage_path_uuid(text, integer)   from anon;
revoke execute on function public.is_file_blocked(text)              from anon;
revoke execute on function public.set_updated_at()                   from anon, authenticated;
revoke execute on function public.enforce_workspace_limit()          from anon, authenticated;
revoke execute on function public.handle_new_workspace()             from anon, authenticated;

-- ===== 202610220004b_remove_earlier_setup.sql =====
-- GeniusAI Workspace: remove setup created on the live project before these migrations existed.
-- Apply after 202610220004_auth_onboarding.sql. Safe on a fresh database (everything is "if exists").
--
--   * Four earlier storage policies on storage.objects. Policies are combined with OR, so leaving
--     them in place would bypass the stricter geniusai_files_* rules from 202610220003
--     (quarantined and soft-deleted files must not be downloadable).
--   * The earlier sign-up trigger that created a workspace for every new user. Sign-up now only
--     creates a profile (202610220004); the workspace is created during onboarding with the
--     name and type the user chooses. Existing users and workspaces are kept as they are.

drop policy if exists "private_user_files_select_workspace_member" on storage.objects;
drop policy if exists "private_user_files_insert_workspace_member" on storage.objects;
drop policy if exists "private_user_files_update_workspace_member" on storage.objects;
drop policy if exists "private_user_files_delete_workspace_member" on storage.objects;

drop trigger if exists on_auth_user_created_provision_workspace on auth.users;
drop function if exists public.provision_workspace_for_new_user();

-- ===== 202610230005_ai_jobs_and_credits.sql =====
-- GeniusAI Workspace: AI job lifecycle + credits
-- Apply after 202610220004_auth_onboarding.sql.
--
-- How credits work
--   1. Before an AI task runs, the server reserves the most it could cost
--      (available -> reserved). If the workspace can't cover it, nothing runs.
--   2. When it finishes, the server charges the actual cost (never more than
--      the reservation) and returns the rest. If it fails, everything is returned.
--   Every movement is written to credit_ledger with a unique reference key, so
--   retries can never double-charge.
--
-- All functions here are callable ONLY with the service-role key, from server
-- code. Signed-in users can read their workspace's jobs and ledger, never write.

-- ---------------------------------------------------------------------------
-- 1. Job input/output columns
-- ---------------------------------------------------------------------------

alter table public.ai_jobs
  add column if not exists input_params jsonb not null default '{}'::jsonb,
  add column if not exists result jsonb,
  add column if not exists input_tokens integer check (input_tokens is null or input_tokens >= 0),
  add column if not exists output_tokens integer check (output_tokens is null or output_tokens >= 0);

create index if not exists ai_jobs_workspace_module_created_idx
  on public.ai_jobs (workspace_id, module_key, created_at desc);

-- ---------------------------------------------------------------------------
-- 2. App settings (server-only key/value), starting with welcome credits
-- ---------------------------------------------------------------------------

create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.app_settings enable row level security;
-- No policies: only the service role and SQL editor can read or change settings.

insert into public.app_settings (key, value)
values ('welcome_credits', '200'::jsonb)
on conflict (key) do nothing;
-- To change later:  update public.app_settings set value = '500' where key = 'welcome_credits';

-- ---------------------------------------------------------------------------
-- 3. Granting credits
-- ---------------------------------------------------------------------------

create or replace function public.grant_credits(
  p_workspace   uuid,
  p_amount      bigint,
  p_reference   text,
  p_description text default null,
  p_actor       uuid default null
)
returns boolean   -- false when this reference was already granted
language plpgsql
security definer
set search_path = ''
as $$
declare
  inserted uuid;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'invalid_amount' using errcode = '22023';
  end if;

  insert into public.credit_ledger (workspace_id, actor_user_id, entry_kind, amount, balance_delta, reference_key, description)
  values (p_workspace, p_actor, 'grant', p_amount, p_amount, p_reference, p_description)
  on conflict (reference_key) do nothing
  returning id into inserted;

  if inserted is null then
    return false;
  end if;

  insert into public.credit_accounts (workspace_id, available_credits)
  values (p_workspace, p_amount)
  on conflict (workspace_id) do update
    set available_credits = public.credit_accounts.available_credits + excluded.available_credits;

  return true;
end;
$$;

-- New workspaces: membership + credit account + audit (as before) + welcome credits.
create or replace function public.handle_new_workspace()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  welcome bigint;
begin
  insert into public.workspace_members (workspace_id, user_id, role)
  values (new.id, new.owner_user_id, 'owner')
  on conflict (workspace_id, user_id) do update set role = 'owner';

  insert into public.credit_accounts (workspace_id)
  values (new.id)
  on conflict (workspace_id) do nothing;

  insert into public.audit_logs (workspace_id, actor_user_id, action_key, target_type, target_id)
  values (new.id, new.owner_user_id, 'workspace.created', 'workspace', new.id::text);

  select (s.value #>> '{}')::bigint into welcome
  from public.app_settings s where s.key = 'welcome_credits';

  if coalesce(welcome, 0) > 0 then
    perform public.grant_credits(new.id, welcome, 'welcome:' || new.id::text, 'Welcome credits', new.owner_user_id);
  end if;

  return null;
end;
$$;

-- Existing workspaces get their welcome credits once (reference key makes this idempotent).
do $$
declare
  w record;
  welcome bigint := (select (value #>> '{}')::bigint from public.app_settings where key = 'welcome_credits');
begin
  if coalesce(welcome, 0) > 0 then
    for w in select id, owner_user_id from public.workspaces loop
      perform public.grant_credits(w.id, welcome, 'welcome:' || w.id::text, 'Welcome credits', w.owner_user_id);
    end loop;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Job lifecycle
-- ---------------------------------------------------------------------------

-- Returns any credits still held by a running job and marks it failed.
create or replace function public.fail_ai_job(p_job uuid, p_error_code text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  j public.ai_jobs%rowtype;
begin
  select * into j from public.ai_jobs where id = p_job for update;
  if not found then
    raise exception 'job_not_found' using errcode = 'P0002';
  end if;
  if j.status not in ('queued', 'running') then
    return; -- already finished; nothing to release
  end if;

  update public.credit_accounts
     set available_credits = available_credits + j.estimated_credits,
         reserved_credits  = greatest(reserved_credits - j.estimated_credits, 0)
   where workspace_id = j.workspace_id;

  if j.estimated_credits > 0 then
    insert into public.credit_ledger (workspace_id, actor_user_id, job_id, entry_kind, amount, balance_delta, reference_key, description)
    values (j.workspace_id, j.requested_by, j.id, 'release', j.estimated_credits, j.estimated_credits,
            'job:' || j.id::text || ':release', 'Returned: task did not complete')
    on conflict (reference_key) do nothing;
  end if;

  update public.ai_jobs
     set status = 'failed',
         safe_error_code = left(coalesce(p_error_code, 'failed'), 64),
         completed_at = now()
   where id = j.id;
end;
$$;

create or replace function public.start_ai_job(
  p_user              uuid,
  p_workspace         uuid,
  p_module            text,
  p_task              text,
  p_input_file_ids    uuid[],
  p_idempotency_key   text,
  p_estimated_credits integer,
  p_params            jsonb default '{}'::jsonb,
  p_provider          text default null,
  p_model             text default null
)
returns table (job_id uuid, job_status public.ai_job_status, created boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing public.ai_jobs%rowtype;
  acct     public.credit_accounts%rowtype;
  stale    record;
  new_id   uuid;
begin
  if p_estimated_credits is null or p_estimated_credits < 1 then
    raise exception 'invalid_estimate' using errcode = '22023';
  end if;
  if p_idempotency_key is null or char_length(p_idempotency_key) not between 8 and 100 then
    raise exception 'invalid_idempotency_key' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = p_workspace and wm.user_id = p_user
  ) then
    raise exception 'not_a_member' using errcode = '42501';
  end if;

  -- Every input file must belong to this workspace and still be usable.
  if exists (
    select 1 from unnest(coalesce(p_input_file_ids, '{}')) as fid
    where not exists (
      select 1 from public.files f
      where f.id = fid and f.workspace_id = p_workspace
        and f.deleted_at is null and f.scan_status not in ('quarantined', 'failed')
    )
  ) then
    raise exception 'file_not_available' using errcode = '42501';
  end if;

  -- Same request retried (double-click, network retry): return the original job.
  select * into existing from public.ai_jobs
  where requested_by = p_user and idempotency_key = p_idempotency_key;
  if found then
    return query select existing.id, existing.status, false;
    return;
  end if;

  -- Lock the balance so concurrent jobs can't overspend.
  select * into acct from public.credit_accounts where workspace_id = p_workspace for update;
  if not found then
    raise exception 'insufficient_credits' using errcode = 'P0001';
  end if;

  -- Release credits held by jobs that crashed mid-run (no result after 15 minutes).
  for stale in
    select id from public.ai_jobs
    where workspace_id = p_workspace and status in ('queued', 'running')
      and coalesce(started_at, created_at) < now() - interval '15 minutes'
  loop
    perform public.fail_ai_job(stale.id, 'timeout');
  end loop;
  select * into acct from public.credit_accounts where workspace_id = p_workspace;

  if acct.available_credits < p_estimated_credits then
    raise exception 'insufficient_credits' using errcode = 'P0001',
      detail = format('needed=%s available=%s', p_estimated_credits, acct.available_credits);
  end if;

  begin
    insert into public.ai_jobs (workspace_id, requested_by, module_key, task_type, status, input_file_ids,
                                provider_key, model_key, idempotency_key, estimated_credits, input_params, started_at)
    values (p_workspace, p_user, p_module, p_task, 'running', coalesce(p_input_file_ids, '{}'),
            p_provider, p_model, p_idempotency_key, p_estimated_credits, coalesce(p_params, '{}'::jsonb), now())
    returning id into new_id;
  exception when unique_violation then
    select * into existing from public.ai_jobs
    where requested_by = p_user and idempotency_key = p_idempotency_key;
    return query select existing.id, existing.status, false;
    return;
  end;

  update public.credit_accounts
     set available_credits = available_credits - p_estimated_credits,
         reserved_credits  = reserved_credits + p_estimated_credits
   where workspace_id = p_workspace;

  insert into public.credit_ledger (workspace_id, actor_user_id, job_id, entry_kind, amount, balance_delta, reference_key, description)
  values (p_workspace, p_user, new_id, 'reserve', p_estimated_credits, -p_estimated_credits,
          'job:' || new_id::text || ':reserve', 'Reserved for ' || p_module || ' / ' || p_task);

  return query select new_id, 'running'::public.ai_job_status, true;
end;
$$;

create or replace function public.complete_ai_job(
  p_job            uuid,
  p_actual_credits integer,
  p_result         jsonb,
  p_input_tokens   integer default null,
  p_output_tokens  integer default null,
  p_cost_microusd  bigint default null
)
returns integer   -- credits actually charged
language plpgsql
security definer
set search_path = ''
as $$
declare
  j        public.ai_jobs%rowtype;
  charged  integer;
  leftover integer;
begin
  select * into j from public.ai_jobs where id = p_job for update;
  if not found then
    raise exception 'job_not_found' using errcode = 'P0002';
  end if;
  if j.status <> 'running' then
    raise exception 'job_not_running' using errcode = 'P0001';
  end if;

  charged  := least(greatest(coalesce(p_actual_credits, 0), 0), j.estimated_credits);
  leftover := j.estimated_credits - charged;

  update public.credit_accounts
     set reserved_credits  = greatest(reserved_credits - j.estimated_credits, 0),
         available_credits = available_credits + leftover
   where workspace_id = j.workspace_id;

  insert into public.credit_ledger (workspace_id, actor_user_id, job_id, entry_kind, amount, balance_delta, reference_key, description)
  values (j.workspace_id, j.requested_by, j.id, 'settle', charged, 0,
          'job:' || j.id::text || ':settle', 'Charged for ' || j.module_key || ' / ' || j.task_type);

  if leftover > 0 then
    insert into public.credit_ledger (workspace_id, actor_user_id, job_id, entry_kind, amount, balance_delta, reference_key, description)
    values (j.workspace_id, j.requested_by, j.id, 'release', leftover, leftover,
            'job:' || j.id::text || ':release', 'Unused reservation returned');
  end if;

  update public.ai_jobs
     set status = 'succeeded',
         charged_credits = charged,
         result = p_result,
         input_tokens = p_input_tokens,
         output_tokens = p_output_tokens,
         provider_cost_microusd = p_cost_microusd,
         completed_at = now()
   where id = j.id;

  insert into public.usage_events (workspace_id, user_id, job_id, event_key, module_key, quantity, unit, estimated_cost_microusd)
  values (j.workspace_id, j.requested_by, j.id, 'ai_job.' || j.task_type, j.module_key, charged, 'credit', p_cost_microusd);

  return charged;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Privileges: service role only
-- ---------------------------------------------------------------------------

revoke all on function public.grant_credits(uuid, bigint, text, text, uuid) from public, anon, authenticated;
revoke all on function public.fail_ai_job(uuid, text) from public, anon, authenticated;
revoke all on function public.start_ai_job(uuid, uuid, text, text, uuid[], text, integer, jsonb, text, text) from public, anon, authenticated;
revoke all on function public.complete_ai_job(uuid, integer, jsonb, integer, integer, bigint) from public, anon, authenticated;
revoke all on function public.handle_new_workspace() from public, anon, authenticated;

grant execute on function public.grant_credits(uuid, bigint, text, text, uuid) to service_role;
grant execute on function public.fail_ai_job(uuid, text) to service_role;
grant execute on function public.start_ai_job(uuid, uuid, text, text, uuid[], text, integer, jsonb, text, text) to service_role;
grant execute on function public.complete_ai_job(uuid, integer, jsonb, integer, integer, bigint) to service_role;

revoke all on public.app_settings from anon, authenticated;

-- ===== 202610230006_preferences_and_profile_hardening.sql =====
-- GeniusAI Workspace: appearance preferences + profile hardening
-- Apply after 202610230005_ai_jobs_and_credits.sql.

-- Appearance preferences (theme, accent, text size, motion). Small JSON object only.
alter table public.profiles
  add column if not exists preferences jsonb not null default '{}'::jsonb;

alter table public.profiles
  drop constraint if exists profiles_preferences_shape;
alter table public.profiles
  add constraint profiles_preferences_shape check (
    jsonb_typeof(preferences) = 'object'
    and pg_column_size(preferences) <= 1024
    and (preferences ->> 'theme'  is null or preferences ->> 'theme'  in ('system','light','dark'))
    and (preferences ->> 'accent' is null or preferences ->> 'accent' in ('lavender','ocean','emerald','sunset','rose','graphite'))
    and (preferences ->> 'text'   is null or preferences ->> 'text'   in ('default','large'))
    and (preferences ->> 'motion' is null or preferences ->> 'motion' in ('system','reduce','full'))
  );

alter table public.profiles
  drop constraint if exists profiles_display_name_length;
alter table public.profiles
  add constraint profiles_display_name_length check (display_name is null or char_length(btrim(display_name)) between 1 and 80);

-- Users may edit only these profile columns. onboarding_completed_at and
-- timestamps are set by trusted functions; user_id never changes.
revoke update on public.profiles from anon, authenticated;
grant update (display_name, locale, country_code, preferences) on public.profiles to authenticated;

-- Profiles are created by the sign-up trigger; clients don't need to insert them.
revoke insert on public.profiles from anon, authenticated;
drop policy if exists "profiles_insert_self" on public.profiles;

-- ===== 202610230007_more_file_types.sql =====
-- GeniusAI Workspace: more file types in private storage
-- Apply after 202610230006_preferences_and_profile_hardening.sql.
-- Adds PowerPoint, OpenDocument and RTF uploads (for Office to PDF) and ZIP
-- (PDF to JPG returns several pages as one ZIP). Size limit unchanged (25 MB).

update storage.buckets
set allowed_mime_types = array[
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.oasis.opendocument.text',
  'application/vnd.oasis.opendocument.spreadsheet',
  'application/vnd.oasis.opendocument.presentation',
  'application/rtf',
  'application/zip',
  'text/csv',
  'text/plain',
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/heic'
]
where id = 'private-user-files';

-- ===== 202610230008_payments.sql =====
-- GeniusAI Workspace: buying credit packs (Razorpay)
-- Apply after 202610230007_more_file_types.sql.
--
-- Flow: the server creates a Razorpay order for a pack (price always taken from
-- this table, never from the browser) and records it here. When Razorpay
-- confirms the payment (browser callback after signature + status checks, or the
-- webhook), the server calls fulfil_payment(), which marks the order paid and
-- grants the credits exactly once, however many times it is called.

-- ---------------------------------------------------------------------------
-- 1. Credit packs (prices in paise, GST inclusive)
-- ---------------------------------------------------------------------------
create table if not exists public.credit_packs (
  pack_key     text primary key check (pack_key ~ '^[a-z0-9_-]{2,40}$'),
  display_name text not null,
  description  text,
  credits      bigint not null check (credits > 0),
  price_minor  bigint not null check (price_minor >= 100),
  currency     char(3) not null default 'INR',
  active       boolean not null default true,
  highlight    boolean not null default false,
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
alter table public.credit_packs enable row level security;
drop policy if exists "credit_packs_read_active" on public.credit_packs;
create policy "credit_packs_read_active" on public.credit_packs for select to anon, authenticated using (active = true);
revoke insert, update, delete on public.credit_packs from anon, authenticated;
create trigger credit_packs_set_updated_at before update on public.credit_packs for each row execute function public.set_updated_at();

-- PLACEHOLDER PRICES: review before launch. Change with e.g.
--   update public.credit_packs set price_minor = 24900 where pack_key = 'starter';
insert into public.credit_packs (pack_key, display_name, description, credits, price_minor, highlight, sort_order) values
  ('starter',  'Starter',  'About 15 document summaries',  500,   19900, false, 1),
  ('standard', 'Standard', 'About 60 document summaries',  2000,  69900, true,  2),
  ('pro',      'Pro',      'About 180 document summaries', 6000, 179900, false, 3)
on conflict (pack_key) do nothing;

-- ---------------------------------------------------------------------------
-- 2. Payment orders
-- ---------------------------------------------------------------------------
create table if not exists public.payment_orders (
  id                  uuid primary key default gen_random_uuid(),
  workspace_id        uuid not null references public.workspaces(id) on delete restrict, -- keep payment records
  user_id             uuid references auth.users(id) on delete set null,
  pack_key            text not null references public.credit_packs(pack_key),
  credits             bigint not null check (credits > 0),
  amount_minor        bigint not null check (amount_minor > 0),
  currency            char(3) not null,
  provider            text not null default 'razorpay',
  provider_order_id   text not null unique,
  provider_payment_id text unique,
  status              text not null default 'created' check (status in ('created', 'paid', 'failed')),
  failure_reason      text,
  created_at          timestamptz not null default now(),
  paid_at             timestamptz
);
create index if not exists payment_orders_workspace_created_idx on public.payment_orders (workspace_id, created_at desc);
alter table public.payment_orders enable row level security;
drop policy if exists "payment_orders_select_member" on public.payment_orders;
create policy "payment_orders_select_member" on public.payment_orders for select to authenticated using (public.is_workspace_member(workspace_id));
revoke insert, update, delete on public.payment_orders from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Fulfilment (server only)
-- ---------------------------------------------------------------------------
create or replace function public.fulfil_payment(
  p_provider_order_id text,
  p_payment_id        text,
  p_amount_minor      bigint,
  p_currency          text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.payment_orders%rowtype;
begin
  select * into o from public.payment_orders where provider_order_id = p_provider_order_id for update;
  if not found then
    raise exception 'order_not_found' using errcode = 'P0002';
  end if;

  if o.status = 'paid' then
    if o.provider_payment_id = p_payment_id then
      return jsonb_build_object('status', 'already_credited', 'credits', o.credits, 'workspace_id', o.workspace_id);
    end if;
    raise exception 'order_paid_by_another_payment' using errcode = 'P0001';
  end if;

  if p_amount_minor is distinct from o.amount_minor or upper(p_currency) is distinct from o.currency then
    raise exception 'amount_mismatch' using errcode = 'P0001'; -- never credit a different amount
  end if;

  update public.payment_orders
     set status = 'paid', provider_payment_id = p_payment_id, paid_at = now(), failure_reason = null
   where id = o.id;

  perform public.grant_credits(o.workspace_id, o.credits, 'payment:' || p_payment_id,
                               'Bought ' || o.credits || ' credits', o.user_id);

  insert into public.audit_logs (workspace_id, actor_user_id, action_key, target_type, target_id, metadata)
  values (o.workspace_id, o.user_id, 'billing.credits_purchased', 'payment_order', o.id::text,
          jsonb_build_object('credits', o.credits, 'amount_minor', o.amount_minor, 'currency', o.currency));

  return jsonb_build_object('status', 'credited', 'credits', o.credits, 'workspace_id', o.workspace_id);
end;
$$;

create or replace function public.mark_payment_failed(p_provider_order_id text, p_reason text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.payment_orders
     set status = 'failed', failure_reason = left(coalesce(p_reason, 'failed'), 120)
   where provider_order_id = p_provider_order_id and status = 'created';
$$;

revoke all on function public.fulfil_payment(text, text, bigint, text) from public, anon, authenticated;
revoke all on function public.mark_payment_failed(text, text) from public, anon, authenticated;
grant execute on function public.fulfil_payment(text, text, bigint, text) to service_role;
grant execute on function public.mark_payment_failed(text, text) to service_role;

-- Members can read their workspace's credit history (already allowed by credit_ledger_select_member).

-- ===== 202610230009_refunds.sql =====
-- GeniusAI Workspace: refunding unused credit packs
-- Apply after 202610230008_payments.sql.
--
-- How to refund (matches the Refund & Cancellation Policy):
--   1. Issue the refund in the Razorpay Dashboard (Payments → the payment → Refund).
--   2. In the Supabase SQL editor run:
--        select public.process_refund('order_XXXXXXXX', 'Customer request: unused pack');
--      It removes the pack's credits and marks the order refunded. It refuses if the
--      workspace no longer has that many credits available (i.e. they were used).

alter table public.payment_orders drop constraint if exists payment_orders_status_check;
alter table public.payment_orders add constraint payment_orders_status_check
  check (status in ('created', 'paid', 'failed', 'refunded'));
alter table public.payment_orders add column if not exists refunded_at timestamptz;

create or replace function public.process_refund(p_provider_order_id text, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  o    public.payment_orders%rowtype;
  acct public.credit_accounts%rowtype;
begin
  select * into o from public.payment_orders where provider_order_id = p_provider_order_id for update;
  if not found then
    raise exception 'order_not_found' using errcode = 'P0002';
  end if;
  if o.status = 'refunded' then
    return jsonb_build_object('status', 'already_refunded', 'credits', o.credits);
  end if;
  if o.status <> 'paid' then
    raise exception 'order_not_paid' using errcode = 'P0001';
  end if;

  select * into acct from public.credit_accounts where workspace_id = o.workspace_id for update;
  if acct.available_credits < o.credits then
    raise exception 'credits_already_used' using errcode = 'P0001',
      detail = format('pack=%s available=%s', o.credits, acct.available_credits);
  end if;

  update public.credit_accounts set available_credits = available_credits - o.credits where workspace_id = o.workspace_id;

  insert into public.credit_ledger (workspace_id, actor_user_id, entry_kind, amount, balance_delta, reference_key, description)
  values (o.workspace_id, null, 'refund', o.credits, -o.credits, 'refund:' || o.provider_order_id,
          'Refunded: ' || o.credits || ' credits');

  update public.payment_orders set status = 'refunded', refunded_at = now(), failure_reason = left(p_reason, 120) where id = o.id;

  insert into public.audit_logs (workspace_id, actor_user_id, action_key, target_type, target_id, metadata)
  values (o.workspace_id, null, 'billing.refunded', 'payment_order', o.id::text,
          jsonb_build_object('credits', o.credits, 'amount_minor', o.amount_minor, 'reason', p_reason));

  return jsonb_build_object('status', 'refunded', 'credits', o.credits, 'amount_minor', o.amount_minor);
end;
$$;

revoke all on function public.process_refund(text, text) from public, anon, authenticated;
grant execute on function public.process_refund(text, text) to service_role;

-- ===== 202610230010_agreements.sql =====
-- GeniusAI Workspace: Agreement Studio (drafts + automatic version history)
-- Apply after 202610230009_refunds.sql.

create table if not exists public.agreements (
  id                 uuid primary key default gen_random_uuid(),
  workspace_id       uuid not null references public.workspaces(id) on delete cascade,
  created_by         uuid references auth.users(id) on delete set null,
  title              text not null check (char_length(btrim(title)) between 1 and 160),
  template_key       text not null check (template_key ~ '^[a-z0-9_]{2,40}$'),
  inputs             jsonb not null default '{}'::jsonb
                       check (jsonb_typeof(inputs) = 'object' and pg_column_size(inputs) <= 20000),
  content_md         text not null default '' check (char_length(content_md) <= 200000),
  status             text not null default 'draft' check (status in ('draft', 'final')),
  current_version    integer not null default 1,
  last_change_source text not null default 'manual'
                       check (last_change_source in ('ai_generate', 'ai_revise', 'manual', 'restore')),
  last_change_note   text check (last_change_note is null or char_length(last_change_note) <= 300),
  last_change_job_id uuid references public.ai_jobs(id) on delete set null,
  deleted_at         timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists agreements_workspace_updated_idx on public.agreements (workspace_id, updated_at desc) where deleted_at is null;

create table if not exists public.agreement_versions (
  id           uuid primary key default gen_random_uuid(),
  agreement_id uuid not null references public.agreements(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  version      integer not null,
  content_md   text not null,
  source       text not null,
  note         text,
  job_id       uuid references public.ai_jobs(id) on delete set null,
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  unique (agreement_id, version)
);

-- ---------------------------------------------------------------------------
-- Versioning: every content change becomes a numbered version, automatically.
-- ---------------------------------------------------------------------------
create or replace function public.agreements_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Only the server (service role) may label a change as AI-made.
  if current_user in ('authenticated', 'anon') and new.last_change_source in ('ai_generate', 'ai_revise') then
    new.last_change_source := 'manual';
    new.last_change_job_id := null;
  end if;
  if tg_op = 'UPDATE' then
    new.updated_at := now();
    new.workspace_id := old.workspace_id;      -- agreements never move between workspaces
    new.created_by := old.created_by;
    new.template_key := old.template_key;
    if new.content_md is distinct from old.content_md then
      new.current_version := old.current_version + 1;
      -- A note/job belongs to one change only; don't let it carry over to the next edit.
      if new.last_change_note is not distinct from old.last_change_note then new.last_change_note := null; end if;
      if new.last_change_job_id is not distinct from old.last_change_job_id then new.last_change_job_id := null; end if;
    else
      new.current_version := old.current_version;
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.agreements_after_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.content_md is distinct from old.content_md then
    insert into public.agreement_versions (agreement_id, workspace_id, version, content_md, source, note, job_id, created_by)
    values (new.id, new.workspace_id, new.current_version, new.content_md, new.last_change_source,
            new.last_change_note, new.last_change_job_id, (select auth.uid()));
  end if;
  return null;
end;
$$;

drop trigger if exists agreements_before_write on public.agreements;
create trigger agreements_before_write before insert or update on public.agreements
  for each row execute function public.agreements_before_write();
drop trigger if exists agreements_after_write on public.agreements;
create trigger agreements_after_write after insert or update on public.agreements
  for each row execute function public.agreements_after_write();

revoke all on function public.agreements_before_write() from public, anon, authenticated;
revoke all on function public.agreements_after_write() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Access: workspace members can read, create and edit their workspace's agreements.
-- ---------------------------------------------------------------------------
alter table public.agreements enable row level security;
alter table public.agreement_versions enable row level security;

drop policy if exists "agreements_select_member" on public.agreements;
create policy "agreements_select_member" on public.agreements for select to authenticated
  using (public.is_workspace_member(workspace_id));
drop policy if exists "agreements_insert_member" on public.agreements;
create policy "agreements_insert_member" on public.agreements for insert to authenticated
  with check (created_by = (select auth.uid()) and public.is_workspace_member(workspace_id));
drop policy if exists "agreements_update_member" on public.agreements;
create policy "agreements_update_member" on public.agreements for update to authenticated
  using (public.is_workspace_member(workspace_id) and deleted_at is null)
  with check (public.is_workspace_member(workspace_id));

drop policy if exists "agreement_versions_select_member" on public.agreement_versions;
create policy "agreement_versions_select_member" on public.agreement_versions for select to authenticated
  using (public.is_workspace_member(workspace_id));

revoke insert, update, delete on public.agreements from anon, authenticated;
grant insert (workspace_id, created_by, title, template_key, inputs, content_md, status, last_change_source, last_change_note)
  on public.agreements to authenticated;
grant update (title, content_md, status, deleted_at, last_change_source, last_change_note)
  on public.agreements to authenticated;
revoke insert, update, delete on public.agreement_versions from anon, authenticated;

commit;
