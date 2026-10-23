\set ON_ERROR_STOP 1
create or replace function pg_temp.expect_fail(sql text, label text) returns void language plpgsql as $$
begin
  begin execute sql; exception when others then raise notice 'PASS (blocked) %: %', label, sqlerrm; return; end;
  raise exception 'FAIL: % was allowed', label;
end $$;
create or replace function pg_temp.check(cond boolean, label text) returns void language plpgsql as $$
begin if cond then raise notice 'PASS %', label; else raise exception 'FAIL %', label; end if; end $$;
grant execute on all functions in schema pg_temp to authenticated, service_role;
create temp table t_ids(name text primary key, id uuid); grant all on t_ids to authenticated, service_role;
select workspace_id as ws from public.workspace_members where user_id='00000000-0000-0000-0000-00000000000d' and role='owner' limit 1 \gset

-- server creates an AI draft
set role service_role;
with a as (insert into public.agreements (workspace_id, created_by, title, template_key, content_md, last_change_source)
           values (:'ws', '00000000-0000-0000-0000-00000000000d', 'NDA with Acme', 'nda', '# NDA v1', 'ai_generate') returning id)
insert into t_ids select 'a1', id from a;
reset role;
select id as a1 from t_ids where name='a1' \gset
select pg_temp.check((select count(*)=1 and min(version)=1 and min(source)='ai_generate' from public.agreement_versions where agreement_id=:'a1'), 'creating a draft saves version 1 (labelled AI)');

-- member edits manually
set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000d',false);
update public.agreements set content_md='# NDA v2 (edited)', last_change_note='Fixed party name' where id=:'a1';
select pg_temp.check((select current_version=2 from public.agreements where id=:'a1'), 'editing the text bumps the version to 2');
select pg_temp.check((select source='manual' and note='Fixed party name' and created_by='00000000-0000-0000-0000-00000000000d' from public.agreement_versions where agreement_id=:'a1' and version=2), 'version 2 recorded as a manual edit by the user');
update public.agreements set title='NDA with Acme Pvt Ltd' where id=:'a1';
select pg_temp.check((select current_version=2 and (select count(*) from public.agreement_versions where agreement_id=:'a1')=2 from public.agreements where id=:'a1'), 'renaming only does not create a version');
update public.agreements set content_md='# NDA v3', last_change_source='ai_revise' where id=:'a1';
select pg_temp.check((select source='manual' from public.agreement_versions where agreement_id=:'a1' and version=3), 'a user cannot label their own edit as an AI change');
select pg_temp.check((select note is null from public.agreement_versions where agreement_id=:'a1' and version=3), 'an earlier change note does not carry over to the next edit');
select pg_temp.expect_fail($q$update public.agreement_versions set content_md='tampered'$q$, 'editing version history');
select pg_temp.expect_fail($q$insert into public.agreement_versions (agreement_id, workspace_id, version, content_md, source) select id, workspace_id, 99, 'x', 'manual' from public.agreements limit 1$q$, 'inserting fake versions');
select pg_temp.expect_fail(format($q$update public.agreements set workspace_id='11111111-1111-1111-1111-111111111111' where id=%L$q$, :'a1'), 'moving an agreement to another workspace');
insert into public.agreements (workspace_id, created_by, title, template_key, content_md) values (:'ws', '00000000-0000-0000-0000-00000000000d', 'Blank', 'custom', '');
select pg_temp.check((select count(*)=2 from public.agreements where workspace_id=:'ws'), 'members can create agreements in their workspace');
select pg_temp.expect_fail(format($q$insert into public.agreements (workspace_id, created_by, title, template_key) values (%L, '00000000-0000-0000-0000-00000000000b', 'x', 'nda')$q$, :'ws'), 'creating an agreement as someone else');
select pg_temp.expect_fail(format($q$update public.agreements set content_md=repeat('x', 200001) where id=%L$q$, :'a1'), 'oversized content');
update public.agreements set deleted_at=now() where title='Blank';
with u as (update public.agreements set title='revived' where title='Blank' returning 1) insert into t_ids select 'x', null from u;
select pg_temp.check((select count(*)=0 from t_ids where name='x'), 'deleted agreements can no longer be edited');

-- outsider
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000b',false);
select pg_temp.check((select count(*)=0 from public.agreements where workspace_id=:'ws') and (select count(*)=0 from public.agreement_versions where workspace_id=:'ws'), 'outsiders see no agreements or versions');
select pg_temp.expect_fail(format($q$insert into public.agreements (workspace_id, created_by, title, template_key) values (%L, '00000000-0000-0000-0000-00000000000b', 'x', 'nda')$q$, :'ws'), 'outsider creates an agreement in the workspace');
reset role;
