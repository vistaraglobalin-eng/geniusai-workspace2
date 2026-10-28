\set ON_ERROR_STOP 1
-- Firm playbook (202610280023): members read, editors write, view-only and outsiders blocked, 40-rule limit.
create or replace function pg_temp.expect_fail(sql text, label text) returns void language plpgsql as $$
begin
  begin execute sql; exception when others then raise notice 'PASS (blocked) %: %', label, sqlerrm; return; end;
  raise exception 'FAIL: % was allowed', label;
end $$;
create or replace function pg_temp.check(cond boolean, label text) returns void language plpgsql as $$
begin if cond then raise notice 'PASS %', label; else raise exception 'FAIL %', label; end if; end $$;
grant execute on all functions in schema pg_temp to authenticated, service_role;
select workspace_id as ws from public.workspace_members where user_id='00000000-0000-0000-0000-00000000000d' and role='owner' limit 1 \gset

-- A view-only member of the same workspace (set up as the server would).
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000a1', 'viewer@example.com') on conflict do nothing;
insert into public.workspace_members (workspace_id, user_id, role, access)
values (:'ws', '00000000-0000-0000-0000-0000000000a1', 'member', 'view') on conflict do nothing;

-- Editor (owner) manages rules
set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000d',false);
insert into public.playbook_rules (workspace_id, topic, standard, fallback, severity, position)
values (:'ws', 'Payment terms', 'Payment within 30 days of invoice.', 'Up to 45 days.', 'high', 1);
select pg_temp.check((select count(*)=1 and min(created_by::text)='00000000-0000-0000-0000-00000000000d' from public.playbook_rules where workspace_id=:'ws'), 'editors can add a rule (created_by filled in)');
update public.playbook_rules set standard='Payment within 15 days of invoice.' where workspace_id=:'ws';
select pg_temp.check((select min(standard)='Payment within 15 days of invoice.' from public.playbook_rules where workspace_id=:'ws'), 'editors can change a rule');
do $$ begin
  begin update public.playbook_rules set workspace_id='11111111-1111-1111-1111-111111111111'; exception when others then null; end;
end $$;
select pg_temp.check((select count(*)=1 from public.playbook_rules where workspace_id=:'ws'), 'a rule cannot be moved to another workspace');
select pg_temp.expect_fail(format($q$insert into public.playbook_rules (workspace_id, topic, standard) values (%L, '', 'x')$q$, :'ws'), 'empty topic');
select pg_temp.expect_fail(format($q$insert into public.playbook_rules (workspace_id, topic, standard, severity) values (%L, 'x', 'y', 'urgent')$q$, :'ws'), 'unknown severity');
select pg_temp.expect_fail(format($q$insert into public.playbook_rules (workspace_id, topic, standard) values (%L, 'x', repeat('y', 1001))$q$, :'ws'), 'oversized standard');

-- 40-rule limit
insert into public.playbook_rules (workspace_id, topic, standard) select :'ws', 'Rule ' || g, 'Text ' || g from generate_series(2, 40) g;
select pg_temp.check((select count(*)=40 from public.playbook_rules where workspace_id=:'ws'), 'up to 40 rules allowed');
select pg_temp.expect_fail(format($q$insert into public.playbook_rules (workspace_id, topic, standard) values (%L, 'Rule 41', 'Too many')$q$, :'ws'), 'a 41st rule');
delete from public.playbook_rules where workspace_id=:'ws' and topic like 'Rule %';
select pg_temp.check((select count(*)=1 from public.playbook_rules where workspace_id=:'ws'), 'editors can delete rules');

-- View-only member: reads, cannot write
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false);
select pg_temp.check((select count(*)=1 from public.playbook_rules where workspace_id=:'ws'), 'view-only members can read the playbook');
select pg_temp.expect_fail(format($q$insert into public.playbook_rules (workspace_id, topic, standard) values (%L, 'x', 'y')$q$, :'ws'), 'view-only member adding a rule');
with u as (update public.playbook_rules set standard='changed' where workspace_id=:'ws' returning 1) select pg_temp.check((select count(*)=0 from u), 'view-only member cannot change rules');
with d as (delete from public.playbook_rules where workspace_id=:'ws' returning 1) select pg_temp.check((select count(*)=0 from d), 'view-only member cannot delete rules');

-- Outsider and signed-out visitor
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000b',false);
select pg_temp.check((select count(*)=0 from public.playbook_rules where workspace_id=:'ws'), 'outsiders see no rules');
select pg_temp.expect_fail(format($q$insert into public.playbook_rules (workspace_id, topic, standard) values (%L, 'x', 'y')$q$, :'ws'), 'outsider adding a rule');
reset role;
set role anon;
select pg_temp.expect_fail('select * from public.playbook_rules', 'signed-out visitor reading rules');
reset role;
