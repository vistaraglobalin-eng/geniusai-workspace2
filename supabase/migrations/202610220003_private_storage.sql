-- GeniusAI Workspace: private file storage
-- Apply after 202610220002_security_and_onboarding_fixes.sql.
--
-- Every uploaded file lives in the private bucket 'private-user-files' at:
--
--     <workspace_id>/<uploader_user_id>/<file_id>-<safe_filename>
--
-- Rules enforced here (on storage.objects) and on public.files:
--   * Only workspace members can read a workspace's files, via signed URLs or
--     authenticated downloads. Nothing in the bucket is public.
--   * Users can only upload into their own folder inside a workspace they belong to.
--   * Users can overwrite only their own files; owners/admins can also delete others'.
--   * Files the scanner has quarantined, and files soft-deleted in public.files,
--     can no longer be downloaded by clients.
--   * Size and type limits are enforced by the bucket itself.

-- ---------------------------------------------------------------------------
-- 1. Bucket
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'private-user-files',
  'private-user-files',
  false,
  26214400, -- 25 MB
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/csv',
    'text/plain',
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/heic'
  ]
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------------------
-- 2. Path helpers
-- ---------------------------------------------------------------------------

-- Returns the n-th folder of an object path as a uuid, or null if it is not a uuid.
-- Never raises, so a malformed path simply fails the policy instead of erroring.
create or replace function public.storage_path_uuid(object_name text, part integer)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case
    when split_part(object_name, '/', part)
         ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then split_part(object_name, '/', part)::uuid
  end;
$$;

revoke all on function public.storage_path_uuid(text, integer) from public;
grant execute on function public.storage_path_uuid(text, integer) to authenticated;

-- True when public.files marks this object as quarantined or soft-deleted.
-- SECURITY DEFINER so the check also works when the caller cannot see the row.
create or replace function public.is_file_blocked(object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.files f
    where f.storage_bucket = 'private-user-files'
      and f.object_key = object_name
      and (f.scan_status = 'quarantined' or f.deleted_at is not null)
  );
$$;

revoke all on function public.is_file_blocked(text) from public;
grant execute on function public.is_file_blocked(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. storage.objects policies (bucket-scoped; other buckets are unaffected)
-- ---------------------------------------------------------------------------

drop policy if exists "geniusai_files_select" on storage.objects;
create policy "geniusai_files_select" on storage.objects
for select to authenticated
using (
  bucket_id = 'private-user-files'
  and public.is_workspace_member(public.storage_path_uuid(name, 1))
  and not public.is_file_blocked(name)
);

drop policy if exists "geniusai_files_insert" on storage.objects;
create policy "geniusai_files_insert" on storage.objects
for insert to authenticated
with check (
  bucket_id = 'private-user-files'
  and public.is_workspace_member(public.storage_path_uuid(name, 1))
  and public.storage_path_uuid(name, 2) = (select auth.uid())
  and split_part(name, '/', 3) <> ''
  and split_part(name, '/', 4) = ''          -- exactly three levels deep
);

-- Overwrite (upsert) only your own file.
drop policy if exists "geniusai_files_update" on storage.objects;
create policy "geniusai_files_update" on storage.objects
for update to authenticated
using (
  bucket_id = 'private-user-files'
  and public.is_workspace_member(public.storage_path_uuid(name, 1))
  and public.storage_path_uuid(name, 2) = (select auth.uid())
)
with check (
  bucket_id = 'private-user-files'
  and public.is_workspace_member(public.storage_path_uuid(name, 1))
  and public.storage_path_uuid(name, 2) = (select auth.uid())
);

-- Delete your own file, or any file in a workspace you administer.
drop policy if exists "geniusai_files_delete" on storage.objects;
create policy "geniusai_files_delete" on storage.objects
for delete to authenticated
using (
  bucket_id = 'private-user-files'
  and public.is_workspace_member(public.storage_path_uuid(name, 1))
  and (
    public.storage_path_uuid(name, 2) = (select auth.uid())
    or public.is_workspace_admin(public.storage_path_uuid(name, 1))
  )
);

-- ---------------------------------------------------------------------------
-- 4. Keep public.files in line with the storage layout
-- ---------------------------------------------------------------------------

-- Tighten 202610220002: file records must point at the uploader's own folder.
drop policy if exists "files_insert_member" on public.files;
create policy "files_insert_member" on public.files
for insert to authenticated with check (
  uploaded_by = (select auth.uid())
  and public.is_workspace_member(workspace_id)
  and object_key like workspace_id::text || '/' || (select auth.uid())::text || '/%'
);
