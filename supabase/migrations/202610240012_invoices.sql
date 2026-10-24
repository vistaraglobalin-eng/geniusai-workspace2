-- GeniusAI Workspace: Invoices & Receipts (GST invoices, quotations, payment receipts)
-- Apply after 202610240011_signature_requests.sql.
-- Workspace members can read and write their own workspace's records (row-level security).

create table if not exists public.invoice_settings (
  workspace_id    uuid primary key references public.workspaces(id) on delete cascade,
  business_name   text not null default '' check (char_length(business_name) <= 160),
  address         text not null default '' check (char_length(address) <= 500),
  state_code      text not null default '' check (state_code ~ '^([0-9]{2})?$'),
  gstin           text not null default '' check (gstin ~ '^([0-9A-Z]{15})?$'),
  pan             text not null default '' check (char_length(pan) <= 10),
  phone           text not null default '' check (char_length(phone) <= 40),
  email           text not null default '' check (char_length(email) <= 254),
  website         text not null default '' check (char_length(website) <= 200),
  logo_png        text check (logo_png is null or char_length(logo_png) <= 400000),
  signature_png   text check (signature_png is null or char_length(signature_png) <= 400000),
  bank_name       text not null default '' check (char_length(bank_name) <= 120),
  account_name    text not null default '' check (char_length(account_name) <= 120),
  account_number  text not null default '' check (char_length(account_number) <= 40),
  ifsc            text not null default '' check (char_length(ifsc) <= 20),
  upi_id          text not null default '' check (char_length(upi_id) <= 100),
  terms           text not null default '' check (char_length(terms) <= 2000),
  prefix_invoice  text not null default 'INV' check (prefix_invoice ~ '^[A-Za-z0-9-]{1,6}$'),
  prefix_quote    text not null default 'QT' check (prefix_quote ~ '^[A-Za-z0-9-]{1,6}$'),
  prefix_receipt  text not null default 'RCT' check (prefix_receipt ~ '^[A-Za-z0-9-]{1,6}$'),
  accent          text not null default '#4f46e5' check (accent ~ '^#[0-9a-fA-F]{6}$'),
  updated_at      timestamptz not null default now()
);

create table if not exists public.invoice_customers (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  name          text not null check (char_length(btrim(name)) between 1 and 160),
  address       text not null default '' check (char_length(address) <= 500),
  state_code    text not null default '' check (state_code ~ '^([0-9]{2})?$'),
  gstin         text not null default '' check (gstin ~ '^([0-9A-Z]{15})?$'),
  phone         text not null default '' check (char_length(phone) <= 40),
  email         text not null default '' check (char_length(email) <= 254),
  created_at    timestamptz not null default now()
);
create index if not exists invoice_customers_ws_idx on public.invoice_customers (workspace_id, name);

create table if not exists public.invoices (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces(id) on delete cascade,
  created_by      uuid references auth.users(id) on delete set null,
  kind            text not null check (kind in ('invoice', 'quotation', 'receipt')),
  fy              text not null check (fy ~ '^[0-9]{2}-[0-9]{2}$'),
  seq             integer not null check (seq > 0),
  number          text not null check (char_length(number) between 1 and 16),
  issue_date      date not null,
  due_date        date,
  customer_id     uuid references public.invoice_customers(id) on delete set null,
  customer        jsonb not null default '{}'::jsonb check (jsonb_typeof(customer) = 'object' and pg_column_size(customer) <= 4000),
  place_of_supply text not null default '' check (place_of_supply ~ '^([0-9]{2})?$'),
  gst             boolean not null default true,
  reverse_charge  boolean not null default false,
  items           jsonb not null default '[]'::jsonb check (jsonb_typeof(items) = 'array' and pg_column_size(items) <= 200000),
  extra           jsonb not null default '{}'::jsonb check (jsonb_typeof(extra) = 'object' and pg_column_size(extra) <= 20000),
  notes           text not null default '' check (char_length(notes) <= 2000),
  terms           text not null default '' check (char_length(terms) <= 2000),
  total           numeric(14, 2) not null default 0,
  amount_paid     numeric(14, 2) not null default 0,
  status          text not null default 'draft'
                    check (status in ('draft', 'unpaid', 'partly_paid', 'paid', 'cancelled', 'sent', 'accepted', 'declined', 'issued')),
  related_id      uuid references public.invoices(id) on delete set null,
  file_id         uuid references public.files(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (workspace_id, kind, fy, seq)
);
create index if not exists invoices_ws_kind_idx on public.invoices (workspace_id, kind, issue_date desc);

-- Next serial number for a document type in a financial year (e.g. INV/26-27/0007).
-- GST needs consecutive numbers that are unique within the financial year.
create or replace function public.next_invoice_seq(p_workspace uuid, p_kind text, p_fy text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare n integer;
begin
  if not public.is_workspace_member(p_workspace) then raise exception 'not a member'; end if;
  perform pg_advisory_xact_lock(hashtext(p_workspace::text || p_kind || p_fy));
  select coalesce(max(seq), 0) + 1 into n from public.invoices where workspace_id = p_workspace and kind = p_kind and fy = p_fy;
  return n;
end;
$$;
revoke all on function public.next_invoice_seq(uuid, text, text) from public, anon;
grant execute on function public.next_invoice_seq(uuid, text, text) to authenticated;

create or replace function public.invoices_touch()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  if tg_op = 'UPDATE' then
    new.workspace_id := old.workspace_id; new.kind := old.kind; new.fy := old.fy; new.seq := old.seq; new.number := old.number;
    new.created_by := old.created_by;
  end if;
  return new;
end;
$$;
drop trigger if exists invoices_touch on public.invoices;
create trigger invoices_touch before insert or update on public.invoices for each row execute function public.invoices_touch();
create or replace function public.invoice_settings_touch()
returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end;
$$;
drop trigger if exists invoice_settings_touch on public.invoice_settings;
create trigger invoice_settings_touch before insert or update on public.invoice_settings for each row execute function public.invoice_settings_touch();

-- Row-level security: members of the workspace only.
alter table public.invoice_settings  enable row level security;
alter table public.invoice_customers enable row level security;
alter table public.invoices          enable row level security;

drop policy if exists "invoice_settings_member" on public.invoice_settings;
create policy "invoice_settings_member" on public.invoice_settings for all to authenticated
  using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));
drop policy if exists "invoice_customers_member" on public.invoice_customers;
create policy "invoice_customers_member" on public.invoice_customers for all to authenticated
  using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));
drop policy if exists "invoices_member" on public.invoices;
create policy "invoices_member" on public.invoices for all to authenticated
  using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));

revoke all on public.invoice_settings, public.invoice_customers, public.invoices from anon;
grant select, insert, update, delete on public.invoice_settings, public.invoice_customers, public.invoices to authenticated;
