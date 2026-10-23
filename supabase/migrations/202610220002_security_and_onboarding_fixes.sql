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
