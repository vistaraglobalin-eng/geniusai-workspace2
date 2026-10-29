-- GeniusAI Workspace: join with your company email. Apply after 202610290026_api_keys.sql. Safe to run more than once.
--
-- An owner or admin claims their company's email domain (e.g. vistaraglobal.in). Anyone who signs in
-- with a confirmed email on that domain can then join the workspace in one tap, with the access the
-- admin chose. Public email providers (gmail.com…) can't be claimed, a domain belongs to one workspace,
-- and the admin's own email must be on it. Members can read; all writes go through the server.

create table if not exists public.workspace_domains (
  domain        text primary key check (char_length(domain) between 3 and 120 and domain ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$'),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  access        text not null default 'view' check (access in ('edit', 'view')),
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now()
);
create index if not exists workspace_domains_workspace_idx on public.workspace_domains (workspace_id);

alter table public.workspace_domains enable row level security;
drop policy if exists "workspace_domains_select_member" on public.workspace_domains;
create policy "workspace_domains_select_member" on public.workspace_domains
  for select to authenticated using (public.is_workspace_member(workspace_id));
revoke all on public.workspace_domains from anon, authenticated;
grant select on public.workspace_domains to authenticated;
