-- GeniusAI Workspace: buying credit packs (Razorpay)
-- Apply after 202610230007_more_file_types.sql.
--
-- Flow: the server creates a Razorpay order for a pack (price always taken from
-- this table, never from the browser) and records it here. When Razorpay
-- confirms the payment (browser callback after signature + status checks, or the
-- webhook), the server calls fulfil_payment(), which marks the order paid and
-- grants the credits exactly once, however many times it is called.

-- ---------------------------------------------------------------------------
-- 1. Credit packs (prices in paise, GST inclusive)
-- ---------------------------------------------------------------------------
create table if not exists public.credit_packs (
  pack_key     text primary key check (pack_key ~ '^[a-z0-9_-]{2,40}$'),
  display_name text not null,
  description  text,
  credits      bigint not null check (credits > 0),
  price_minor  bigint not null check (price_minor >= 100),
  currency     char(3) not null default 'INR',
  active       boolean not null default true,
  highlight    boolean not null default false,
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
alter table public.credit_packs enable row level security;
drop policy if exists "credit_packs_read_active" on public.credit_packs;
create policy "credit_packs_read_active" on public.credit_packs for select to anon, authenticated using (active = true);
revoke insert, update, delete on public.credit_packs from anon, authenticated;
create trigger credit_packs_set_updated_at before update on public.credit_packs for each row execute function public.set_updated_at();

-- PLACEHOLDER PRICES: review before launch. Change with e.g.
--   update public.credit_packs set price_minor = 24900 where pack_key = 'starter';
insert into public.credit_packs (pack_key, display_name, description, credits, price_minor, highlight, sort_order) values
  ('starter',  'Starter',  'About 15 document summaries',  500,   19900, false, 1),
  ('standard', 'Standard', 'About 60 document summaries',  2000,  69900, true,  2),
  ('pro',      'Pro',      'About 180 document summaries', 6000, 179900, false, 3)
on conflict (pack_key) do nothing;

-- ---------------------------------------------------------------------------
-- 2. Payment orders
-- ---------------------------------------------------------------------------
create table if not exists public.payment_orders (
  id                  uuid primary key default gen_random_uuid(),
  workspace_id        uuid not null references public.workspaces(id) on delete restrict, -- keep payment records
  user_id             uuid references auth.users(id) on delete set null,
  pack_key            text not null references public.credit_packs(pack_key),
  credits             bigint not null check (credits > 0),
  amount_minor        bigint not null check (amount_minor > 0),
  currency            char(3) not null,
  provider            text not null default 'razorpay',
  provider_order_id   text not null unique,
  provider_payment_id text unique,
  status              text not null default 'created' check (status in ('created', 'paid', 'failed')),
  failure_reason      text,
  created_at          timestamptz not null default now(),
  paid_at             timestamptz
);
create index if not exists payment_orders_workspace_created_idx on public.payment_orders (workspace_id, created_at desc);
alter table public.payment_orders enable row level security;
drop policy if exists "payment_orders_select_member" on public.payment_orders;
create policy "payment_orders_select_member" on public.payment_orders for select to authenticated using (public.is_workspace_member(workspace_id));
revoke insert, update, delete on public.payment_orders from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Fulfilment (server only)
-- ---------------------------------------------------------------------------
create or replace function public.fulfil_payment(
  p_provider_order_id text,
  p_payment_id        text,
  p_amount_minor      bigint,
  p_currency          text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.payment_orders%rowtype;
begin
  select * into o from public.payment_orders where provider_order_id = p_provider_order_id for update;
  if not found then
    raise exception 'order_not_found' using errcode = 'P0002';
  end if;

  if o.status = 'paid' then
    if o.provider_payment_id = p_payment_id then
      return jsonb_build_object('status', 'already_credited', 'credits', o.credits, 'workspace_id', o.workspace_id);
    end if;
    raise exception 'order_paid_by_another_payment' using errcode = 'P0001';
  end if;

  if p_amount_minor is distinct from o.amount_minor or upper(p_currency) is distinct from o.currency then
    raise exception 'amount_mismatch' using errcode = 'P0001'; -- never credit a different amount
  end if;

  update public.payment_orders
     set status = 'paid', provider_payment_id = p_payment_id, paid_at = now(), failure_reason = null
   where id = o.id;

  perform public.grant_credits(o.workspace_id, o.credits, 'payment:' || p_payment_id,
                               'Bought ' || o.credits || ' credits', o.user_id);

  insert into public.audit_logs (workspace_id, actor_user_id, action_key, target_type, target_id, metadata)
  values (o.workspace_id, o.user_id, 'billing.credits_purchased', 'payment_order', o.id::text,
          jsonb_build_object('credits', o.credits, 'amount_minor', o.amount_minor, 'currency', o.currency));

  return jsonb_build_object('status', 'credited', 'credits', o.credits, 'workspace_id', o.workspace_id);
end;
$$;

create or replace function public.mark_payment_failed(p_provider_order_id text, p_reason text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.payment_orders
     set status = 'failed', failure_reason = left(coalesce(p_reason, 'failed'), 120)
   where provider_order_id = p_provider_order_id and status = 'created';
$$;

revoke all on function public.fulfil_payment(text, text, bigint, text) from public, anon, authenticated;
revoke all on function public.mark_payment_failed(text, text) from public, anon, authenticated;
grant execute on function public.fulfil_payment(text, text, bigint, text) to service_role;
grant execute on function public.mark_payment_failed(text, text) to service_role;

-- Members can read their workspace's credit history (already allowed by credit_ledger_select_member).
