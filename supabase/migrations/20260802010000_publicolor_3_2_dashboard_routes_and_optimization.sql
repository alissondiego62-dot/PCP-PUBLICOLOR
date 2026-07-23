-- Publicolor PCP 3.2.0
-- Otimizações de banco, edição sincronizada de materiais e consultas operacionais.

begin;

-- Índices direcionados às páginas independentes. Todos usam IF NOT EXISTS para
-- permitir execução segura em bancos já parcialmente atualizados.
create index if not exists orders_active_sector_status_idx
  on public.orders(sector_id, status, delivery_date, position)
  where status <> 'completed';

create index if not exists orders_active_delivery_idx
  on public.orders(delivery_date, priority, sector_id)
  where status <> 'completed';

create index if not exists orders_installation_schedule_idx
  on public.orders(installation_scheduled_at, installation_status)
  where installation_scheduled_at is not null;

create index if not exists orders_client_active_idx
  on public.orders(client_id, status, created_at desc)
  where client_id is not null;

create index if not exists activities_open_group_due_idx
  on public.activities(group_id, due_at, position)
  where completed = false;

create index if not exists activities_order_type_status_idx
  on public.activities(order_id, activity_type, activity_status, updated_at desc)
  where order_id is not null;

create index if not exists activities_parent_open_idx
  on public.activities(parent_id, completed, position)
  where parent_id is not null;

create index if not exists order_materials_order_availability_status_idx
  on public.order_materials(order_id, availability, purchase_status, created_at)
  where availability = 'unavailable';

create index if not exists order_history_order_created_idx
  on public.order_history(order_id, created_at desc);

create index if not exists order_history_recent_idx
  on public.order_history(created_at desc);

create index if not exists order_change_history_order_created_idx
  on public.order_change_history(order_id, created_at desc);

create index if not exists order_files_active_order_created_idx
  on public.order_files(order_id, created_at desc)
  where removed_from_order_at is null;

-- Renomeia somente o material realmente vinculado à atividade informada. A
-- função permanece SECURITY INVOKER para respeitar as políticas RLS da tabela.
create or replace function public.rename_linked_order_material(
  p_activity_id uuid,
  p_material_name text
)
returns table (
  material_id uuid,
  order_id uuid,
  material_name text
)
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_name text := trim(coalesce(p_material_name, ''));
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.' using errcode = '42501';
  end if;

  if v_name = '' then
    raise exception 'O nome do material não pode ficar vazio.' using errcode = '22023';
  end if;

  return query
  update public.order_materials m
  set material_name = v_name,
      updated_at = now()
  from public.activities a
  where a.id = p_activity_id
    and a.activity_type = 'material_purchase'
    and a.order_material_id = m.id
  returning m.id, m.order_id, m.material_name;

  if not found then
    raise exception 'Atividade de compra sem material vinculado.' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.rename_linked_order_material(uuid, text) from public;
revoke all on function public.rename_linked_order_material(uuid, text) from anon;
grant execute on function public.rename_linked_order_material(uuid, text) to authenticated;

-- Garante que alterações externas no material continuem refletidas no título da
-- subatividade, inclusive importações e correções feitas diretamente na OS.
create or replace function public.keep_purchase_activity_title_in_sync()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  if pg_trigger_depth() > 1 or old.material_name is not distinct from new.material_name then
    return new;
  end if;

  update public.activities
  set title = trim(new.material_name),
      updated_at = now()
  where order_material_id = new.id
    and activity_type = 'material_purchase'
    and title is distinct from trim(new.material_name);

  return new;
end;
$$;

revoke all on function public.keep_purchase_activity_title_in_sync() from public;
revoke all on function public.keep_purchase_activity_title_in_sync() from anon;
revoke all on function public.keep_purchase_activity_title_in_sync() from authenticated;

drop trigger if exists order_materials_keep_activity_title on public.order_materials;
create trigger order_materials_keep_activity_title
after update of material_name on public.order_materials
for each row execute function public.keep_purchase_activity_title_in_sync();

alter table public.activities replica identity full;
alter table public.order_materials replica identity full;

notify pgrst, 'reload schema';

commit;
