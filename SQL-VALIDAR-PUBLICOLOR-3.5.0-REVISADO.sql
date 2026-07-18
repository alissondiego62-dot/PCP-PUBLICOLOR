-- PUBLICOLOR PCP 3.5.0 REVISADO — VALIDAÇÃO
-- Execute depois do SQL cumulativo. As contagens de inconsistência devem ser zero.

select
  exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='sectors' and column_name='uses_status'
  ) as possui_uses_status,
  exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='sectors' and column_name='requires_scheduling'
  ) as possui_requires_scheduling,
  exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='sectors' and column_name='special_type'
  ) as possui_special_type;

select
  id,
  name,
  position,
  active,
  uses_status,
  requires_scheduling,
  show_in_agenda,
  allow_manual_move,
  special_type
from public.sectors
where special_type in ('production_completed','installation')
order by position;

select
  case
    when count(*) = 2
     and count(*) filter (where special_type='production_completed' and uses_status=false and show_in_agenda=true) = 1
     and count(*) filter (where special_type='installation' and uses_status=false and requires_scheduling=true and show_in_agenda=true) = 1
    then 'OK'
    else 'REVISAR'
  end as configuracao_setores_especiais
from public.sectors
where special_type in ('production_completed','installation');

select count(*) as instalacao_sem_data_ou_hora_confirmada
from public.orders o
join public.sectors s on s.id=o.sector_id and s.special_type='installation'
where o.status <> 'completed'
  and (o.installation_scheduled_at is null or coalesce(o.installation_time_confirmed,false)=false);

select count(*) as producao_concluida_com_status_invalido
from public.orders o
join public.sectors s on s.id=o.sector_id and s.special_type='production_completed'
where o.status <> 'completed'
  and o.status <> 'waiting';

select count(*) as instalacao_com_status_kanban_invalido
from public.orders o
join public.sectors s on s.id=o.sector_id and s.special_type='installation'
where o.status <> 'completed'
  and o.status <> 'waiting';

select count(*) as setores_especiais_duplicados
from (
  select special_type
  from public.sectors
  where special_type is not null
  group by special_type
  having count(*) > 1
) duplicated;

select
  p.proname,
  n.nspname as schema_name
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
where (n.nspname='public' and p.proname in ('schedule_orders_for_installation','reorder_kanban_sectors','enforce_special_sector_flow'))
   or (n.nspname='private' and p.proname='schedule_orders_for_installation')
order by n.nspname,p.proname;

select
  policyname,
  cmd,
  permissive,
  roles
from pg_policies
where schemaname='public'
  and tablename='sectors'
order by policyname;

select value as database_release
from public.system_settings
where key='database_release';
