\set ON_ERROR_STOP 1
create or replace function pg_temp.expect_fail(sql text, label text) returns void language plpgsql as $$
begin
  begin execute sql; exception when others then raise notice 'PASS (blocked) %: %', label, sqlerrm; return; end;
  raise exception 'FAIL: % was allowed', label;
end $$;
create or replace function pg_temp.check(cond boolean, label text) returns void language plpgsql as $$
begin if cond then raise notice 'PASS %', label; else raise exception 'FAIL %', label; end if; end $$;
grant execute on all functions in schema pg_temp to authenticated;

set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000d',false);
update public.profiles set preferences = '{"theme":"dark","accent":"emerald","text":"large","motion":"reduce"}' where user_id='00000000-0000-0000-0000-00000000000d';
select pg_temp.check((select preferences->>'accent'='emerald' from public.profiles where user_id='00000000-0000-0000-0000-00000000000d'), 'user saves own preferences');
select pg_temp.expect_fail($q$update public.profiles set preferences='{"theme":"neon"}' where user_id='00000000-0000-0000-0000-00000000000d'$q$, 'unknown theme value');
select pg_temp.expect_fail($q$update public.profiles set preferences='[1,2]' where user_id='00000000-0000-0000-0000-00000000000d'$q$, 'preferences not an object');
select pg_temp.expect_fail(format($q$update public.profiles set preferences=jsonb_build_object('x', %L) where user_id='00000000-0000-0000-0000-00000000000d'$q$, repeat('a', 2000)), 'oversized preferences');
update public.profiles set display_name='Priya R' where user_id='00000000-0000-0000-0000-00000000000d';
select pg_temp.check((select display_name='Priya R' from public.profiles where user_id='00000000-0000-0000-0000-00000000000d'), 'user renames self');
select pg_temp.expect_fail($q$update public.profiles set display_name='   ' where user_id='00000000-0000-0000-0000-00000000000d'$q$, 'blank display name');
select pg_temp.expect_fail($q$update public.profiles set onboarding_completed_at=null where user_id='00000000-0000-0000-0000-00000000000d'$q$, 'user edits onboarding flag');
select pg_temp.expect_fail($q$insert into public.profiles(user_id) values ('00000000-0000-0000-0000-00000000000e')$q$, 'client inserts a profile');
create temp table if not exists t_pref(n int); grant all on t_pref to authenticated;
with u as (update public.profiles set preferences='{"theme":"light"}' where user_id='00000000-0000-0000-0000-00000000000a' returning 1) insert into t_pref select count(*) from u;
select pg_temp.check((select n=0 from t_pref), 'cannot change another user''s preferences');
-- workspace rename: owner yes
select workspace_id as ws from public.workspace_members where user_id='00000000-0000-0000-0000-00000000000d' and role='owner' limit 1 \gset
update public.workspaces set name='Priya Studio' where id=:'ws';
select pg_temp.check((select name='Priya Studio' from public.workspaces where id=:'ws'), 'owner renames workspace');
reset role;
-- plain member cannot rename
insert into public.workspace_members(workspace_id,user_id,role) values (:'ws','00000000-0000-0000-0000-00000000000b','member');
set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000b',false);
with u as (update public.workspaces set name='Hijacked' where id=:'ws' returning 1) insert into t_pref select count(*) from u;
reset role;
select pg_temp.check((select name='Priya Studio' from public.workspaces where id=:'ws'), 'member cannot rename workspace');
delete from public.workspace_members where workspace_id=:'ws' and user_id='00000000-0000-0000-0000-00000000000b';
