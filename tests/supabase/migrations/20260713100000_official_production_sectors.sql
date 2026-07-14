begin;

set local lock_timeout = '10s';
set local statement_timeout = '120s';

lock table public.sectors, public.orders in share row exclusive mode;

create temporary table desired_publicolor_sectors (
  position integer primary key,
  name text not null unique
) on commit drop;

insert into desired_publicolor_sectors (position, name) values
  (1,  'LASER'),
  (2,  'PLASMA'),
  (3,  'ROUTER'),
  (4,  'PINTURA'),
  (5,  'ADESIVAGEM'),
  (6,  'IMPRESSÃO'),
  (7,  'MONTAGEM LETRAS'),
  (8,  'SERRALHERIA'),
  (9,  'ELETRICA'),
  (10, 'MONTAGEM ACM'),
  (11, 'MANUTENÇÃO'),
  (12, 'INSTALAÇÃO');

insert into public.sectors (name, position, active)
select name, position, true
from desired_publicolor_sectors
on conflict (name) do update
set position = excluded.position,
    active = true;

create temporary table order_sector_targets (
  order_id uuid primary key,
  source_sector text,
  target_sector text not null
) on commit drop;

insert into order_sector_targets (order_id, source_sector, target_sector)
select
  o.id,
  coalesce(
    nullif(trim(substring(o.notes from 'Setor original:[[:space:]]*([^\n\r]+)')), ''),
    s.name,
    ''
  ) as source_sector,
  case
    when upper(translate(coalesce(nullif(trim(substring(o.notes from 'Setor original:[[:space:]]*([^\n\r]+)')), ''), s.name, ''),
      'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
      'AAAAAEEEEIIIIOOOOOUUUUC')) like '%PLASMA%' then 'PLASMA'

    when upper(translate(coalesce(nullif(trim(substring(o.notes from 'Setor original:[[:space:]]*([^\n\r]+)')), ''), s.name, ''),
      'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
      'AAAAAEEEEIIIIOOOOOUUUUC')) like '%LASER%' then 'LASER'

    when upper(translate(coalesce(nullif(trim(substring(o.notes from 'Setor original:[[:space:]]*([^\n\r]+)')), ''), s.name, ''),
      'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
      'AAAAAEEEEIIIIOOOOOUUUUC')) like '%ROUTER%' then 'ROUTER'

    when upper(translate(coalesce(nullif(trim(substring(o.notes from 'Setor original:[[:space:]]*([^\n\r]+)')), ''), s.name, ''),
      'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
      'AAAAAEEEEIIIIOOOOOUUUUC')) like '%PINTURA%' then 'PINTURA'

    when upper(translate(coalesce(nullif(trim(substring(o.notes from 'Setor original:[[:space:]]*([^\n\r]+)')), ''), s.name, ''),
      'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
      'AAAAAEEEEIIIIOOOOOUUUUC')) like '%MONTAGEM ACM%' then 'MONTAGEM ACM'

    when upper(translate(coalesce(nullif(trim(substring(o.notes from 'Setor original:[[:space:]]*([^\n\r]+)')), ''), s.name, ''),
      'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
      'AAAAAEEEEIIIIOOOOOUUUUC')) like '%MONTAGEM LETRA%'
      or upper(translate(coalesce(nullif(trim(substring(o.notes from 'Setor original:[[:space:]]*([^\n\r]+)')), ''), s.name, ''),
        'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
        'AAAAAEEEEIIIIOOOOOUUUUC')) like '%MONTAGEM DE LETREIRO%'
      then 'MONTAGEM LETRAS'

    when upper(translate(coalesce(nullif(trim(substring(o.notes from 'Setor original:[[:space:]]*([^\n\r]+)')), ''), s.name, ''),
      'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
      'AAAAAEEEEIIIIOOOOOUUUUC')) like '%SERRALHERIA%'
      or upper(translate(coalesce(nullif(trim(substring(o.notes from 'Setor original:[[:space:]]*([^\n\r]+)')), ''), s.name, ''),
        'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
        'AAAAAEEEEIIIIOOOOOUUUUC')) like '%METALURGIA%'
      then 'SERRALHERIA'

    when upper(translate(coalesce(nullif(trim(substring(o.notes from 'Setor original:[[:space:]]*([^\n\r]+)')), ''), s.name, ''),
      'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
      'AAAAAEEEEIIIIOOOOOUUUUC')) like '%ELETRIC%'
      then 'ELETRICA'

    when upper(translate(coalesce(nullif(trim(substring(o.notes from 'Setor original:[[:space:]]*([^\n\r]+)')), ''), s.name, ''),
      'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
      'AAAAAEEEEIIIIOOOOOUUUUC')) like '%MANUTEN%'
      then 'MANUTENÇÃO'

    when upper(translate(coalesce(nullif(trim(substring(o.notes from 'Setor original:[[:space:]]*([^\n\r]+)')), ''), s.name, ''),
      'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
      'AAAAAEEEEIIIIOOOOOUUUUC')) like '%INSTALA%'
      or upper(translate(coalesce(nullif(trim(substring(o.notes from 'Setor original:[[:space:]]*([^\n\r]+)')), ''), s.name, ''),
        'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
        'AAAAAEEEEIIIIOOOOOUUUUC')) like '%ENTREGUE%'
      then 'INSTALAÇÃO'

    when upper(translate(coalesce(nullif(trim(substring(o.notes from 'Setor original:[[:space:]]*([^\n\r]+)')), ''), s.name, ''),
      'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
      'AAAAAEEEEIIIIOOOOOUUUUC')) like '%ADESIV%'
      or upper(translate(coalesce(nullif(trim(substring(o.notes from 'Setor original:[[:space:]]*([^\n\r]+)')), ''), s.name, ''),
        'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
        'AAAAAEEEEIIIIOOOOOUUUUC')) like '%PLOTTER%'
      or upper(translate(coalesce(nullif(trim(substring(o.notes from 'Setor original:[[:space:]]*([^\n\r]+)')), ''), s.name, ''),
        'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
        'AAAAAEEEEIIIIOOOOOUUUUC')) like '%LAMINAC%'
      or upper(translate(coalesce(nullif(trim(substring(o.notes from 'Setor original:[[:space:]]*([^\n\r]+)')), ''), s.name, ''),
        'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
        'AAAAAEEEEIIIIOOOOOUUUUC')) like '%ACABAMENTO%'
      then 'ADESIVAGEM'

    when upper(translate(coalesce(nullif(trim(substring(o.notes from 'Setor original:[[:space:]]*([^\n\r]+)')), ''), s.name, ''),
      'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
      'AAAAAEEEEIIIIOOOOOUUUUC')) like '%IMPRESS%'
      or upper(translate(coalesce(nullif(trim(substring(o.notes from 'Setor original:[[:space:]]*([^\n\r]+)')), ''), s.name, ''),
        'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
        'AAAAAEEEEIIIIOOOOOUUUUC')) like '%PCP%'
      or upper(translate(coalesce(nullif(trim(substring(o.notes from 'Setor original:[[:space:]]*([^\n\r]+)')), ''), s.name, ''),
        'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
        'AAAAAEEEEIIIIOOOOOUUUUC')) like '%CONTROLE DE QUALIDADE%'
      then 'IMPRESSÃO'

    else 'IMPRESSÃO'
  end as target_sector
from public.orders o
left join public.sectors s on s.id = o.sector_id;

update public.orders o
set sector_id = target.id
from order_sector_targets mapped
join public.sectors target
  on target.name = mapped.target_sector
where o.id = mapped.order_id
  and o.sector_id is distinct from target.id;

-- Pedidos que vieram como entregues permanecem finalizados.
update public.orders o
set status = 'completed',
    blocked = false,
    completed_at = coalesce(o.completed_at, o.updated_at, o.created_at, now())
from order_sector_targets mapped
where o.id = mapped.order_id
  and upper(translate(mapped.source_sector,
      'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
      'AAAAAEEEEIIIIOOOOOUUUUC')) like '%ENTREGUE%';

-- Mantém ativos somente os setores oficiais definidos pela Publicolor.
update public.sectors s
set active = exists (
  select 1
  from desired_publicolor_sectors d
  where d.name = s.name
);

-- Garante a ordem oficial no Kanban e nos relatórios.
update public.sectors s
set position = d.position,
    active = true
from desired_publicolor_sectors d
where s.name = d.name;

commit;

-- Conferência: distribuição atual dos pedidos por setor e status.
select
  s.position,
  s.name as setor,
  o.status,
  count(*) as quantidade
from public.sectors s
left join public.orders o on o.sector_id = s.id
where s.active = true
group by s.position, s.name, o.status
order by s.position, o.status;
