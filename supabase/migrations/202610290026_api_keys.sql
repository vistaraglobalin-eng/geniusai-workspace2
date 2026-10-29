-- GeniusAI Workspace: developer API keys and request log. Apply after 202610290025_policy_library.sql.
-- Safe to run more than once.
--
-- Keys are shown once when created; only a SHA-256 hash is stored. Owners and admins can see a
-- key's name, prefix and usage, never the key itself. The server (service role) checks keys,
-- records each request (for rate limits and the usage list) and does all writes.

create table if not exists public.api_keys (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  name          text not null check (char_length(btrim(name)) between 1 and 60),
  prefix        text not null check (char_length(prefix) between 8 and 20),
  key_hash      text not null unique check (key_hash ~ '^[0-9a-f]{64}$'),
  -- AI jobs run as this member (and stop working if they leave or become view-only).
  created_by    uuid not null references auth.users(id) on delete cascade,
  created_at    timestamptz not null default now(),
  last_used_at  timestamptz,
  revoked_at    timestamptz
);
create index if not exists api_keys_workspace_idx on public.api_keys (workspace_id, created_at desc);

create table if not exists public.api_requests (
  id            bigint generated always as identity primary key,
  key_id        uuid not null references public.api_keys(id) on delete cascade,
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  endpoint      text not null check (char_length(endpoint) <= 80),
  status        integer not null check (status between 100 and 599),
  credits       integer not null default 0 check (credits >= 0),
  created_at    timestamptz not null default now()
);
create index if not exists api_requests_key_idx on public.api_requests (key_id, created_at desc);
create index if not exists api_requests_workspace_idx on public.api_requests (workspace_id, created_at desc);

alter table public.api_keys enable row level security;
alter table public.api_requests enable row level security;

drop policy if exists "api_keys_select_admin" on public.api_keys;
create policy "api_keys_select_admin" on public.api_keys
  for select to authenticated using (public.is_workspace_admin(workspace_id));
drop policy if exists "api_requests_select_admin" on public.api_requests;
create policy "api_requests_select_admin" on public.api_requests
  for select to authenticated using (public.is_workspace_admin(workspace_id));

revoke all on public.api_keys from anon, authenticated;
revoke all on public.api_requests from anon, authenticated;
-- The hash is never readable from the app.
grant select (id, workspace_id, name, prefix, created_by, created_at, last_used_at, revoked_at) on public.api_keys to authenticated;
grant select on public.api_requests to authenticated;
