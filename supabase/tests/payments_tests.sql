\set ON_ERROR_STOP 1
create or replace function pg_temp.expect_fail(sql text, label text) returns void language plpgsql as $$
begin
  begin execute sql; exception when others then raise notice 'PASS (blocked) %: %', label, sqlerrm; return; end;
  raise exception 'FAIL: % was allowed', label;
end $$;
create or replace function pg_temp.check(cond boolean, label text) returns void language plpgsql as $$
begin if cond then raise notice 'PASS %', label; else raise exception 'FAIL %', label; end if; end $$;
grant execute on all functions in schema pg_temp to anon, authenticated, service_role;

select workspace_id as ws from public.workspace_members where user_id='00000000-0000-0000-0000-00000000000d' and role='owner' limit 1 \gset
select available_credits as before from public.credit_accounts where workspace_id=:'ws' \gset

-- anon can see prices (pricing page); nobody but the server can change them
set role anon;
select pg_temp.check((select count(*)=3 and min(price_minor)=19900 from public.credit_packs), 'signed-out visitors can see the 3 active packs');
reset role;

-- server creates an order
set role service_role;
insert into public.payment_orders (workspace_id, user_id, pack_key, credits, amount_minor, currency, provider_order_id)
values (:'ws', '00000000-0000-0000-0000-00000000000d', 'standard', 2000, 69900, 'INR', 'order_TEST1');
select pg_temp.expect_fail($q$select public.fulfil_payment('order_TEST1', 'pay_X', 100, 'INR')$q$, 'amount different from the order');
select pg_temp.expect_fail($q$select public.fulfil_payment('order_TEST1', 'pay_X', 69900, 'USD')$q$, 'currency different from the order');
select pg_temp.expect_fail($q$select public.fulfil_payment('order_NOPE', 'pay_X', 69900, 'INR')$q$, 'unknown order');
select pg_temp.check((select public.fulfil_payment('order_TEST1', 'pay_A1', 69900, 'inr')->>'status' = 'credited'), 'valid payment credits the order');
select pg_temp.check((select public.fulfil_payment('order_TEST1', 'pay_A1', 69900, 'INR')->>'status' = 'already_credited'), 'same payment again (callback + webhook) is a no-op');
select pg_temp.expect_fail($q$select public.fulfil_payment('order_TEST1', 'pay_OTHER', 69900, 'INR')$q$, 'a second, different payment for a paid order');
reset role;
select pg_temp.check((select available_credits = :before + 2000 from public.credit_accounts where workspace_id=:'ws'), '2000 credits added exactly once');
select pg_temp.check((select count(*)=1 from public.credit_ledger where reference_key='payment:pay_A1' and entry_kind='grant'), 'one ledger grant for the payment');
select pg_temp.check((select status='paid' and provider_payment_id='pay_A1' and paid_at is not null from public.payment_orders where provider_order_id='order_TEST1'), 'order marked paid');
select pg_temp.check((select count(*)=1 from public.audit_logs where action_key='billing.credits_purchased'), 'purchase written to audit log');
select pg_temp.check((select sum(balance_delta) = (select available_credits from public.credit_accounts where workspace_id=:'ws') from public.credit_ledger where workspace_id=:'ws'), 'ledger still adds up to the balance');

set role service_role;
insert into public.payment_orders (workspace_id, user_id, pack_key, credits, amount_minor, currency, provider_order_id)
values (:'ws', '00000000-0000-0000-0000-00000000000d', 'starter', 500, 19900, 'INR', 'order_TEST2');
select public.mark_payment_failed('order_TEST2', 'payment.failed');
reset role;
select pg_temp.check((select status='failed' from public.payment_orders where provider_order_id='order_TEST2'), 'failed payment recorded, no credits');

-- members see their workspace's orders; others don't; nobody writes from the browser
set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000d',false);
select pg_temp.check((select count(*)=2 from public.payment_orders where workspace_id=:'ws'), 'member sees purchase history');
select pg_temp.expect_fail(format($q$insert into public.payment_orders (workspace_id, pack_key, credits, amount_minor, currency, provider_order_id) values (%L,'pro',6000,1,'INR','order_FAKE')$q$, :'ws'), 'user creates a fake cheap order');
select pg_temp.expect_fail($q$update public.payment_orders set status='paid' where provider_order_id='order_TEST2'$q$, 'user marks an order paid');
select pg_temp.expect_fail($q$select public.fulfil_payment('order_TEST2', 'pay_ME', 19900, 'INR')$q$, 'user calls fulfil_payment');
select pg_temp.expect_fail($q$update public.credit_packs set price_minor=100 where pack_key='pro'$q$, 'user changes a price');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000b',false);
select pg_temp.check((select count(*)=0 from public.payment_orders where workspace_id=:'ws'), 'outsider sees no purchases');
reset role;
