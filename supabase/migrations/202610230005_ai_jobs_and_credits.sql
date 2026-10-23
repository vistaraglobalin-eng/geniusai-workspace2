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
