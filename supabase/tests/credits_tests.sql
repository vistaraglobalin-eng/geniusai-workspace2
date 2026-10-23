\set ON_ERROR_STOP 1
create or replace function pg_temp.expect_fail(sql text, label text) returns void language plpgsql as $$
begin
  begin execute sql; exception when others then raise notice 'PASS (blocked) %: %', label, sqlerrm; return; end;
  raise exception 'FAIL: % was allowed', label;
end $$;
create or replace function pg_temp.check(cond boolean, label text) returns void language plpgsql as $$
begin if cond then raise notice 'PASS %', label; else raise exception 'FAIL %', label; end if; end $$;
grant execute on all functions in schema pg_temp to authenticated, service_role;

-- D's workspace from onboarding tests
select workspace_id as ws from public.workspace_members where user_id='00000000-0000-0000-0000-00000000000d' \gset
select pg_temp.check((select available_credits=200 from public.credit_accounts where workspace_id=:'ws'), 'existing workspace received 200 welcome credits');
select pg_temp.check((select count(*)=1 from public.credit_ledger where reference_key='welcome:'||:'ws'), 'welcome grant recorded once in ledger');
select pg_temp.check((select public.grant_credits(:'ws', 200, 'welcome:'||:'ws') = false), 'repeat welcome grant is ignored');
insert into public.workspaces(name, owner_user_id) values ('Fresh', '00000000-0000-0000-0000-00000000000d');
select pg_temp.check((select available_credits=200 from public.credit_accounts a join public.workspaces w on w.id=a.workspace_id where w.name='Fresh'), 'new workspace gets welcome credits');

insert into public.files(id,workspace_id,uploaded_by,object_key,original_filename,mime_type,byte_size)
values ('55555555-5555-5555-5555-555555555555', :'ws','00000000-0000-0000-0000-00000000000d', :'ws'||'/00000000-0000-0000-0000-00000000000d/x.pdf','x.pdf','application/pdf',100);

-- ===== signed-in user cannot drive jobs/credits directly
set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000d',false);
select pg_temp.expect_fail(format($q$select * from public.start_ai_job('00000000-0000-0000-0000-00000000000d', %L, 'documents','summary', null, 'key-12345678', 1)$q$, :'ws'), 'user calls start_ai_job');
select pg_temp.expect_fail(format($q$select public.grant_credits(%L, 1000, 'free-money')$q$, :'ws'), 'user grants self credits');
select pg_temp.expect_fail($q$select * from public.app_settings$q$, 'user reads app settings');
reset role;

-- ===== server (service role)
set role service_role;
select job_id as j1 from public.start_ai_job('00000000-0000-0000-0000-00000000000d', :'ws', 'documents', 'summary',
  array['55555555-5555-5555-5555-555555555555']::uuid[], 'req-aaaaaaaa', 30, '{"x":1}', 'anthropic', 'claude-sonnet-5-5') \gset
select pg_temp.check((select available_credits=170 and reserved_credits=30 from public.credit_accounts where workspace_id=:'ws'), 'start reserves 30 (200 -> 170 available, 30 reserved)');
select pg_temp.check((select job_id=:'j1' and created=false from public.start_ai_job('00000000-0000-0000-0000-00000000000d', :'ws', 'documents', 'summary', null, 'req-aaaaaaaa', 30)), 'retry with same key returns same job, no new reservation');
select pg_temp.check((select available_credits=170 from public.credit_accounts where workspace_id=:'ws'), 'balance unchanged by retry');
select pg_temp.check((select public.complete_ai_job(:'j1', 12, '{"text":"ok"}', 9000, 600, 15000) = 12), 'complete charges actual 12');
select pg_temp.check((select available_credits=188 and reserved_credits=0 from public.credit_accounts where workspace_id=:'ws'), 'unused 18 returned (188 available)');
select pg_temp.check((select status='succeeded' and charged_credits=12 and result->>'text'='ok' from public.ai_jobs where id=:'j1'), 'job saved as succeeded with result');
select pg_temp.expect_fail(format($q$select public.complete_ai_job(%L, 1, '{}')$q$, :'j1'), 'completing twice');
select pg_temp.check((select count(*)=1 from public.usage_events where job_id=:'j1'), 'usage event recorded');

select job_id as j2 from public.start_ai_job('00000000-0000-0000-0000-00000000000d', :'ws', 'documents', 'translate', null, 'req-bbbbbbbb', 50) \gset
select pg_temp.check((select public.complete_ai_job(:'j2', 999, '{}') = 50), 'charge is capped at the reservation');
select job_id as j3 from public.start_ai_job('00000000-0000-0000-0000-00000000000d', :'ws', 'documents', 'summary', null, 'req-cccccccc', 40) \gset
select public.fail_ai_job(:'j3', 'provider_error');
select pg_temp.check((select available_credits=138 and reserved_credits=0 from public.credit_accounts where workspace_id=:'ws'), 'failed job refunds in full (188-50 = 138)');
select public.fail_ai_job(:'j3', 'provider_error');
select pg_temp.check((select available_credits=138 from public.credit_accounts where workspace_id=:'ws'), 'failing twice does not refund twice');

select pg_temp.expect_fail(format($q$select * from public.start_ai_job('00000000-0000-0000-0000-00000000000d', %L, 'documents','summary', null, 'req-dddddddd', 139)$q$, :'ws'), 'job costing more than balance');
select pg_temp.expect_fail(format($q$select * from public.start_ai_job('00000000-0000-0000-0000-00000000000b', %L, 'documents','summary', null, 'req-eeeeeeee', 1)$q$, :'ws'), 'non-member starts job in workspace');
select pg_temp.expect_fail(format($q$select * from public.start_ai_job('00000000-0000-0000-0000-00000000000d', %L, 'documents','summary', array['33333333-3333-3333-3333-333333333333']::uuid[], 'req-ffffffff', 1)$q$, :'ws'), 'job using a file from another workspace');

-- crashed job: reservation is released automatically by the next start
select job_id as j4 from public.start_ai_job('00000000-0000-0000-0000-00000000000d', :'ws', 'documents', 'summary', null, 'req-gggggggg', 100) \gset
reset role; update public.ai_jobs set started_at = now() - interval '20 minutes' where id=:'j4'; set role service_role;
select job_id as j5 from public.start_ai_job('00000000-0000-0000-0000-00000000000d', :'ws', 'documents', 'summary', null, 'req-hhhhhhhh', 130) \gset
select pg_temp.check((select status='failed' and safe_error_code='timeout' from public.ai_jobs where id=:'j4'), 'stale job marked failed (timeout)');
select pg_temp.check((select available_credits=8 and reserved_credits=130 from public.credit_accounts where workspace_id=:'ws'), 'stale reservation released, new one held');
reset role;
select pg_temp.check((select sum(balance_delta) = (select available_credits from public.credit_accounts where workspace_id=:'ws') from public.credit_ledger where workspace_id=:'ws'), 'ledger adds up to the available balance');

-- ===== member can read jobs, outsider cannot
set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000d',false);
select pg_temp.check((select count(*)>=5 from public.ai_jobs where workspace_id=:'ws'), 'member sees workspace jobs');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000b',false);
select pg_temp.check((select count(*)=0 from public.ai_jobs where workspace_id=:'ws'), 'outsider sees no jobs');
reset role;
