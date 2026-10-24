-- GeniusAI Workspace: Invoices & Receipts (GST invoices, quotations, payment receipts)
-- Apply after 202610240011_signature_requests.sql. Safe to run more than once.

-- Part 1: tables
create table if not exists public.invoice_settings (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  business_name text not null default '', address text not null default '',
  state_code text not null default '' check (state_code ~ '^([0-9]{2})?$'),
  gstin text not null default '' check (gstin ~ '^([0-9A-Z]{15})?$'),
  pan text not null default '', phone text not null default '', email text not null default '',
  website text not null default '', logo_png text, signature_png text,
  bank_name text not null default '', account_name text not null default '',
  account_number text not null default '', ifsc text not null default '', upi_id text not null default '',
  terms text not null default '',
  prefix_invoice text not null default 'INV', prefix_quote text not null default 'QT',
  prefix_receipt text not null default 'RCT', accent text not null default '#4f46e5',
  updated_at timestamptz not null default now()
);
create table if not exists public.invoice_customers (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null, address text not null default '',
  state_code text not null default '', gstin text not null default '',
  phone text not null default '', email text not null default '',
  created_at timestamptz not null default now()
);
create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  kind text not null check (kind in ('invoice', 'quotation', 'receipt')),
  fy text not null, seq integer not null check (seq > 0),
  number text not null check (char_length(number) between 1 and 16),
  issue_date date not null, due_date date,
  customer_id uuid references public.invoice_customers(id) on delete set null,
  customer jsonb not null default '{}'::jsonb,
  place_of_supply text not null default '',
  gst boolean not null default true, reverse_charge boolean not null default false,
  items jsonb not null default '[]'::jsonb, extra jsonb not null default '{}'::jsonb,
  notes text not null default '', terms text not null default '',
  total numeric(14, 2) not null default 0, amount_paid numeric(14, 2) not null default 0,
  status text not null default 'draft',
  related_id uuid references public.invoices(id) on delete set null,
  file_id uuid references public.files(id) on delete set null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (workspace_id, kind, fy, seq)
);

-- Part 2: numbering (consecutive per financial year) and locked numbers
create or replace function public.next_invoice_seq(p_workspace uuid, p_kind text, p_fy text)
returns integer language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  if not public.is_workspace_member(p_workspace) then raise exception 'not a member'; end if;
  perform pg_advisory_xact_lock(hashtext(p_workspace::text || p_kind || p_fy));
  select coalesce(max(seq), 0) + 1 into n from public.invoices
    where workspace_id = p_workspace and kind = p_kind and fy = p_fy;
  return n;
end;
$$;
revoke all on function public.next_invoice_seq(uuid, text, text) from public, anon;
grant execute on function public.next_invoice_seq(uuid, text, text) to authenticated;
create or replace function public.invoices_touch() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  if tg_op = 'UPDATE' then
    new.workspace_id := old.workspace_id; new.kind := old.kind; new.fy := old.fy;
    new.seq := old.seq; new.number := old.number; new.created_by := old.created_by;
  end if;
  return new;
end;
$$;
drop trigger if exists invoices_touch on public.invoices;
create trigger invoices_touch before insert or update on public.invoices
  for each row execute function public.invoices_touch();

-- Part 3: security (workspace members only)
alter table public.invoice_settings enable row level security;
alter table public.invoice_customers enable row level security;
alter table public.invoices enable row level security;
drop policy if exists "inv_settings_member" on public.invoice_settings;
create policy "inv_settings_member" on public.invoice_settings for all to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));
drop policy if exists "inv_customers_member" on public.invoice_customers;
create policy "inv_customers_member" on public.invoice_customers for all to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));
drop policy if exists "invoices_member" on public.invoices;
create policy "invoices_member" on public.invoices for all to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));
revoke all on public.invoice_settings from anon;
revoke all on public.invoice_customers from anon;
revoke all on public.invoices from anon;
grant select, insert, update, delete on public.invoice_settings to authenticated;
grant select, insert, update, delete on public.invoice_customers to authenticated;
grant select, insert, update, delete on public.invoices to authenticated;
