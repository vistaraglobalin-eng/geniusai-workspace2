-- GeniusAI Workspace: sign-up profile + onboarding
-- Apply after 202610220003_private_storage.sql.
--
--   * Every new auth user gets a profiles row automatically.
--   * complete_onboarding() saves the user's name and creates their first workspace
--     in one transaction. Calling it twice never creates a second workspace.
--   * Helper functions are no longer executable by signed-out (anon) callers.
--     Supabase grants EXECUTE to anon by default, which "revoke ... from public"
--     does not remove.

-- ---------------------------------------------------------------------------
-- 1. Profile on sign-up
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (user_id, display_name)
  values (
    new.id,
    nullif(left(btrim(coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      ''
    )), 80), '')
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill users who signed up before this migration.
insert into public.profiles (user_id)
select u.id from auth.users u
on conflict (user_id) do nothing;

-- ---------------------------------------------------------------------------
-- 2. Onboarding
-- ---------------------------------------------------------------------------

create or replace function public.complete_onboarding(
  p_display_name   text,
  p_workspace_name text,
  p_kind           public.workspace_kind default 'personal',
  p_currency       text default 'USD'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid      uuid := (select auth.uid());
  dn       text := btrim(coalesce(p_display_name, ''));
  wn       text := btrim(coalesce(p_workspace_name, ''));
  cur      text := upper(btrim(coalesce(p_currency, '')));
  ws       uuid;
begin
  if uid is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;
  if char_length(dn) not between 1 and 80 then
    raise exception 'invalid_display_name' using errcode = '22023';
  end if;
  if char_length(wn) not between 1 and 80 then
    raise exception 'invalid_workspace_name' using errcode = '22023';
  end if;
  if cur !~ '^[A-Z]{3}$' then
    raise exception 'invalid_currency' using errcode = '22023';
  end if;

  -- Serialise concurrent submissions from the same user (double-clicks, two tabs).
  perform pg_advisory_xact_lock(hashtextextended('geniusai.onboarding:' || uid::text, 0));

  insert into public.profiles (user_id, display_name, onboarding_completed_at)
  values (uid, dn, now())
  on conflict (user_id) do update
    set display_name = excluded.display_name,
        onboarding_completed_at = coalesce(public.profiles.onboarding_completed_at, now());

  select wm.workspace_id into ws
  from public.workspace_members wm
  where wm.user_id = uid
  order by wm.created_at
  limit 1;

  if ws is null then
    -- The workspaces triggers add the owner membership, credit account and audit entry.
    insert into public.workspaces (name, kind, owner_user_id, default_currency)
    values (wn, coalesce(p_kind, 'personal'), uid, cur)
    returning id into ws;
  end if;

  return ws;
end;
$$;

revoke all on function public.complete_onboarding(text, text, public.workspace_kind, text) from public, anon;
grant execute on function public.complete_onboarding(text, text, public.workspace_kind, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Tidy function privileges from earlier migrations
-- ---------------------------------------------------------------------------

revoke execute on function public.is_workspace_member(uuid)          from anon;
revoke execute on function public.is_workspace_admin(uuid)           from anon;
revoke execute on function public.storage_path_uuid(text, integer)   from anon;
revoke execute on function public.is_file_blocked(text)              from anon;
revoke execute on function public.set_updated_at()                   from anon, authenticated;
revoke execute on function public.enforce_workspace_limit()          from anon, authenticated;
revoke execute on function public.handle_new_workspace()             from anon, authenticated;
