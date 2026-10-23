\set ON_ERROR_STOP 1
create or replace function pg_temp.expect_fail(sql text, label text) returns void language plpgsql as $$
begin
  begin execute sql; exception when others then raise notice 'PASS (blocked) %: %', label, sqlerrm; return; end;
  raise exception 'FAIL: % was allowed', label;
end $$;
create or replace function pg_temp.check(cond boolean, label text) returns void language plpgsql as $$
begin if cond then raise notice 'PASS %', label; else raise exception 'FAIL %', label; end if; end $$;
grant execute on all functions in schema pg_temp to authenticated, service_role;
select workspace_id as ws from public.payment_orders where provider_order_id='order_TEST1' \gset
select available_credits as before from public.credit_accounts where workspace_id=:'ws' \gset

set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000d',false);
select pg_temp.expect_fail($q$select public.process_refund('order_TEST1')$q$, 'users cannot refund themselves');
reset role;

set role service_role;
select pg_temp.expect_fail($q$select public.process_refund('order_TEST2')$q$, 'refunding a failed (unpaid) order');
select pg_temp.check((select public.process_refund('order_TEST1', 'unused pack')->>'status' = 'refunded'), 'unused paid pack refunded');
select pg_temp.check((select public.process_refund('order_TEST1')->>'status' = 'already_refunded'), 'refunding twice is a no-op');
reset role;
select pg_temp.check((select available_credits = :before - 2000 from public.credit_accounts where workspace_id=:'ws'), 'the pack''s 2000 credits removed once');
select pg_temp.check((select status='refunded' and refunded_at is not null from public.payment_orders where provider_order_id='order_TEST1'), 'order marked refunded');
select pg_temp.check((select sum(balance_delta) = (select available_credits from public.credit_accounts where workspace_id=:'ws') from public.credit_ledger where workspace_id=:'ws'), 'ledger still adds up');

-- a pack whose credits were spent can't be refunded
set role service_role;
insert into public.payment_orders (workspace_id, user_id, pack_key, credits, amount_minor, currency, provider_order_id) values (:'ws', '00000000-0000-0000-0000-00000000000d', 'pro', 6000, 179900, 'INR', 'order_TEST3');
select public.fulfil_payment('order_TEST3', 'pay_C3', 179900, 'INR');
reset role;
update public.credit_accounts set available_credits = available_credits - 5900 where workspace_id=:'ws'; -- simulate spending
set role service_role;
select pg_temp.expect_fail($q$select public.process_refund('order_TEST3')$q$, 'refund after the credits were used');
reset role;
select pg_temp.check((select status='paid' from public.payment_orders where provider_order_id='order_TEST3'), 'used pack stays paid');
