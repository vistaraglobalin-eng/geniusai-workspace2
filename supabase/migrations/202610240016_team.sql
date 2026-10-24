-- GeniusAI Workspace: Team members (invites, roles, view-only access). Safe to run more than once.

-- Part 1: view-only access + helper
alter table public.workspace_members add column if not exists access text not null default 'edit';
alter table public.workspace_members drop constraint if exists workspace_members_access_check;
alter table public.workspace_members add constraint workspace_members_access_check check (access in ('edit', 'view'));

create or replace function public.is_workspace_editor(target_workspace uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = target_workspace and wm.user_id = (select auth.uid()) and wm.access = 'edit'
  );
$$;
revoke all on function public.is_workspace_editor(uuid) from public;
grant execute on function public.is_workspace_editor(uuid) to authenticated;

-- Part 2: members can read, only editors can change
do $$
declare t text;
begin
  foreach t in array array['invoices', 'invoice_customers', 'invoice_settings', 'resumes', 'expenses'] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop policy if exists %I on public.%I', t || '_member', t);
      execute format('drop policy if exists %I on public.%I', 'inv_customers_member', t);
      execute format('drop policy if exists %I on public.%I', 'inv_settings_member', t);
      execute format('drop policy if exists %I on public.%I', t || '_read', t);
      execute format('drop policy if exists %I on public.%I', t || '_edit', t);
      execute format('create policy %I on public.%I for select to authenticated using (public.is_workspace_member(workspace_id))', t || '_read', t);
      execute format('create policy %I on public.%I for all to authenticated using (public.is_workspace_editor(workspace_id)) with check (public.is_workspace_editor(workspace_id))', t || '_edit', t);
    end if;
  end loop;
end $$;

drop policy if exists "agreements_insert_member" on public.agreements;
create policy "agreements_insert_member" on public.agreements for insert to authenticated
  with check (created_by = (select auth.uid()) and public.is_workspace_editor(workspace_id));
drop policy if exists "agreements_update_member" on public.agreements;
create policy "agreements_update_member" on public.agreements for update to authenticated
  using (public.is_workspace_editor(workspace_id) and deleted_at is null)
  with check (public.is_workspace_editor(workspace_id));

drop policy if exists "files_insert_member" on public.files;
create policy "files_insert_member" on public.files for insert to authenticated
  with check (uploaded_by = (select auth.uid()) and public.is_workspace_editor(workspace_id)
    and object_key like (workspace_id::text || '/' || (select auth.uid())::text || '/%'));
drop policy if exists "files_update_own_or_admin" on public.files;
create policy "files_update_own_or_admin" on public.files for update to authenticated
  using (public.is_workspace_editor(workspace_id) and (uploaded_by = (select auth.uid()) or public.is_workspace_admin(workspace_id)))
  with check (public.is_workspace_editor(workspace_id) and (uploaded_by = (select auth.uid()) or public.is_workspace_admin(workspace_id)));

-- Part 3: storage (uploads need edit access)
drop policy if exists "geniusai_files_insert" on storage.objects;
create policy "geniusai_files_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'private-user-files' and public.is_workspace_editor(public.storage_path_uuid(name, 1))
    and public.storage_path_uuid(name, 2) = (select auth.uid()) and split_part(name, '/', 3) <> '' and split_part(name, '/', 4) = '');
drop policy if exists "geniusai_files_update" on storage.objects;
create policy "geniusai_files_update" on storage.objects for update to authenticated
  using (bucket_id = 'private-user-files' and public.is_workspace_editor(public.storage_path_uuid(name, 1)) and public.storage_path_uuid(name, 2) = (select auth.uid()))
  with check (bucket_id = 'private-user-files' and public.is_workspace_editor(public.storage_path_uuid(name, 1)) and public.storage_path_uuid(name, 2) = (select auth.uid()));
drop policy if exists "geniusai_files_delete" on storage.objects;
create policy "geniusai_files_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'private-user-files' and public.is_workspace_editor(public.storage_path_uuid(name, 1))
    and (public.storage_path_uuid(name, 2) = (select auth.uid()) or public.is_workspace_admin(public.storage_path_uuid(name, 1))));

-- Part 4: view-only people can't spend credits or send signature requests
create or replace function public.block_view_only()
returns trigger language plpgsql security definer set search_path = '' as $$
declare who uuid := coalesce(to_jsonb(new) ->> 'requested_by', to_jsonb(new) ->> 'created_by')::uuid;
begin
  if who is not null and exists (
    select 1 from public.workspace_members wm where wm.workspace_id = new.workspace_id and wm.user_id = who and wm.access = 'view'
  ) then
    raise exception 'view_only' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function public.block_view_only() from public;
drop trigger if exists ai_jobs_block_view_only on public.ai_jobs;
create trigger ai_jobs_block_view_only before insert on public.ai_jobs for each row execute function public.block_view_only();
drop trigger if exists signature_requests_block_view_only on public.signature_requests;
create trigger signature_requests_block_view_only before insert on public.signature_requests for each row execute function public.block_view_only();

-- Part 5: invitations (read by admins; created and accepted only by the server)
create table if not exists public.workspace_invites (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  email text not null default '' check (char_length(email) <= 254),
  role public.workspace_role not null default 'member' check (role <> 'owner'),
  access text not null default 'edit' check (access in ('edit', 'view')),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  invited_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz,
  accepted_by uuid references auth.users(id) on delete set null,
  revoked_at timestamptz
);
create index if not exists workspace_invites_ws_idx on public.workspace_invites (workspace_id, created_at desc);
create index if not exists workspace_invites_invited_by_idx on public.workspace_invites (invited_by);
create index if not exists workspace_invites_accepted_by_idx on public.workspace_invites (accepted_by);
alter table public.workspace_invites enable row level security;
drop policy if exists "invites_select_admin" on public.workspace_invites;
create policy "invites_select_admin" on public.workspace_invites for select to authenticated using (public.is_workspace_admin(workspace_id));
revoke all on public.workspace_invites from anon, authenticated;
grant select (id, workspace_id, email, role, access, invited_by, created_at, expires_at, accepted_at, accepted_by, revoked_at) on public.workspace_invites to authenticated;
