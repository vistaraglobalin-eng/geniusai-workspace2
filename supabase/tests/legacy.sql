-- simulate state before migration 2: a workspace with no owner membership, and the seeded plan
insert into public.plan_catalog(plan_key, display_name) values ('starter','Starter');
insert into public.workspaces(id, name, owner_user_id) values ('11111111-1111-1111-1111-111111111111','Legacy','00000000-0000-0000-0000-00000000000a');
