-- PUBLICOLOR PCP 3.4.1 — VALIDAÇÃO SOMENTE LEITURA
-- Execute depois do SQL cumulativo. Este arquivo não altera dados.

with required_tables(name) as (
  values
    ('orders'),('sectors'),('profiles'),('activities'),('activity_groups'),
    ('order_materials'),('operational_settings'),('admin_audit_log'),
    ('integration_jobs'),('dashboard_refresh_events'),('system_observability_events')
), table_check as (
  select name, to_regclass(format('public.%I', name)) is not null as installed
  from required_tables
), required_columns(table_name,column_name) as (
  values
    ('orders','sector_entered_at'),
    ('sectors','wip_limit'),
    ('profiles','last_seen_at'),('profiles','invited_at'),('profiles','invite_status'),
    ('activities','deleted_at'),('activities','deleted_by'),('activities','activity_status'),
    ('activities','activity_type'),('activities','order_id'),('activities','order_material_id'),
    ('order_materials','availability'),('order_materials','purchase_status'),
    ('order_materials','purchase_activity_id'),('order_materials','unit_price'),
    ('order_materials','actual_unit_price'),('order_materials','purchased_quantity'),
    ('order_materials','received_quantity'),('order_materials','purchase_order_number'),
    ('order_materials','purchase_ordered_at'),('order_materials','invoice_number'),
    ('order_materials','purchase_document_url'),('order_materials','invoice_file_url'),
    ('order_materials','receipt_notes'),('order_materials','deleted_at'),
    ('system_observability_events','correlation_id'),('system_observability_events','route'),
    ('system_observability_events','attempt')
), column_check as (
  select r.table_name, r.column_name, exists (
    select 1 from information_schema.columns c
    where c.table_schema='public' and c.table_name=r.table_name and c.column_name=r.column_name
  ) as installed
  from required_columns r
), required_functions(name, arguments) as (
  values
    ('get_dashboard_operational_summary',''),
    ('cascade_activity_status','uuid, text, boolean'),
    ('touch_my_profile',''),
    ('rename_linked_order_material','uuid, text'),
    ('set_integration_job_updated_at','')
), function_check as (
  select r.name, r.arguments, exists (
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname=r.name
  ) as installed
  from required_functions r
), required_indexes(name) as (
  values
    ('orders_active_updated_idx'),('orders_completed_pagination_idx'),
    ('orders_sector_entry_idx'),('activities_visible_group_idx'),
    ('activities_visible_parent_idx'),('activities_purchase_due_visible_idx'),
    ('activities_purchase_order_unique_idx'),('order_materials_visible_order_idx'),
    ('integration_jobs_active_dedupe_uidx'),('admin_audit_log_created_idx')
), index_check as (
  select r.name, exists (
    select 1 from pg_indexes i where i.schemaname='public' and i.indexname=r.name
  ) as installed
  from required_indexes r
), required_triggers(table_name,name) as (
  values
    ('orders','orders_prepare_sector_entry'),
    ('integration_jobs','integration_jobs_updated_at'),
    ('orders','orders_dashboard_refresh'),
    ('activities','activities_dashboard_refresh'),
    ('order_materials','order_materials_dashboard_refresh')
), trigger_check as (
  select r.table_name, r.name, exists (
    select 1 from information_schema.triggers t
    where t.event_object_schema='public' and t.event_object_table=r.table_name and t.trigger_name=r.name
  ) as installed
  from required_triggers r
), integrity as (
  select
    (select count(*) from public.activities a where a.parent_id is not null and not exists (select 1 from public.activities p where p.id=a.parent_id)) as orphan_subactivities,
    (select count(*) from public.activities a where a.order_material_id is not null and not exists (select 1 from public.order_materials m where m.id=a.order_material_id)) as orphan_material_activities,
    (select count(*) from public.order_materials m where m.purchase_activity_id is not null and not exists (select 1 from public.activities a where a.id=m.purchase_activity_id)) as orphan_purchase_links,
    (select count(*) from (
      select order_id from public.activities
      where activity_type='purchase_order' and parent_id is null and deleted_at is null
      group by order_id having count(*)>1
    ) duplicated) as duplicated_active_purchase_parents,
    (select count(*) from public.order_materials where deleted_at is null and quantity <= 0) as invalid_material_quantities,
    (select count(*) from public.order_materials where deleted_at is null and coalesce(actual_unit_price,unit_price,0) < 0) as invalid_material_prices
)
select jsonb_pretty(jsonb_build_object(
  'version','3.4.1',
  'validated_at',now(),
  'tables',coalesce((select jsonb_object_agg(name,installed) from table_check),'{}'::jsonb),
  'columns',coalesce((select jsonb_object_agg(table_name||'.'||column_name,installed) from column_check),'{}'::jsonb),
  'functions',coalesce((select jsonb_object_agg(name,installed) from function_check),'{}'::jsonb),
  'indexes',coalesce((select jsonb_object_agg(name,installed) from index_check),'{}'::jsonb),
  'triggers',coalesce((select jsonb_object_agg(table_name||'.'||name,installed) from trigger_check),'{}'::jsonb),
  'integrity',(select to_jsonb(integrity) from integrity),
  'counts',jsonb_build_object(
    'orders',(select count(*) from public.orders),
    'active_orders',(select count(*) from public.orders where status<>'completed'),
    'completed_orders',(select count(*) from public.orders where status='completed'),
    'activities',(select count(*) from public.activities where deleted_at is null),
    'materials',(select count(*) from public.order_materials where deleted_at is null),
    'integration_jobs',(select count(*) from public.integration_jobs),
    'admin_audit_events',(select count(*) from public.admin_audit_log)
  ),
  'all_required_objects_installed',
    not exists(select 1 from table_check where not installed)
    and not exists(select 1 from column_check where not installed)
    and not exists(select 1 from function_check where not installed)
    and not exists(select 1 from index_check where not installed)
    and not exists(select 1 from trigger_check where not installed)
)) as publicolor_3_4_validation;
