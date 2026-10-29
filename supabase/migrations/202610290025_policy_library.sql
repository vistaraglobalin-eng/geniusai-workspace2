-- GeniusAI Workspace: company policy Q&A. Apply after 202610290024_space_shares.sql. Safe to run more than once.
--
-- 1. An admin marks a space (e.g. "HR Policies") as the policy library.
-- 2. View-only members (usually employees) may ask questions about that library: the AI job type
--    'policy_qa' is allowed for them. The server picks the files (only from policy-library spaces)
--    and limits questions per person per day, so this can't be used as general AI access.

alter table public.spaces add column if not exists is_policy_library boolean not null default false;

create or replace function public.block_view_only()
returns trigger language plpgsql security definer set search_path = '' as $$
declare who uuid := coalesce(to_jsonb(new) ->> 'requested_by', to_jsonb(new) ->> 'created_by')::uuid;
begin
  -- Policy questions are open to everyone in the workspace, including view-only employees.
  if tg_table_name = 'ai_jobs' and (to_jsonb(new) ->> 'task_type') = 'policy_qa' then
    return new;
  end if;
  if who is not null and exists (
    select 1 from public.workspace_members wm where wm.workspace_id = new.workspace_id and wm.user_id = who and wm.access = 'view'
  ) then
    raise exception 'view_only' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function public.block_view_only() from public;
