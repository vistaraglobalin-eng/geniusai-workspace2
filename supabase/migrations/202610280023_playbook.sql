-- GeniusAI Workspace: Firm playbook. A workspace's standard contract terms, checked by AI against
-- any contract. Apply after 202610250022_onedrive.sql. Safe to run more than once.
-- Members can read the playbook; only editors can change it.

create table if not exists public.playbook_rules (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  created_by   uuid references auth.users(id) on delete set null default auth.uid(),
  topic        text not null check (char_length(btrim(topic)) between 1 and 80),
  standard     text not null check (char_length(btrim(standard)) between 1 and 1000),
  fallback     text not null default '' check (char_length(fallback) <= 1000),
  severity     text not null default 'medium' check (severity in ('high', 'medium', 'low')),
  position     integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists playbook_rules_ws_idx on public.playbook_rules (workspace_id, position, created_at);
create index if not exists playbook_rules_created_by_idx on public.playbook_rules (created_by);

create or replace function public.playbook_rules_touch()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  if tg_op = 'UPDATE' then
    new.workspace_id := old.workspace_id;   -- rules never move between workspaces
    new.created_by := old.created_by;
  end if;
  return new;
end;
$$;
drop trigger if exists playbook_rules_touch on public.playbook_rules;
create trigger playbook_rules_touch before insert or update on public.playbook_rules
  for each row execute function public.playbook_rules_touch();

-- At most 40 rules per workspace keeps every check within one AI request.
create or replace function public.playbook_rules_limit()
returns trigger language plpgsql set search_path = '' as $$
begin
  if (select count(*) from public.playbook_rules where workspace_id = new.workspace_id) >= 40 then
    raise exception 'playbook_full' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
drop trigger if exists playbook_rules_limit on public.playbook_rules;
create trigger playbook_rules_limit before insert on public.playbook_rules
  for each row execute function public.playbook_rules_limit();

alter table public.playbook_rules enable row level security;
drop policy if exists "playbook_rules_read" on public.playbook_rules;
drop policy if exists "playbook_rules_edit" on public.playbook_rules;
create policy "playbook_rules_read" on public.playbook_rules for select to authenticated
  using (public.is_workspace_member(workspace_id));
create policy "playbook_rules_edit" on public.playbook_rules for all to authenticated
  using (public.is_workspace_editor(workspace_id))
  with check (public.is_workspace_editor(workspace_id));
revoke all on public.playbook_rules from anon;
grant select, insert, update, delete on public.playbook_rules to authenticated;
