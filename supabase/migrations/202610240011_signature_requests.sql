-- GeniusAI Workspace: Request signatures (send a PDF to others to sign by private link)
-- Apply after 202610230010_agreements.sql.
--
-- Workspace members can READ their requests. All writes go through the server
-- (service role) after it has checked who is asking, so signers never need an
-- account and can't touch anything but their own signing link.

create table if not exists public.signature_requests (
  id               uuid primary key default gen_random_uuid(),
  workspace_id     uuid not null references public.workspaces(id) on delete cascade,
  created_by       uuid references auth.users(id) on delete set null,
  sender_name      text not null check (char_length(btrim(sender_name)) between 1 and 120),
  source_file_id   uuid references public.files(id) on delete set null,
  source_object_key text not null,
  document_name    text not null check (char_length(document_name) between 1 and 255),
  original_sha256  text not null check (original_sha256 ~ '^[0-9a-f]{64}$'),
  page_count       integer not null check (page_count between 1 and 2000),
  title            text not null check (char_length(btrim(title)) between 1 and 160),
  message          text check (message is null or char_length(message) <= 1000),
  signing_order    text not null default 'any' check (signing_order in ('any', 'sequential')),
  status           text not null default 'pending'
                     check (status in ('pending', 'finalizing', 'completed', 'declined', 'cancelled', 'expired')),
  completed_file_id uuid references public.files(id) on delete set null,
  completed_object_key text,
  completed_sha256 text,
  expires_at       timestamptz not null,
  completed_at     timestamptz,
  cancelled_at     timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists signature_requests_workspace_idx on public.signature_requests (workspace_id, created_at desc);

create table if not exists public.signature_signers (
  id            uuid primary key default gen_random_uuid(),
  request_id    uuid not null references public.signature_requests(id) on delete cascade,
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  position      integer not null check (position between 1 and 20),
  name          text not null check (char_length(btrim(name)) between 1 and 120),
  email         text check (email is null or char_length(email) <= 254),
  access_token  text not null unique check (char_length(access_token) >= 32),
  fields        jsonb not null default '[]'::jsonb check (jsonb_typeof(fields) = 'array' and pg_column_size(fields) <= 60000),
  status        text not null default 'pending' check (status in ('pending', 'viewed', 'signed', 'declined')),
  typed_name    text check (typed_name is null or char_length(typed_name) <= 120),
  signature_png text check (signature_png is null or char_length(signature_png) <= 600000),
  name_png      text check (name_png is null or char_length(name_png) <= 200000),
  decline_reason text check (decline_reason is null or char_length(decline_reason) <= 500),
  viewed_at     timestamptz,
  signed_at     timestamptz,
  declined_at   timestamptz,
  ip            text,
  user_agent    text,
  created_at    timestamptz not null default now(),
  unique (request_id, position)
);
create index if not exists signature_signers_request_idx on public.signature_signers (request_id, position);

create table if not exists public.signature_events (
  id           uuid primary key default gen_random_uuid(),
  request_id   uuid not null references public.signature_requests(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  signer_id    uuid references public.signature_signers(id) on delete set null,
  event        text not null check (event in ('created', 'link_copied', 'viewed', 'signed', 'declined', 'completed', 'cancelled')),
  ip           text,
  user_agent   text,
  created_at   timestamptz not null default now()
);
create index if not exists signature_events_request_idx on public.signature_events (request_id, created_at);

alter table public.signature_requests enable row level security;
alter table public.signature_signers  enable row level security;
alter table public.signature_events   enable row level security;

-- Read-only for workspace members.
drop policy if exists "signature_requests_select_member" on public.signature_requests;
create policy "signature_requests_select_member" on public.signature_requests
  for select to authenticated using (public.is_workspace_member(workspace_id));
drop policy if exists "signature_signers_select_member" on public.signature_signers;
create policy "signature_signers_select_member" on public.signature_signers
  for select to authenticated using (public.is_workspace_member(workspace_id));
drop policy if exists "signature_events_select_member" on public.signature_events;
create policy "signature_events_select_member" on public.signature_events
  for select to authenticated using (public.is_workspace_member(workspace_id));

revoke all on public.signature_requests from anon, authenticated;
revoke all on public.signature_signers  from anon, authenticated;
revoke all on public.signature_events   from anon, authenticated;
grant select on public.signature_requests to authenticated;
grant select on public.signature_events   to authenticated;
-- The signing link (access_token) and signature images are never readable from the browser;
-- the server hands links only to members of the workspace.
grant select (id, request_id, workspace_id, position, name, email, fields, status, typed_name, decline_reason,
              viewed_at, signed_at, declined_at, ip, user_agent, created_at)
  on public.signature_signers to authenticated;

create or replace function public.signature_requests_touch()
returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end;
$$;
drop trigger if exists signature_requests_touch on public.signature_requests;
create trigger signature_requests_touch before update on public.signature_requests
  for each row execute function public.signature_requests_touch();
