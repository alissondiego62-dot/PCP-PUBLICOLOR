begin;

alter table public.orders
  add column if not exists consultant_name text;

create table if not exists public.order_change_history (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  changed_by uuid null references auth.users(id) on delete set null,
  field_name text not null,
  old_value text null,
  new_value text null,
  change_group text not null default 'order_edit',
  created_at timestamptz not null default now()
);

create index if not exists idx_order_change_history_order_id
  on public.order_change_history(order_id);

create index if not exists idx_order_change_history_created_at
  on public.order_change_history(created_at desc);

alter table public.order_change_history enable row level security;

drop policy if exists order_change_history_read_authenticated
  on public.order_change_history;

create policy order_change_history_read_authenticated
on public.order_change_history
for select
to authenticated
using (true);

grant select on public.order_change_history to authenticated;

create or replace function public.log_order_field_changes()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user uuid := auth.uid();
begin
  if old.op_number is distinct from new.op_number then
    insert into public.order_change_history(order_id, changed_by, field_name, old_value, new_value)
    values (new.id, v_user, 'op_number', old.op_number, new.op_number);
  end if;

  if old.client_name is distinct from new.client_name then
    insert into public.order_change_history(order_id, changed_by, field_name, old_value, new_value)
    values (new.id, v_user, 'client_name', old.client_name, new.client_name);
  end if;

  if old.description is distinct from new.description then
    insert into public.order_change_history(order_id, changed_by, field_name, old_value, new_value)
    values (new.id, v_user, 'description', old.description, new.description);
  end if;

  if old.delivery_date is distinct from new.delivery_date then
    insert into public.order_change_history(order_id, changed_by, field_name, old_value, new_value)
    values (new.id, v_user, 'delivery_date', old.delivery_date::text, new.delivery_date::text);
  end if;

  if old.priority is distinct from new.priority then
    insert into public.order_change_history(order_id, changed_by, field_name, old_value, new_value)
    values (new.id, v_user, 'priority', old.priority::text, new.priority::text);
  end if;

  if old.sector_id is distinct from new.sector_id then
    insert into public.order_change_history(order_id, changed_by, field_name, old_value, new_value, change_group)
    values (new.id, v_user, 'sector_id', old.sector_id::text, new.sector_id::text, 'production');
  end if;

  if old.status is distinct from new.status then
    insert into public.order_change_history(order_id, changed_by, field_name, old_value, new_value, change_group)
    values (new.id, v_user, 'status', old.status::text, new.status::text, 'production');
  end if;

  if old.notes is distinct from new.notes then
    insert into public.order_change_history(order_id, changed_by, field_name, old_value, new_value)
    values (new.id, v_user, 'notes', old.notes, new.notes);
  end if;

  if old.consultant_name is distinct from new.consultant_name then
    insert into public.order_change_history(order_id, changed_by, field_name, old_value, new_value)
    values (new.id, v_user, 'consultant_name', old.consultant_name, new.consultant_name);
  end if;

  if old.installation_scheduled_at is distinct from new.installation_scheduled_at then
    insert into public.order_change_history(order_id, changed_by, field_name, old_value, new_value, change_group)
    values (new.id, v_user, 'installation_scheduled_at', old.installation_scheduled_at::text, new.installation_scheduled_at::text, 'installation');
  end if;

  if old.installation_address is distinct from new.installation_address then
    insert into public.order_change_history(order_id, changed_by, field_name, old_value, new_value, change_group)
    values (new.id, v_user, 'installation_address', old.installation_address, new.installation_address, 'installation');
  end if;

  if old.installation_team is distinct from new.installation_team then
    insert into public.order_change_history(order_id, changed_by, field_name, old_value, new_value, change_group)
    values (new.id, v_user, 'installation_team', old.installation_team, new.installation_team, 'installation');
  end if;

  if old.installation_vehicle is distinct from new.installation_vehicle then
    insert into public.order_change_history(order_id, changed_by, field_name, old_value, new_value, change_group)
    values (new.id, v_user, 'installation_vehicle', old.installation_vehicle, new.installation_vehicle, 'installation');
  end if;

  if old.installation_status is distinct from new.installation_status then
    insert into public.order_change_history(order_id, changed_by, field_name, old_value, new_value, change_group)
    values (new.id, v_user, 'installation_status', old.installation_status, new.installation_status, 'installation');
  end if;

  return new;
end;
$$;

drop trigger if exists trg_log_order_field_changes on public.orders;

create trigger trg_log_order_field_changes
after update on public.orders
for each row
execute function public.log_order_field_changes();

update public.orders
set consultant_name = nullif(
  trim(substring(notes from 'Consultor:[[:space:]]*([^\n\r]+)')),
  ''
)
where consultant_name is null
  and notes ~* 'Consultor:';

commit;
