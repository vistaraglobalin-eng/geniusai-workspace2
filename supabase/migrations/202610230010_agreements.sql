-- GeniusAI Workspace: Agreement Studio (drafts + automatic version history)
-- Apply after 202610230009_refunds.sql.

create table if not exists public.agreements (
  id                 uuid primary key default gen_random_uuid(),
  workspace_id       uuid not null references public.workspaces(id) on delete cascade,
  created_by         uuid references auth.users(id) on delete set null,
  title              text not null check (char_length(btrim(title)) between 1 and 160),
  template_key       text not null check (template_key ~ '^[a-z0-9_]{2,40}$'),
  inputs             jsonb not null default '{}'::jsonb
                       check (jsonb_typeof(inputs) = 'object' and pg_column_size(inputs) <= 20000),
  content_md         text not null default '' check (char_length(content_md) <= 200000),
  status             text not null default 'draft' check (status in ('draft', 'final')),
  current_version    integer not null default 1,
  last_change_source text not null default 'manual'
                       check (last_change_source in ('ai_generate', 'ai_revise', 'manual', 'restore')),
  last_change_note   text check (last_change_note is null or char_length(last_change_note) <= 300),
  last_change_job_id uuid references public.ai_jobs(id) on delete set null,
  deleted_at         timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists agreements_workspace_updated_idx on public.agreements (workspace_id, updated_at desc) where deleted_at is null;

create table if not exists public.agreement_versions (
  id           uuid primary key default gen_random_uuid(),
  agreement_id uuid not null references public.agreements(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  version      integer not null,
  content_md   text not null,
  source       text not null,
  note         text,
  job_id       uuid references public.ai_jobs(id) on delete set null,
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  unique (agreement_id, version)
);

-- ---------------------------------------------------------------------------
-- Versioning: every content change becomes a numbered version, automatically.
-- ---------------------------------------------------------------------------
create or replace function public.agreements_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Only the server (service role) may label a change as AI-made.
  if current_user in ('authenticated', 'anon') and new.last_change_source in ('ai_generate', 'ai_revise') then
    new.last_change_source := 'manual';
    new.last_change_job_id := null;
  end if;
  if tg_op = 'UPDATE' then
    new.updated_at := now();
    new.workspace_id := old.workspace_id;      -- agreements never move between workspaces
    new.created_by := old.created_by;
    new.template_key := old.template_key;
    if new.content_md is distinct from old.content_md then
      new.current_version := old.current_version + 1;
      -- A note/job belongs to one change only; don't let it carry over to the next edit.
      if new.last_change_note is not distinct from old.last_change_note then new.last_change_note := null; end if;
      if new.last_change_job_id is not distinct from old.last_change_job_id then new.last_change_job_id := null; end if;
    else
      new.current_version := old.current_version;
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.agreements_after_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.content_md is distinct from old.content_md then
    insert into public.agreement_versions (agreement_id, workspace_id, version, content_md, source, note, job_id, created_by)
    values (new.id, new.workspace_id, new.current_version, new.content_md, new.last_change_source,
            new.last_change_note, new.last_change_job_id, (select auth.uid()));
  end if;
  return null;
end;
$$;

drop trigger if exists agreements_before_write on public.agreements;
create trigger agreements_before_write before insert or update on public.agreements
  for each row execute function public.agreements_before_write();
drop trigger if exists agreements_after_write on public.agreements;
create trigger agreements_after_write after insert or update on public.agreements
  for each row execute function public.agreements_after_write();

revoke all on function public.agreements_before_write() from public, anon, authenticated;
revoke all on function public.agreements_after_write() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Access: workspace members can read, create and edit their workspace's agreements.
-- ---------------------------------------------------------------------------
alter table public.agreements enable row level security;
alter table public.agreement_versions enable row level security;

drop policy if exists "agreements_select_member" on public.agreements;
create policy "agreements_select_member" on public.agreements for select to authenticated
  using (public.is_workspace_member(workspace_id));
drop policy if exists "agreements_insert_member" on public.agreements;
create policy "agreements_insert_member" on public.agreements for insert to authenticated
  with check (created_by = (select auth.uid()) and public.is_workspace_member(workspace_id));
drop policy if exists "agreements_update_member" on public.agreements;
create policy "agreements_update_member" on public.agreements for update to authenticated
  using (public.is_workspace_member(workspace_id) and deleted_at is null)
  with check (public.is_workspace_member(workspace_id));

drop policy if exists "agreement_versions_select_member" on public.agreement_versions;
create policy "agreement_versions_select_member" on public.agreement_versions for select to authenticated
  using (public.is_workspace_member(workspace_id));

revoke insert, update, delete on public.agreements from anon, authenticated;
grant insert (workspace_id, created_by, title, template_key, inputs, content_md, status, last_change_source, last_change_note)
  on public.agreements to authenticated;
grant update (title, content_md, status, deleted_at, last_change_source, last_change_note)
  on public.agreements to authenticated;
revoke insert, update, delete on public.agreement_versions from anon, authenticated;
