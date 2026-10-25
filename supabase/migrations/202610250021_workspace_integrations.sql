-- GeniusAI Workspace: workspace connections that send events out (Slack, Zapier / Make / Pabbly webhooks).
-- Admins manage them; the webhook URL is encrypted by the server and never readable from the browser.
create table if not exists public.workspace_integrations (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  provider     text not null check (provider in ('slack', 'webhook')),
  name         text not null check (char_length(btrim(name)) between 1 and 80),
  url_enc      text not null check (char_length(url_enc) <= 2000),
  url_hint     text check (url_hint is null or char_length(url_hint) <= 80),
  events       text[] not null default '{}',
  created_by   uuid references auth.users(id) on delete set null,
  last_status  text check (last_status is null or char_length(last_status) <= 120),
  last_at      timestamptz,
  created_at   timestamptz not null default now()
);
create index if not exists workspace_integrations_ws_idx on public.workspace_integrations (workspace_id);

-- One row per event sent, so the same thing is never announced twice.
create table if not exists public.integration_deliveries (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  event        text not null check (char_length(event) <= 60),
  object_id    uuid not null,
  created_at   timestamptz not null default now(),
  primary key (workspace_id, event, object_id)
);

alter table public.workspace_integrations enable row level security;
alter table public.integration_deliveries enable row level security;
drop policy if exists "workspace_integrations_select_admin" on public.workspace_integrations;
create policy "workspace_integrations_select_admin" on public.workspace_integrations for select to authenticated using (public.is_workspace_admin(workspace_id));
revoke all on public.workspace_integrations from anon, authenticated;
revoke all on public.integration_deliveries from anon, authenticated;
grant select (id, workspace_id, provider, name, url_hint, events, last_status, last_at, created_at) on public.workspace_integrations to authenticated;
