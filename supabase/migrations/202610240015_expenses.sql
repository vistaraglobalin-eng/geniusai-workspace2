-- GeniusAI Workspace: Expense tracker. Safe to run more than once.
create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  spent_on date not null,
  amount numeric(14,2) not null check (amount > 0 and amount < 1000000000),
  category text not null check (char_length(category) between 1 and 60),
  vendor text not null default '' check (char_length(vendor) <= 120),
  payment_mode text not null default '' check (char_length(payment_mode) <= 30),
  gst_amount numeric(14,2) not null default 0 check (gst_amount >= 0),
  vendor_gstin text not null default '' check (char_length(vendor_gstin) <= 15),
  note text not null default '' check (char_length(note) <= 500),
  bill_file_id uuid references public.files(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint expenses_gst_not_more check (gst_amount <= amount)
);
create index if not exists expenses_ws_date_idx on public.expenses (workspace_id, spent_on desc);
create index if not exists expenses_bill_idx on public.expenses (bill_file_id);
create index if not exists expenses_created_by_idx on public.expenses (created_by);
alter table public.expenses enable row level security;
drop policy if exists "expenses_member" on public.expenses;
create policy "expenses_member" on public.expenses for all to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));
revoke all on public.expenses from anon;
grant select, insert, update, delete on public.expenses to authenticated;
