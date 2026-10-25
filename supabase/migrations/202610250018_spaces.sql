-- GeniusAI Workspace: Spaces — named folders that group files inside a workspace.
-- Apply after 202610250017_sign_reminders.sql. Members can read; all writes go through the server.

create table if not exists public.spaces (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name         text not null check (char_length(btrim(name)) between 1 and 60),
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now()
);
create unique index if not exists spaces_workspace_name_idx on public.spaces (workspace_id, lower(btrim(name)));

alter table public.files add column if not exists space_id uuid references public.spaces(id) on delete set null;
create index if not exists files_workspace_space_idx on public.files (workspace_id, space_id, created_at desc);

alter table public.spaces enable row level security;
drop policy if exists "spaces_select_member" on public.spaces;
create policy "spaces_select_member" on public.spaces for select to authenticated using (public.is_workspace_member(workspace_id));
revoke all on public.spaces from anon, authenticated;
grant select on public.spaces to authenticated;

-- A file can only be put in a space of its own workspace.
create or replace function public.files_space_same_workspace()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.space_id is not null and not exists (
    select 1 from public.spaces s where s.id = new.space_id and s.workspace_id = new.workspace_id
  ) then
    raise exception 'space_mismatch';
  end if;
  return new;
end;
$$;
drop trigger if exists files_space_check on public.files;
create trigger files_space_check before insert or update of space_id on public.files
  for each row execute function public.files_space_same_workspace();
