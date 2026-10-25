-- GeniusAI Workspace: comments on files with @mentions, and a personal inbox of notifications.
-- Apply after 202610250018_spaces.sql. Members read comments; you read only your own notifications.
-- All writes go through the server.

create table if not exists public.file_comments (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  file_id      uuid not null references public.files(id) on delete cascade,
  parent_id    uuid references public.file_comments(id) on delete cascade,
  author_id    uuid references auth.users(id) on delete set null,
  author_name  text not null check (char_length(author_name) between 1 and 120),
  body         text not null check (char_length(btrim(body)) between 1 and 2000),
  mentions     uuid[] not null default '{}',
  page         integer check (page is null or page between 1 and 2000),
  resolved_at  timestamptz,
  edited_at    timestamptz,
  created_at   timestamptz not null default now()
);
create index if not exists file_comments_file_idx on public.file_comments (file_id, created_at);

create table if not exists public.notifications (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  kind         text not null check (kind in ('mention', 'reply')),
  actor_name   text not null check (char_length(actor_name) <= 120),
  file_id      uuid references public.files(id) on delete cascade,
  comment_id   uuid references public.file_comments(id) on delete cascade,
  snippet      text check (snippet is null or char_length(snippet) <= 200),
  read_at      timestamptz,
  created_at   timestamptz not null default now()
);
create index if not exists notifications_user_idx on public.notifications (user_id, workspace_id, created_at desc);

alter table public.file_comments enable row level security;
alter table public.notifications enable row level security;
drop policy if exists "file_comments_select_member" on public.file_comments;
create policy "file_comments_select_member" on public.file_comments for select to authenticated using (public.is_workspace_member(workspace_id));
drop policy if exists "notifications_select_own" on public.notifications;
create policy "notifications_select_own" on public.notifications for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.file_comments from anon, authenticated;
revoke all on public.notifications from anon, authenticated;
grant select on public.file_comments to authenticated;
grant select on public.notifications to authenticated;
