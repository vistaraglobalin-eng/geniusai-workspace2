-- GeniusAI Workspace: refunding unused credit packs
-- Apply after 202610230008_payments.sql.
--
-- How to refund (matches the Refund & Cancellation Policy):
--   1. Issue the refund in the Razorpay Dashboard (Payments → the payment → Refund).
--   2. In the Supabase SQL editor run:
--        select public.process_refund('order_XXXXXXXX', 'Customer request: unused pack');
--      It removes the pack's credits and marks the order refunded. It refuses if the
--      workspace no longer has that many credits available (i.e. they were used).

alter table public.payment_orders drop constraint if exists payment_orders_status_check;
alter table public.payment_orders add constraint payment_orders_status_check
  check (status in ('created', 'paid', 'failed', 'refunded'));
alter table public.payment_orders add column if not exists refunded_at timestamptz;

create or replace function public.process_refund(p_provider_order_id text, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  o    public.payment_orders%rowtype;
  acct public.credit_accounts%rowtype;
begin
  select * into o from public.payment_orders where provider_order_id = p_provider_order_id for update;
  if not found then
    raise exception 'order_not_found' using errcode = 'P0002';
  end if;
  if o.status = 'refunded' then
    return jsonb_build_object('status', 'already_refunded', 'credits', o.credits);
  end if;
  if o.status <> 'paid' then
    raise exception 'order_not_paid' using errcode = 'P0001';
  end if;

  select * into acct from public.credit_accounts where workspace_id = o.workspace_id for update;
  if acct.available_credits < o.credits then
    raise exception 'credits_already_used' using errcode = 'P0001',
      detail = format('pack=%s available=%s', o.credits, acct.available_credits);
  end if;

  update public.credit_accounts set available_credits = available_credits - o.credits where workspace_id = o.workspace_id;

  insert into public.credit_ledger (workspace_id, actor_user_id, entry_kind, amount, balance_delta, reference_key, description)
  values (o.workspace_id, null, 'refund', o.credits, -o.credits, 'refund:' || o.provider_order_id,
          'Refunded: ' || o.credits || ' credits');

  update public.payment_orders set status = 'refunded', refunded_at = now(), failure_reason = left(p_reason, 120) where id = o.id;

  insert into public.audit_logs (workspace_id, actor_user_id, action_key, target_type, target_id, metadata)
  values (o.workspace_id, null, 'billing.refunded', 'payment_order', o.id::text,
          jsonb_build_object('credits', o.credits, 'amount_minor', o.amount_minor, 'reason', p_reason));

  return jsonb_build_object('status', 'refunded', 'credits', o.credits, 'amount_minor', o.amount_minor);
end;
$$;

revoke all on function public.process_refund(text, text) from public, anon, authenticated;
grant execute on function public.process_refund(text, text) to service_role;
