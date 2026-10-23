-- GeniusAI Workspace: appearance preferences + profile hardening
-- Apply after 202610230005_ai_jobs_and_credits.sql.

-- Appearance preferences (theme, accent, text size, motion). Small JSON object only.
alter table public.profiles
  add column if not exists preferences jsonb not null default '{}'::jsonb;

alter table public.profiles
  drop constraint if exists profiles_preferences_shape;
alter table public.profiles
  add constraint profiles_preferences_shape check (
    jsonb_typeof(preferences) = 'object'
    and pg_column_size(preferences) <= 1024
    and (preferences ->> 'theme'  is null or preferences ->> 'theme'  in ('system','light','dark'))
    and (preferences ->> 'accent' is null or preferences ->> 'accent' in ('lavender','ocean','emerald','sunset','rose','graphite'))
    and (preferences ->> 'text'   is null or preferences ->> 'text'   in ('default','large'))
    and (preferences ->> 'motion' is null or preferences ->> 'motion' in ('system','reduce','full'))
  );

alter table public.profiles
  drop constraint if exists profiles_display_name_length;
alter table public.profiles
  add constraint profiles_display_name_length check (display_name is null or char_length(btrim(display_name)) between 1 and 80);

-- Users may edit only these profile columns. onboarding_completed_at and
-- timestamps are set by trusted functions; user_id never changes.
revoke update on public.profiles from anon, authenticated;
grant update (display_name, locale, country_code, preferences) on public.profiles to authenticated;

-- Profiles are created by the sign-up trigger; clients don't need to insert them.
revoke insert on public.profiles from anon, authenticated;
drop policy if exists "profiles_insert_self" on public.profiles;
