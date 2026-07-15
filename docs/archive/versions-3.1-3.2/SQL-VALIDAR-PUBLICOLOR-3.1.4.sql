-- Publicolor PCP 3.1.4 — validação somente leitura.
-- Execute após o SQL de atualização.

select jsonb_build_object(
  'unit_price_column', exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'order_materials'
      and column_name = 'unit_price'
  ),
  'activity_type_column', exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'activities'
      and column_name = 'activity_type'
  ),
  'purchase_order_constraint', (
    select pg_get_constraintdef(c.oid)
    from pg_constraint c
    where c.conrelid = 'public.activities'::regclass
      and c.conname = 'activities_activity_type_check'
  ),
  'purchase_parents', (
    select count(*)
    from public.activities
    where activity_type = 'purchase_order'
      and parent_id is null
  ),
  'purchase_subactivities', (
    select count(*)
    from public.activities
    where activity_type = 'material_purchase'
      and parent_id is not null
  ),
  'orphan_purchase_subactivities', (
    select count(*)
    from public.activities
    where activity_type = 'material_purchase'
      and parent_id is null
  ),
  'duplicate_purchase_parents', (
    select count(*)
    from (
      select order_id
      from public.activities
      where activity_type = 'purchase_order'
        and parent_id is null
        and order_id is not null
      group by order_id
      having count(*) > 1
    ) duplicates
  ),
  'materials_with_price', (
    select count(*)
    from public.order_materials
    where unit_price is not null
  ),
  'required_triggers', (
    select jsonb_agg(t.tgname order by t.tgname)
    from pg_trigger t
    where not t.tgisinternal
      and t.tgname in (
        'order_materials_sync_purchase_activity',
        'order_materials_log_changes',
        'activities_sync_order_material',
        'activities_sync_purchase_parent',
        'activities_cleanup_purchase_parent'
      )
  )
) as publicolor_3_1_4_validation;
