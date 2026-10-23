-- GeniusAI Workspace: Supabase starter schema (review before production)
-- This migration covers core platform tables only. Add module-specific tables,
-- Storage policies, payment-provider fields, and queue/worker integration separately.
-- Apply in a development project first. Test RLS using multiple users/workspaces.

create extension if not exists pgcrypto;

create type public.workspace_kind as enum ('personal', 'business');
create type public.workspace_role as enum ('owner', 'admin', 'member');
create type public.ai_job_status as enum ('queued', 'running', 'succeeded', 'failed', 'cancelled');
create type public.credit_entry_kind as enum ('grant', 'reserve', 'settle', 'release', 'refund', 'expire', 'adjustment');
create type public.file_scan_status as enum ('pending', 'clean', 'quarantined', 'failed');

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  locale text not null default 'en',
  country_code char(2),
  onboarding_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind public.workspace_kind not null default 'personal',
  owner_user_id uuid not null references auth.users(id) on delete restrict,
  default_currency char(3) not null default 'USD',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.workspace_role not null default 'member',
  invited_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create table public.files (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  uploaded_by uuid not null references auth.users(id) on delete restrict,
  storage_bucket text not null default 'private-user-files',
  object_key text not null unique,
  original_filename text not null,
  mime_type text not null,
  byte_size bigint not null check (byte_size >= 0),
  sha256 text,
  scan_status public.file_scan_status not null default 'pending',
  module_key text,
  retention_delete_after timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.ai_jobs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  requested_by uuid not null references auth.users(id) on delete restrict,
  module_key text not null check (module_key in ('documents','career','creative','invoices','contracts')),
  task_type text not null,
  status public.ai_job_status not null default 'queued',
  input_file_ids uuid[] not null default '{}',
  output_file_ids uuid[] not null default '{}',
  provider_key text,
  model_key text,
  idempotency_key text not null,
  estimated_credits integer not null default 0 check (estimated_credits >= 0),
  charged_credits integer not null default 0 check (charged_credits >= 0),
  provider_cost_microusd bigint check (provider_cost_microusd is null or provider_cost_microusd >= 0),
  safe_error_code text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (requested_by, idempotency_key)
);

create table public.credit_accounts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null unique references public.workspaces(id) on delete cascade,
  available_credits bigint not null default 0 check (available_credits >= 0),
  reserved_credits bigint not null default 0 check (reserved_credits >= 0),
  updated_at timestamptz not null default now()
);

create table public.credit_ledger (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  job_id uuid references public.ai_jobs(id) on delete set null,
  entry_kind public.credit_entry_kind not null,
  amount bigint not null check (amount >= 0),
  balance_delta bigint not null,
  reference_key text not null unique,
  description text,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.plan_catalog (
  plan_key text primary key,
  display_name text not null,
  active boolean not null default true,
  monthly_price_minor bigint not null default 0 check (monthly_price_minor >= 0),
  currency char(3) not null default 'USD',
  monthly_credits bigint not null default 0 check (monthly_credits >= 0),
  entitlements jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null unique references public.workspaces(id) on delete cascade,
  plan_key text not null references public.plan_catalog(plan_key),
  provider_key text not null,
  provider_customer_id text,
  provider_subscription_id text unique,
  status text not null check (status in ('trialing','active','past_due','cancelled','incomplete','paused','expired')),
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider_key text not null,
  provider_event_id text not null,
  event_type text not null,
  processing_status text not null default 'received'
    check (processing_status in ('received','processing','processed','failed','ignored')),
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  safe_error_code text,
  unique (provider_key, provider_event_id)
);

create table public.usage_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  job_id uuid references public.ai_jobs(id) on delete set null,
  event_key text not null,
  module_key text not null,
  quantity numeric(14,4) not null default 1,
  unit text not null default 'task',
  estimated_cost_microusd bigint check (estimated_cost_microusd is null or estimated_cost_microusd >= 0),
  created_at timestamptz not null default now()
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete set null,
  actor_user_id uuid references auth.users(id) on delete set null,
  action_key text not null,
  target_type text,
  target_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index workspace_members_user_idx on public.workspace_members(user_id);
create index files_workspace_created_idx on public.files(workspace_id, created_at desc) where deleted_at is null;
create index ai_jobs_workspace_created_idx on public.ai_jobs(workspace_id, created_at desc);
create index ai_jobs_status_created_idx on public.ai_jobs(status, created_at);
create index credit_ledger_workspace_created_idx on public.credit_ledger(workspace_id, created_at desc);
create index usage_events_workspace_created_idx on public.usage_events(workspace_id, created_at desc);
create index audit_logs_created_idx on public.audit_logs(created_at desc);

-- Membership helper: security invoker by default; checks direct membership.
create or replace function public.is_workspace_member(target_workspace uuid)
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
  );
$$;

-- Enable RLS on all exposed application tables.
alter table public.profiles enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.files enable row level security;
alter table public.ai_jobs enable row level security;
alter table public.credit_accounts enable row level security;
alter table public.credit_ledger enable row level security;
alter table public.plan_catalog enable row level security;
alter table public.subscriptions enable row level security;
alter table public.webhook_events enable row level security;
alter table public.usage_events enable row level security;
alter table public.audit_logs enable row level security;

-- Profiles: users can read/update only their own profile.
create policy "profiles_select_self" on public.profiles
for select to authenticated using (user_id = (select auth.uid()));
create policy "profiles_insert_self" on public.profiles
for insert to authenticated with check (user_id = (select auth.uid()));
create policy "profiles_update_self" on public.profiles
for update to authenticated using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

-- Workspace membership: members can view their workspace; creation is owner-only.
create policy "workspaces_select_member" on public.workspaces
for select to authenticated using (public.is_workspace_member(id) or owner_user_id = (select auth.uid()));
create policy "workspaces_insert_owner" on public.workspaces
for insert to authenticated with check (owner_user_id = (select auth.uid()));
create policy "workspaces_update_owner" on public.workspaces
for update to authenticated using (owner_user_id = (select auth.uid()))
with check (owner_user_id = (select auth.uid()));

create policy "members_select_workspace" on public.workspace_members
for select to authenticated using (public.is_workspace_member(workspace_id));
-- Membership insert/delete should be performed by a server-side invitation flow.
-- Do not add broad client-side insert/delete policies.

create policy "files_select_member" on public.files
for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "files_insert_member" on public.files
for insert to authenticated with check (
  uploaded_by = (select auth.uid()) and public.is_workspace_member(workspace_id)
);
create policy "files_update_member" on public.files
for update to authenticated using (public.is_workspace_member(workspace_id))
with check (public.is_workspace_member(workspace_id));
-- Physical Storage access requires separate storage.objects policies; do not rely on this table alone.

create policy "ai_jobs_select_member" on public.ai_jobs
for select to authenticated using (public.is_workspace_member(workspace_id));
-- Job creation/status transitions and all credit operations should be server-side only.
-- No client INSERT/UPDATE policy is intentionally provided.

create policy "credit_accounts_select_member" on public.credit_accounts
for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "credit_ledger_select_member" on public.credit_ledger
for select to authenticated using (public.is_workspace_member(workspace_id));
-- No client write policies for balances or ledger.

create policy "plan_catalog_read_active" on public.plan_catalog
for select to authenticated using (active = true);
-- Subscription updates are performed only by verified payment webhooks on the server.
create policy "subscriptions_select_member" on public.subscriptions
for select to authenticated using (public.is_workspace_member(workspace_id));

create policy "usage_events_select_member" on public.usage_events
for select to authenticated using (public.is_workspace_member(workspace_id));
-- Usage writes should come from trusted server-side orchestration.
-- Webhook events are server-only; no client policies.
-- Audit logs are server-only by default; no client policies.

-- Ensure helper function execution is not broadly exposed unnecessarily.
revoke all on function public.is_workspace_member(uuid) from public;
grant execute on function public.is_workspace_member(uuid) to authenticated;

-- IMPORTANT NEXT STEPS:
-- 1. Create a private Storage bucket and write storage.objects policies tied to workspace membership.
-- 2. Create trusted server-side RPC/Edge Function logic for workspace creation + owner membership,
--    credit reservation/settlement/refund, job state transitions, subscription updates and admin operations.
-- 3. Add module tables: resume_profiles/resume_versions, invoices/invoice_items, expenses,
--    contracts/contract_findings, generated_assets.
-- 4. Add role authorization from trusted database records for admin endpoints.
-- 5. Run Supabase advisors and cross-user RLS tests before any production deployment.
