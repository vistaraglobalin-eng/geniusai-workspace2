\set ON_ERROR_STOP 1
create or replace function pg_temp.expect_fail(sql text, label text) returns void language plpgsql as $$
begin
  begin execute sql; exception when others then raise notice 'PASS (blocked) %: %', label, sqlerrm; return; end;
  raise exception 'FAIL: % was allowed', label;
end $$;
create or replace function pg_temp.check(cond boolean, label text) returns void language plpgsql as $$
begin if cond then raise notice 'PASS %', label; else raise exception 'FAIL %', label; end if; end $$;
grant execute on all functions in schema pg_temp to authenticated, anon;

-- Backfill + sign-up trigger
select pg_temp.check((select count(*) = (select count(*) from auth.users) from public.profiles), 'existing users backfilled with profiles');
insert into auth.users(id, email, raw_user_meta_data) values ('00000000-0000-0000-0000-00000000000d','d@example.com','{"full_name":"  Priya Sharma  "}');
select pg_temp.check((select display_name = 'Priya Sharma' from public.profiles where user_id='00000000-0000-0000-0000-00000000000d'), 'new user gets profile with name from sign-up');

-- ===== D onboarding
set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000d',false);
select pg_temp.expect_fail($q$select public.complete_onboarding('', 'WS')$q$, 'blank name');
select pg_temp.expect_fail($q$select public.complete_onboarding('Priya', repeat('x',81))$q$, 'workspace name too long');
select pg_temp.expect_fail($q$select public.complete_onboarding('Priya', 'WS', 'personal', 'rupees')$q$, 'bad currency');
select pg_temp.check((select count(*)=0 from public.workspace_members), 'no workspace created by failed attempts');
select public.complete_onboarding('Priya', 'Priya''s Studio', 'business', 'inr') as ws1 \gset
select pg_temp.check((select count(*)=1 from public.workspaces where id = :'ws1' and kind='business' and default_currency='INR'), 'onboarding creates workspace (currency normalised)');
select pg_temp.check((select role='owner' from public.workspace_members where workspace_id = :'ws1'), 'user is owner');
select pg_temp.check((select available_credits=0 from public.credit_accounts where workspace_id = :'ws1'), 'credit account exists');
select pg_temp.check((select onboarding_completed_at is not null and display_name='Priya' from public.profiles where user_id='00000000-0000-0000-0000-00000000000d'), 'profile marked onboarded');
select public.complete_onboarding('Priya S', 'Another', 'personal', 'USD') as ws2 \gset
select pg_temp.check(:'ws1' = :'ws2', 'second call returns same workspace');
select pg_temp.check((select count(*)=1 from public.workspaces), 'no duplicate workspace');
create temp table if not exists t_upd(n int); grant all on t_upd to authenticated;
with u as (update public.profiles set display_name='hacked' where user_id='00000000-0000-0000-0000-00000000000a' returning 1) insert into t_upd select count(*) from u;
select pg_temp.check((select n=0 from t_upd), 'cannot edit another user''s profile');

-- ===== anon
reset role; set role anon; select set_config('request.jwt.claim.sub','',false);
select pg_temp.expect_fail($q$select public.complete_onboarding('a','b')$q$, 'anon calls onboarding');
select pg_temp.expect_fail($q$select public.is_file_blocked('x')$q$, 'anon calls helper');
reset role;
