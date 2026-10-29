-- GeniusAI Workspace: business app connections (Shopify, Stripe, HubSpot; Salesforce later).
-- Apply after 202610290027_workspace_domains.sql. Safe to run more than once.
--
-- One connection per app per workspace. The access key is encrypted by the server (AES-256-GCM)
-- and is never readable from the app. Members can see which apps are connected (to run reports);
-- only owners and admins connect or disconnect, through the server.

create table if not exists public.business_connections (
  id             uuid primary key default gen_random_uuid(),
  workspace_id   uuid not null references public.workspaces(id) on delete cascade,
  provider       text not null check (provider in ('shopify', 'stripe', 'hubspot', 'salesforce')),
  account_label  text not null check (char_length(btrim(account_label)) between 1 and 120),
  account_ref    text check (account_ref is null or char_length(account_ref) <= 200),
  secret_enc     text not null check (char_length(secret_enc) <= 4000),
  key_hint       text check (key_hint is null or char_length(key_hint) <= 40),
  currency       text check (currency is null or currency ~ '^[A-Z]{3}$'),
  created_by     uuid references auth.users(id) on delete set null,
  created_at     timestamptz not null default now(),
  last_used_at   timestamptz,
  last_status    text check (last_status is null or char_length(last_status) <= 200),
  unique (workspace_id, provider)
);

alter table public.business_connections enable row level security;
drop policy if exists "business_connections_select_member" on public.business_connections;
create policy "business_connections_select_member" on public.business_connections
  for select to authenticated using (public.is_workspace_member(workspace_id));
revoke all on public.business_connections from anon, authenticated;
-- The encrypted key is never readable from the app.
grant select (id, workspace_id, provider, account_label, account_ref, key_hint, currency, created_at, last_used_at, last_status)
  on public.business_connections to authenticated;
