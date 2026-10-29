-- GeniusAI Workspace: shared folders — share a Space with people outside the workspace by private link.
-- Apply after 202610280023_playbook.sql. Safe to run more than once.
--
-- A link can let people (a) see and download the space's files, (b) also add files, or
-- (c) only hand files in without seeing anyone else's (for teachers collecting work).
-- Members can READ their links. Everything else — creating, revoking, guest uploads and
-- downloads — goes through the server (service role) after it has checked the link.

create table if not exists public.space_shares (
  id            uuid primary key default gen_random_uuid(),
  space_id      uuid not null references public.spaces(id) on delete cascade,
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  token         text not null unique check (char_length(token) between 32 and 64),
  label         text check (label is null or char_length(btrim(label)) between 1 and 80),
  mode          text not null default 'view' check (mode in ('view', 'contribute', 'collect')),
  -- Guest uploads are stored under this member's folder (files.uploaded_by must be a user).
  created_by    uuid not null references auth.users(id) on delete cascade,
  expires_at    timestamptz,
  revoked_at    timestamptz,
  view_count    integer not null default 0 check (view_count >= 0),
  upload_count  integer not null default 0 check (upload_count >= 0),
  last_used_at  timestamptz,
  created_at    timestamptz not null default now()
);
create index if not exists space_shares_space_idx on public.space_shares (space_id, created_at desc);
create index if not exists space_shares_workspace_idx on public.space_shares (workspace_id);

-- A link can only point at a space of its own workspace.
create or replace function public.space_shares_same_workspace()
returns trigger language plpgsql set search_path = '' as $$
begin
  if not exists (select 1 from public.spaces s where s.id = new.space_id and s.workspace_id = new.workspace_id) then
    raise exception 'space_mismatch';
  end if;
  return new;
end;
$$;
drop trigger if exists space_shares_space_check on public.space_shares;
create trigger space_shares_space_check before insert or update of space_id, workspace_id on public.space_shares
  for each row execute function public.space_shares_same_workspace();

alter table public.space_shares enable row level security;
drop policy if exists "space_shares_select_member" on public.space_shares;
create policy "space_shares_select_member" on public.space_shares
  for select to authenticated using (public.is_workspace_member(workspace_id));
revoke all on public.space_shares from anon, authenticated;
grant select on public.space_shares to authenticated;

-- Files that arrived through a link: which link, and the name the sender typed.
alter table public.files add column if not exists shared_via uuid references public.space_shares(id) on delete set null;
alter table public.files add column if not exists guest_name text check (guest_name is null or char_length(guest_name) between 1 and 80);
create index if not exists files_shared_via_idx on public.files (shared_via, created_at desc) where shared_via is not null;
