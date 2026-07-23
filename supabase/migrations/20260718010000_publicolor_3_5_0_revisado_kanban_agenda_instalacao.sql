-- PUBLICOLOR PCP 3.5.0 REVISADO
-- Configuração do Kanban e fluxo Produção Concluída -> Agenda -> Instalação.
-- Esta migração é idempotente e também corrige uma aplicação parcial do 3.5.0 anterior.

begin;

-- -----------------------------------------------------------------------------
-- 1. Configuração dos setores
-- -----------------------------------------------------------------------------

alter table public.sectors
  add column if not exists uses_status boolean not null default true,
  add column if not exists requires_scheduling boolean not null default false,
  add column if not exists show_in_agenda boolean not null default false,
  add column if not exists allow_manual_move boolean not null default true,
  add column if not exists special_type text,
  add column if not exists color text,
  add column if not exists icon text;

alter table public.sectors drop constraint if exists sectors_special_type_check;
alter table public.sectors
  add constraint sectors_special_type_check
  check (special_type is null or special_type in ('production_completed', 'installation'));

alter table public.sectors drop constraint if exists sectors_color_check;
alter table public.sectors
  add constraint sectors_color_check
  check (color is null or color ~ '^#[0-9A-Fa-f]{6}$');

-- Corrige possíveis duplicidades deixadas por uma execução parcial anterior.
with duplicated as (
  select id,
         row_number() over (partition by special_type order by active desc, position, id) as row_number
  from public.sectors
  where special_type is not null
)
update public.sectors s
set special_type = null
from duplicated d
where s.id = d.id
  and d.row_number > 1;

create unique index if not exists sectors_special_type_unique_idx
  on public.sectors (special_type)
  where special_type is not null;

create index if not exists sectors_active_position_idx
  on public.sectors (active, position, name);

-- Remove a regra anterior antes de reorganizar os registros existentes.
drop trigger if exists orders_enforce_installation_schedule on public.orders;
drop trigger if exists orders_enforce_special_sector_flow on public.orders;
drop function if exists public.enforce_installation_schedule();
drop function if exists public.enforce_special_sector_flow();

do $$
declare
  v_installation_id uuid;
  v_production_completed_id uuid;
  v_installation_position integer;
begin
  select id, position
  into v_installation_id, v_installation_position
  from public.sectors
  where special_type = 'installation'
     or public.normalize_publicolor_text(name) = 'INSTALACAO'
  order by case when special_type = 'installation' then 0 else 1 end,
           active desc,
           position
  limit 1;

  if v_installation_id is null then
    select coalesce(max(position), 0) + 1
    into v_installation_position
    from public.sectors;

    insert into public.sectors (
      name, position, active, uses_status, requires_scheduling,
      show_in_agenda, allow_manual_move, special_type, color
    ) values (
      'INSTALAÇÃO', v_installation_position, true, false, true,
      true, true, 'installation', '#2563EB'
    ) returning id into v_installation_id;
  else
    update public.sectors
    set name = 'INSTALAÇÃO',
        active = true,
        uses_status = false,
        requires_scheduling = true,
        show_in_agenda = true,
        allow_manual_move = true,
        special_type = 'installation',
        color = coalesce(color, '#2563EB')
    where id = v_installation_id;
  end if;

  select id
  into v_production_completed_id
  from public.sectors
  where special_type = 'production_completed'
     or public.normalize_publicolor_text(name) in ('PRODUCAO CONCLUIDA', 'PRODUCAO FINALIZADA')
  order by case when special_type = 'production_completed' then 0 else 1 end,
           active desc,
           position
  limit 1;

  if v_production_completed_id is null then
    insert into public.sectors (
      name, position, active, uses_status, requires_scheduling,
      show_in_agenda, allow_manual_move, special_type, color
    ) values (
      'PRODUÇÃO CONCLUÍDA', v_installation_position, true, false, false,
      true, true, 'production_completed', '#16A34A'
    ) returning id into v_production_completed_id;
  else
    update public.sectors
    set name = 'PRODUÇÃO CONCLUÍDA',
        active = true,
        uses_status = false,
        requires_scheduling = false,
        show_in_agenda = true,
        allow_manual_move = true,
        special_type = 'production_completed',
        color = coalesce(color, '#16A34A')
    where id = v_production_completed_id;
  end if;

  -- Reordena sem criar posições duplicadas: Produção Concluída fica imediatamente
  -- antes de Instalação e os demais setores preservam sua ordem relativa.
  with ranked as (
    select id,
           row_number() over (
             order by
               case
                 when id = v_production_completed_id then v_installation_position::numeric - 0.5
                 when id = v_installation_id then v_installation_position::numeric
                 else position::numeric
               end,
               case when id = v_production_completed_id then 0 when id = v_installation_id then 1 else 2 end,
               name,
               id
           )::integer as new_position
    from public.sectors
  )
  update public.sectors s
  set position = ranked.new_position
  from ranked
  where s.id = ranked.id;

  -- Solicitação operacional: todos os pedidos que estavam em Instalação voltam,
  -- por ora, para Produção Concluída. Datas anteriores são preservadas apenas como
  -- referência, mas precisam ser confirmadas novamente na Agenda.
  update public.orders
  set sector_id = v_production_completed_id,
      status = 'waiting',
      installation_status = 'pending',
      installation_time_confirmed = false,
      updated_at = now()
  where sector_id = v_installation_id
    and status <> 'completed';

  update public.orders
  set status = 'waiting',
      installation_status = 'pending',
      installation_time_confirmed = false,
      updated_at = now()
  where sector_id = v_production_completed_id
    and status <> 'completed';
end
$$;

-- -----------------------------------------------------------------------------
-- 2. Regras de segurança dos setores
-- -----------------------------------------------------------------------------

alter table public.sectors enable row level security;

drop policy if exists sectors_read_authenticated on public.sectors;
create policy sectors_read_authenticated
on public.sectors for select to authenticated
using ((select auth.uid()) is not null);

-- Políticas permissivas necessárias para a operação normal.
drop policy if exists sectors_operation_insert on public.sectors;
create policy sectors_operation_insert
on public.sectors for insert to authenticated
with check ((select private.has_app_permission('settings.operation')));

drop policy if exists sectors_operation_update on public.sectors;
create policy sectors_operation_update
on public.sectors for update to authenticated
using ((select private.has_app_permission('settings.operation')))
with check ((select private.has_app_permission('settings.operation')));

drop policy if exists sectors_operation_delete on public.sectors;
create policy sectors_operation_delete
on public.sectors for delete to authenticated
using ((select private.has_app_permission('settings.operation')));

-- Políticas restritivas impedem que uma política antiga e ampla contorne a permissão.
drop policy if exists sectors_operation_insert_restrictive on public.sectors;
create policy sectors_operation_insert_restrictive
on public.sectors as restrictive for insert to authenticated
with check ((select private.has_app_permission('settings.operation')));

drop policy if exists sectors_operation_update_restrictive on public.sectors;
create policy sectors_operation_update_restrictive
on public.sectors as restrictive for update to authenticated
using ((select private.has_app_permission('settings.operation')))
with check ((select private.has_app_permission('settings.operation')));

drop policy if exists sectors_operation_delete_restrictive on public.sectors;
create policy sectors_operation_delete_restrictive
on public.sectors as restrictive for delete to authenticated
using ((select private.has_app_permission('settings.operation')));

grant select, insert, update, delete on public.sectors to authenticated;

-- A Agenda também precisa conseguir atualizar os campos da OS.
drop policy if exists orders_permission_update on public.orders;
create policy orders_permission_update
on public.orders as restrictive for update to authenticated
using (
  (select private.has_app_permission('orders.edit'))
  or (select private.has_app_permission('production.move'))
  or (select private.has_app_permission('orders.finalize'))
  or (select private.has_app_permission('agenda.manage'))
)
with check (
  (select private.has_app_permission('orders.edit'))
  or (select private.has_app_permission('production.move'))
  or (select private.has_app_permission('orders.finalize'))
  or (select private.has_app_permission('agenda.manage'))
);

-- -----------------------------------------------------------------------------
-- 3. Regra obrigatória de agendamento
-- -----------------------------------------------------------------------------

create or replace function public.enforce_special_sector_flow()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_target_special_type text;
  v_target_uses_status boolean;
  v_previous_special_type text;
begin
  select special_type, uses_status
  into v_target_special_type, v_target_uses_status
  from public.sectors
  where id = new.sector_id;

  if tg_op = 'UPDATE' then
    select special_type
    into v_previous_special_type
    from public.sectors
    where id = old.sector_id;
  end if;

  if new.status <> 'completed' and v_target_special_type = 'installation' then
    if new.installation_scheduled_at is null
       or coalesce(new.installation_time_confirmed, false) is not true then
      raise exception 'Defina e confirme a data e a hora antes de mover o pedido para Instalação.'
        using errcode = '23514';
    end if;
    new.status := 'waiting';
    new.installation_status := case
      when new.installation_status in ('in_progress', 'completed') then new.installation_status
      else 'scheduled'
    end;
  elsif new.status <> 'completed' and v_target_special_type = 'production_completed' then
    new.status := 'waiting';
    new.installation_status := 'pending';
    new.installation_time_confirmed := false;
  elsif new.status <> 'completed' and coalesce(v_target_uses_status, true) is false then
    new.status := 'waiting';
  end if;

  if tg_op = 'UPDATE'
     and new.status <> 'completed'
     and v_previous_special_type = 'installation'
     and v_target_special_type is distinct from 'installation' then
    new.installation_status := 'pending';
    new.installation_time_confirmed := false;
  end if;

  return new;
end;
$$;

create trigger orders_enforce_special_sector_flow
before insert or update of sector_id, status, installation_scheduled_at,
  installation_time_confirmed, installation_status
on public.orders
for each row execute function public.enforce_special_sector_flow();

-- -----------------------------------------------------------------------------
-- 4. Agendamento atômico de um pedido ou de uma pilha
-- -----------------------------------------------------------------------------

create or replace function private.schedule_orders_for_installation(
  p_order_ids uuid[],
  p_scheduled_at timestamptz,
  p_team text,
  p_vehicle text,
  p_address text,
  p_notes text
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_order_ids uuid[];
  v_installation_id uuid;
  v_expected integer;
  v_updated integer;
begin
  if (select auth.uid()) is null
     or not private.has_app_permission('agenda.manage') then
    raise exception 'Você não possui permissão para gerenciar a Agenda.'
      using errcode = '42501';
  end if;

  if p_scheduled_at is null then
    raise exception 'A data e a hora da instalação são obrigatórias.'
      using errcode = '23514';
  end if;

  select array_agg(distinct value)
  into v_order_ids
  from unnest(coalesce(p_order_ids, array[]::uuid[])) as u(value);

  if coalesce(cardinality(v_order_ids), 0) = 0 then
    raise exception 'Nenhum pedido foi informado para o agendamento.'
      using errcode = '22023';
  end if;

  select id
  into v_installation_id
  from public.sectors
  where special_type = 'installation'
    and active is true
  limit 1;

  if v_installation_id is null then
    raise exception 'O setor especial Instalação não está ativo.'
      using errcode = '23514';
  end if;

  select count(*)
  into v_expected
  from public.orders
  where id = any(v_order_ids)
    and status <> 'completed';

  if v_expected <> cardinality(v_order_ids) then
    raise exception 'Um ou mais pedidos não existem ou já foram concluídos.'
      using errcode = '23514';
  end if;

  update public.orders
  set sector_id = v_installation_id,
      status = 'waiting',
      installation_scheduled_at = p_scheduled_at,
      installation_status = 'scheduled',
      installation_time_confirmed = true,
      installation_team = coalesce(nullif(trim(p_team), ''), installation_team),
      installation_vehicle = coalesce(nullif(trim(p_vehicle), ''), installation_vehicle),
      installation_address = coalesce(nullif(trim(p_address), ''), installation_address),
      installation_notes = coalesce(nullif(trim(p_notes), ''), installation_notes),
      installation_completed_at = null,
      updated_at = now()
  where id = any(v_order_ids)
    and status <> 'completed';

  get diagnostics v_updated = row_count;

  if v_updated <> cardinality(v_order_ids) then
    raise exception 'Nem todos os pedidos puderam ser agendados.'
      using errcode = 'P0001';
  end if;

  insert into public.order_history (order_id, action_type, description, user_id)
  select id,
         'installation_scheduled',
         format(
           'Instalação agendada para %s e pedido movido para Instalação.',
           to_char(p_scheduled_at at time zone 'America/Manaus', 'DD/MM/YYYY HH24:MI')
         ),
         (select auth.uid())
  from public.orders
  where id = any(v_order_ids);

  return v_updated;
end;
$$;

revoke all on function private.schedule_orders_for_installation(uuid[], timestamptz, text, text, text, text)
from public, anon;
grant execute on function private.schedule_orders_for_installation(uuid[], timestamptz, text, text, text, text)
to authenticated;

create or replace function public.schedule_orders_for_installation(
  p_order_ids uuid[],
  p_scheduled_at timestamptz,
  p_team text,
  p_vehicle text,
  p_address text,
  p_notes text
)
returns integer
language sql
security definer
set search_path = pg_catalog, public, private
as $$
  select private.schedule_orders_for_installation(
    p_order_ids, p_scheduled_at, p_team, p_vehicle, p_address, p_notes
  )
$$;

revoke all on function public.schedule_orders_for_installation(uuid[], timestamptz, text, text, text, text)
from public, anon;
grant execute on function public.schedule_orders_for_installation(uuid[], timestamptz, text, text, text, text)
to authenticated;

-- -----------------------------------------------------------------------------
-- 5. Reordenação segura dos setores pelo endpoint administrativo
-- -----------------------------------------------------------------------------

create or replace function public.reorder_kanban_sectors(p_sector_ids uuid[])
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_total integer;
  v_distinct_total integer;
  v_existing_total integer;
begin
  v_total := coalesce(cardinality(p_sector_ids), 0);
  if v_total = 0 then
    raise exception 'A lista de setores não pode ficar vazia.' using errcode = '22023';
  end if;

  select count(distinct value) into v_distinct_total
  from unnest(p_sector_ids) as u(value);
  if v_distinct_total <> v_total then
    raise exception 'A lista de setores possui identificadores repetidos.' using errcode = '22023';
  end if;

  select count(*) into v_existing_total
  from public.sectors
  where id = any(p_sector_ids);
  if v_existing_total <> v_total then
    raise exception 'A lista contém um setor inexistente.' using errcode = '22023';
  end if;

  update public.sectors s
  set position = ordered.ordinality::integer
  from unnest(p_sector_ids) with ordinality as ordered(id, ordinality)
  where s.id = ordered.id;

  with remaining as (
    select id,
           row_number() over (order by position, name, id)::integer + v_total as next_position
    from public.sectors
    where not (id = any(p_sector_ids))
  )
  update public.sectors s
  set position = remaining.next_position
  from remaining
  where s.id = remaining.id;
end;
$$;

revoke all on function public.reorder_kanban_sectors(uuid[]) from public, anon, authenticated;
grant execute on function public.reorder_kanban_sectors(uuid[]) to service_role;

insert into public.system_settings (key, value, description)
values (
  'database_release',
  to_jsonb('3.5.0-revisado'::text),
  'Configuração do Kanban e fluxo Produção Concluída, Agenda e Instalação'
)
on conflict (key) do update
set value = excluded.value,
    description = excluded.description,
    updated_at = now();

notify pgrst, 'reload schema';
commit;
