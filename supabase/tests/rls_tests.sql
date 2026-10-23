\set ON_ERROR_STOP 1
create or replace function pg_temp.expect_fail(sql text, label text) returns void language plpgsql as $$
begin
  begin execute sql; exception when others then raise notice 'PASS (blocked) %: %', label, sqlerrm; return; end;
  raise exception 'FAIL: % was allowed', label;
end $$;
create or replace function pg_temp.check(cond boolean, label text) returns void language plpgsql as $$
begin if cond then raise notice 'PASS %', label; else raise exception 'FAIL %', label; end if; end $$;
grant execute on all functions in schema pg_temp to authenticated, anon;

-- legacy workspace backfilled
select pg_temp.check((select count(*)=1 from public.workspace_members where workspace_id='11111111-1111-1111-1111-111111111111' and role='owner'), 'legacy owner backfilled');

-- ===== user A
set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000a',false);
insert into public.workspaces(id,name,owner_user_id) values ('22222222-2222-2222-2222-222222222222','A ws','00000000-0000-0000-0000-00000000000a');
select pg_temp.check((select count(*)=1 from public.workspace_members where workspace_id='22222222-2222-2222-2222-222222222222'), 'A sees own membership');
select pg_temp.check((select count(*)=1 from public.credit_accounts where workspace_id='22222222-2222-2222-2222-222222222222'), 'A sees credit account');
select pg_temp.check((select count(*)=2 from public.workspaces), 'A sees both own workspaces');
select pg_temp.expect_fail($q$insert into public.workspaces(name,owner_user_id) values ('x','00000000-0000-0000-0000-00000000000b')$q$, 'create workspace for someone else');
select pg_temp.expect_fail($q$update public.workspaces set owner_user_id='00000000-0000-0000-0000-00000000000b' where id='22222222-2222-2222-2222-222222222222'$q$, 'transfer ownership from client');
update public.workspaces set name='A renamed' where id='22222222-2222-2222-2222-222222222222';
select pg_temp.check((select updated_at > created_at from public.workspaces where id='22222222-2222-2222-2222-222222222222'), 'rename allowed + updated_at bumped');

-- files
insert into public.files(id,workspace_id,uploaded_by,object_key,original_filename,mime_type,byte_size,module_key)
values ('33333333-3333-3333-3333-333333333333','22222222-2222-2222-2222-222222222222','00000000-0000-0000-0000-00000000000a','22222222-2222-2222-2222-222222222222/a.pdf','a.pdf','application/pdf',10,'documents');
select pg_temp.check((select scan_status='pending' from public.files where id='33333333-3333-3333-3333-333333333333'), 'file insert ok, scan pending');
select pg_temp.expect_fail($q$insert into public.files(workspace_id,uploaded_by,object_key,original_filename,mime_type,byte_size,scan_status) values ('22222222-2222-2222-2222-222222222222','00000000-0000-0000-0000-00000000000a','22222222-2222-2222-2222-222222222222/b.pdf','b','x',1,'clean')$q$, 'insert file pre-marked clean');
select pg_temp.expect_fail($q$insert into public.files(workspace_id,uploaded_by,object_key,original_filename,mime_type,byte_size) values ('22222222-2222-2222-2222-222222222222','00000000-0000-0000-0000-00000000000a','other-ws/c.pdf','c','x',1)$q$, 'object_key outside workspace folder');
select pg_temp.expect_fail($q$update public.files set scan_status='clean' where id='33333333-3333-3333-3333-333333333333'$q$, 'mark file clean from client');
select pg_temp.expect_fail($q$update public.files set uploaded_by='00000000-0000-0000-0000-00000000000b' where id='33333333-3333-3333-3333-333333333333'$q$, 'change uploader');
select pg_temp.expect_fail($q$insert into public.files(workspace_id,uploaded_by,object_key,original_filename,mime_type,byte_size,module_key) values ('22222222-2222-2222-2222-222222222222','00000000-0000-0000-0000-00000000000a','22222222-2222-2222-2222-222222222222/d','d','x',1,'bogus')$q$, 'invalid module_key');
update public.files set deleted_at=now(), original_filename='renamed.pdf' where id='33333333-3333-3333-3333-333333333333';
select pg_temp.check((select original_filename='renamed.pdf' from public.files where id='33333333-3333-3333-3333-333333333333'), 'uploader can rename/soft-delete');
select pg_temp.expect_fail($q$insert into public.credit_ledger(workspace_id,entry_kind,amount,balance_delta,reference_key) values ('22222222-2222-2222-2222-222222222222','grant',100,100,'x')$q$, 'client credit grant');

-- ===== user B
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000b',false);
select pg_temp.check((select count(*)=0 from public.workspaces), 'B sees no A workspaces');
select pg_temp.check((select count(*)=0 from public.files), 'B sees no A files');
update public.files set original_filename='pwned' where id='33333333-3333-3333-3333-333333333333';
select pg_temp.expect_fail($q$insert into public.files(workspace_id,uploaded_by,object_key,original_filename,mime_type,byte_size) values ('22222222-2222-2222-2222-222222222222','00000000-0000-0000-0000-00000000000b','22222222-2222-2222-2222-222222222222/z','z','x',1)$q$, 'B inserts into A workspace');

-- workspace limit for B (10 max)
do $$ begin for i in 1..10 loop insert into public.workspaces(name,owner_user_id) values ('b'||i,'00000000-0000-0000-0000-00000000000b'); end loop; end $$;
select pg_temp.expect_fail($q$insert into public.workspaces(name,owner_user_id) values ('b11','00000000-0000-0000-0000-00000000000b')$q$, '11th workspace');

-- ===== anon
reset role; set role anon; select set_config('request.jwt.claim.sub','',false);
select pg_temp.check((select count(*)=1 from public.plan_catalog), 'anon reads active plans');
select pg_temp.check((select count(*)=0 from public.workspaces), 'anon sees no workspaces');
reset role;
select pg_temp.check((select original_filename='renamed.pdf' from public.files where id='33333333-3333-3333-3333-333333333333'), 'B update had no effect');
select pg_temp.check((select count(*)=1 from public.audit_logs where target_id='22222222-2222-2222-2222-222222222222'), 'audit log written');
