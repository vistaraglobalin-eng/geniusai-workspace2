-- GeniusAI Workspace: connected apps (Google Drive first). One row per person and app.
-- The refresh token is stored encrypted by the server and is never readable from the browser.
create table if not exists public.user_integrations (
  user_id       uuid not null references auth.users(id) on delete cascade,
  provider      text not null check (provider in ('google', 'zoho')),
  account_email text check (account_email is null or char_length(account_email) <= 254),
  token_enc     text not null check (char_length(token_enc) <= 4000),
  scopes        text check (scopes is null or char_length(scopes) <= 1000),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  primary key (user_id, provider)
);
alter table public.user_integrations enable row level security;
drop policy if exists "user_integrations_select_own" on public.user_integrations;
create policy "user_integrations_select_own" on public.user_integrations for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.user_integrations from anon, authenticated;
grant select (user_id, provider, account_email, scopes, created_at, updated_at) on public.user_integrations to authenticated;
