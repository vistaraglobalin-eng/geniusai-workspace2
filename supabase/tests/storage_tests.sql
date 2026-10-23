\set ON_ERROR_STOP 1
create or replace function pg_temp.expect_fail(sql text, label text) returns void language plpgsql as $$
begin
  begin execute sql; exception when others then raise notice 'PASS (blocked) %: %', label, sqlerrm; return; end;
  raise exception 'FAIL: % was allowed', label;
end $$;
create or replace function pg_temp.check(cond boolean, label text) returns void language plpgsql as $$
begin if cond then raise notice 'PASS %', label; else raise exception 'FAIL %', label; end if; end $$;
grant execute on all functions in schema pg_temp to authenticated;

-- Setup (as admin): workspace W owned by A; C is a plain member.
insert into public.workspaces(id,name,owner_user_id) values ('44444444-4444-4444-4444-444444444444','W','00000000-0000-0000-0000-00000000000a');
insert into public.workspace_members(workspace_id,user_id,role) values ('44444444-4444-4444-4444-444444444444','00000000-0000-0000-0000-00000000000c','member');
select pg_temp.check((select public = false and file_size_limit = 26214400 from storage.buckets where id='private-user-files'), 'bucket is private with 25 MB limit');

-- ===== A (owner)
set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000a',false);
insert into storage.objects(bucket_id,name) values ('private-user-files','44444444-4444-4444-4444-444444444444/00000000-0000-0000-0000-00000000000a/f1-report.pdf');
insert into storage.objects(bucket_id,name) values ('private-user-files','44444444-4444-4444-4444-444444444444/00000000-0000-0000-0000-00000000000a/f2-notes.pdf');
insert into storage.objects(bucket_id,name) values ('private-user-files','44444444-4444-4444-4444-444444444444/00000000-0000-0000-0000-00000000000a/f3-bad.pdf');
select pg_temp.check((select count(*)=3 from storage.objects), 'owner uploads into own folder');
select pg_temp.expect_fail($q$insert into storage.objects(bucket_id,name) values ('private-user-files','44444444-4444-4444-4444-444444444444/00000000-0000-0000-0000-00000000000c/x.pdf')$q$, 'upload into another user''s folder');
select pg_temp.expect_fail($q$insert into storage.objects(bucket_id,name) values ('private-user-files','44444444-4444-4444-4444-444444444444/00000000-0000-0000-0000-00000000000a/sub/x.pdf')$q$, 'path too deep');
select pg_temp.expect_fail($q$insert into storage.objects(bucket_id,name) values ('private-user-files','44444444-4444-4444-4444-444444444444/x.pdf')$q$, 'path too shallow');
select pg_temp.expect_fail($q$insert into storage.objects(bucket_id,name) values ('private-user-files','not-a-uuid/00000000-0000-0000-0000-00000000000a/x.pdf')$q$, 'malformed workspace folder');
insert into public.files(workspace_id,uploaded_by,object_key,original_filename,mime_type,byte_size)
values ('44444444-4444-4444-4444-444444444444','00000000-0000-0000-0000-00000000000a','44444444-4444-4444-4444-444444444444/00000000-0000-0000-0000-00000000000a/f3-bad.pdf','bad.pdf','application/pdf',1);
select pg_temp.expect_fail($q$insert into public.files(workspace_id,uploaded_by,object_key,original_filename,mime_type,byte_size) values ('44444444-4444-4444-4444-444444444444','00000000-0000-0000-0000-00000000000a','44444444-4444-4444-4444-444444444444/00000000-0000-0000-0000-00000000000c/y.pdf','y','x',1)$q$, 'file record pointing at another user''s folder');

-- ===== B (outsider)
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000b',false);
select pg_temp.check((select count(*)=0 from storage.objects), 'outsider cannot see workspace files');
select pg_temp.expect_fail($q$insert into storage.objects(bucket_id,name) values ('private-user-files','44444444-4444-4444-4444-444444444444/00000000-0000-0000-0000-00000000000b/x.pdf')$q$, 'outsider uploads into workspace');
delete from storage.objects;

-- ===== C (plain member)
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000c',false);
select pg_temp.check((select count(*)=3 from storage.objects), 'member can read workspace files');
delete from storage.objects where name like '%f1-report.pdf';
update storage.objects set name = name || '.x' where name like '%f2-notes.pdf';
insert into storage.objects(bucket_id,name) values ('private-user-files','44444444-4444-4444-4444-444444444444/00000000-0000-0000-0000-00000000000c/c1.pdf');
reset role;
select pg_temp.check((select count(*)=4 from storage.objects), 'outsider delete had no effect; member cannot delete/overwrite owner files; member uploads own');
select pg_temp.check((select count(*)=1 from storage.objects where name like '%f2-notes.pdf'), 'member overwrite of owner file had no effect');

-- quarantine f3 and promote C to admin (server-side actions)
update public.files set scan_status='quarantined' where object_key like '%f3-bad.pdf';
update public.workspace_members set role='admin' where user_id='00000000-0000-0000-0000-00000000000c';

set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000a',false);
select pg_temp.check((select count(*)=0 from storage.objects where name like '%f3-bad.pdf'), 'quarantined file cannot be downloaded');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000c',false);
delete from storage.objects where name like '%f1-report.pdf';
reset role;
select pg_temp.check((select count(*)=0 from storage.objects where name like '%f1-report.pdf'), 'admin can delete others'' files');
