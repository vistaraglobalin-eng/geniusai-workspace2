-- GeniusAI Workspace: record signing reminders and signer changes in the request history.
-- Apply after 202610240016_team.sql.
alter table public.signature_events drop constraint if exists signature_events_event_check;
alter table public.signature_events add constraint signature_events_event_check
  check (event in ('created', 'link_copied', 'viewed', 'signed', 'declined', 'completed', 'cancelled', 'reminded', 'reassigned'));
