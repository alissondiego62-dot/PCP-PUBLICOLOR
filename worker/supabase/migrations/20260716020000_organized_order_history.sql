begin;

-- Evita duplicidade: movimentações de setor/status e agendamentos já são
-- registrados em order_history pelo gatilho operacional principal.
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

  if old.materials is distinct from new.materials then
    insert into public.order_change_history(order_id, changed_by, field_name, old_value, new_value)
    values (new.id, v_user, 'materials', old.materials, new.materials);
  end if;

  if old.notes is distinct from new.notes then
    insert into public.order_change_history(order_id, changed_by, field_name, old_value, new_value)
    values (new.id, v_user, 'notes', old.notes, new.notes);
  end if;

  if old.consultant_name is distinct from new.consultant_name then
    insert into public.order_change_history(order_id, changed_by, field_name, old_value, new_value)
    values (new.id, v_user, 'consultant_name', old.consultant_name, new.consultant_name);
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

  if old.installation_notes is distinct from new.installation_notes then
    insert into public.order_change_history(order_id, changed_by, field_name, old_value, new_value, change_group)
    values (new.id, v_user, 'installation_notes', old.installation_notes, new.installation_notes, 'installation');
  end if;

  if old.installation_completed_at is distinct from new.installation_completed_at then
    insert into public.order_change_history(order_id, changed_by, field_name, old_value, new_value, change_group)
    values (
      new.id,
      v_user,
      'installation_completed_at',
      old.installation_completed_at::text,
      new.installation_completed_at::text,
      'installation'
    );
  end if;

  return new;
end;
$$;

-- O gatilho já existe nas instalações anteriores; a recriação garante que
-- também funcione em bancos montados a partir de um estado parcial.
drop trigger if exists trg_log_order_field_changes on public.orders;
create trigger trg_log_order_field_changes
after update on public.orders
for each row
execute function public.log_order_field_changes();

commit;
