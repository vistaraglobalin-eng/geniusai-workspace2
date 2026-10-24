-- GeniusAI Workspace: Resume & Career Studio. Safe to run more than once.
create table if not exists public.resumes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  title text not null default 'My resume',
  template text not null default 'classic',
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.resumes enable row level security;
drop policy if exists "resumes_member" on public.resumes;
create policy "resumes_member" on public.resumes for all to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));
revoke all on public.resumes from anon;
grant select, insert, update, delete on public.resumes to authenticated;
