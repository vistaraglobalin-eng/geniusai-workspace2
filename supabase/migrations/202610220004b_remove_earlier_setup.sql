-- GeniusAI Workspace: remove setup created on the live project before these migrations existed.
-- Apply after 202610220004_auth_onboarding.sql. Safe on a fresh database (everything is "if exists").
--
--   * Four earlier storage policies on storage.objects. Policies are combined with OR, so leaving
--     them in place would bypass the stricter geniusai_files_* rules from 202610220003
--     (quarantined and soft-deleted files must not be downloadable).
--   * The earlier sign-up trigger that created a workspace for every new user. Sign-up now only
--     creates a profile (202610220004); the workspace is created during onboarding with the
--     name and type the user chooses. Existing users and workspaces are kept as they are.

drop policy if exists "private_user_files_select_workspace_member" on storage.objects;
drop policy if exists "private_user_files_insert_workspace_member" on storage.objects;
drop policy if exists "private_user_files_update_workspace_member" on storage.objects;
drop policy if exists "private_user_files_delete_workspace_member" on storage.objects;

drop trigger if exists on_auth_user_created_provision_workspace on auth.users;
drop function if exists public.provision_workspace_for_new_user();
