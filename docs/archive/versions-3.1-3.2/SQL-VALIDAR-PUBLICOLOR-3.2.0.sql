-- Publicolor PCP 3.2.0 — validação sem alteração de dados
with required_columns as (
  select * from (values
    ('activities','activity_status'),
    ('activities','activity_type'),
    ('activities','order_id'),
    ('activities','order_material_id'),
    ('activities','due_at'),
    ('order_materials','availability'),
    ('order_materials','purchase_status'),
    ('order_materials','purchase_activity_id'),
    ('order_materials','unit_price')
  ) as r(table_name, column_name)
), missing_columns as (
  select r.*
  from required_columns r
  left join information_schema.columns c
    on c.table_schema='public'
   and c.table_name=r.table_name
   and c.column_name=r.column_name
  where c.column_name is null
), orphan_summary as (
  select jsonb_build_object(
    'activities_without_group', (select count(*) from public.activities a left join public.activity_groups g on g.id=a.group_id where g.id is null),
    'materials_without_order', (select count(*) from public.order_materials m left join public.orders o on o.id=m.order_id where o.id is null),
    'purchase_activities_without_material', (select count(*) from public.activities a left join public.order_materials m on m.id=a.order_material_id where a.activity_type='material_purchase' and m.id is null),
    'materials_with_invalid_purchase_activity', (select count(*) from public.order_materials m left join public.activities a on a.id=m.purchase_activity_id where m.purchase_activity_id is not null and a.id is null),
    'duplicate_purchase_parents', (select count(*) from (select order_id from public.activities where activity_type='purchase_order' and parent_id is null and order_id is not null group by order_id having count(*)>1) x)
  ) as value
)
select jsonb_build_object(
  'status', case when exists(select 1 from missing_columns) then 'INCOMPLETO' else 'OK' end,
  'missing_columns', coalesce((select jsonb_agg(to_jsonb(m)) from missing_columns m),'[]'::jsonb),
  'rename_function', to_regprocedure('public.rename_linked_order_material(uuid,text)') is not null,
  'indexes', jsonb_build_object(
    'orders_active_sector_status_idx', to_regclass('public.orders_active_sector_status_idx') is not null,
    'activities_open_group_due_idx', to_regclass('public.activities_open_group_due_idx') is not null,
    'order_materials_order_availability_status_idx', to_regclass('public.order_materials_order_availability_status_idx') is not null,
    'order_files_active_order_created_idx', to_regclass('public.order_files_active_order_created_idx') is not null
  ),
  'orphans', (select value from orphan_summary),
  'counts', jsonb_build_object(
    'orders', (select count(*) from public.orders),
    'activities', (select count(*) from public.activities),
    'materials', (select count(*) from public.order_materials),
    'files', (select count(*) from public.order_files)
  )
) as publicolor_3_2_validation;
