-- Publicolor 3.0.3 — reparação única do histórico de migrations do Supabase
-- Execute no SQL Editor do projeto Publicolor PCP antes de reabrir a Preview Branch.
-- Este script NÃO executa migrations antigas e NÃO altera os dados operacionais.
-- Ele apenas registra como aplicadas as migrations cujo resultado já foi validado no schema atual.
-- Compatível com versões da tabela schema_migrations que não possuem a coluna created_by.

begin;

do $$
declare
  missing_items text;
begin
  select string_agg(item, ', ' order by item)
  into missing_items
  from (
    select 'table:' || required_name as item
    from unnest(array['profiles','sectors','orders','order_history','order_comments','order_files','order_change_history','order_materials','order_checklist_items','client_materials','client_material_import_issues','clients','google_drive_settings','google_drive_oauth_states','google_drive_upload_sessions','order_drive_folders','system_platform_settings','system_environment_changes','system_sql_updates','activity_groups','activities','system_counters']::text[]) as required(required_name)
    where to_regclass('public.' || required_name) is null

    union all

    select 'orders.column:' || required_name
    from unnest(array['installation_scheduled_at','materials','installation_address','installation_team','installation_vehicle','installation_status','installation_notes','installation_completed_at','client_id','consultant_name','installation_time_confirmed','drive_last_synced_at','drive_last_sync_file_count']::text[]) as required(required_name)
    where not exists (
      select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name = 'orders'
        and column_name = required_name
    )

    union all

    select 'order_files.column:' || required_name
    from unnest(array['drive_url','drive_file_id','drive_folder_id','file_category','version','notes','is_approved','updated_by','updated_at','origin','drive_modified_at','drive_last_modified_by_name','drive_last_modified_by_email','drive_md5_checksum','removal_mode','removed_from_order_at','removed_from_order_by']::text[]) as required(required_name)
    where not exists (
      select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name = 'order_files'
        and column_name = required_name
    )

    union all

    select 'function:' || required_name
    from unnest(array['current_user_role','delete_order_permanently','reopen_completed_order','generate_unique_order_number','normalized_order_number','order_number_exists','prevent_duplicate_order_number','ensure_client_by_name','audit_order_file_change','can_manage_activities']::text[]) as required(required_name)
    where not exists (
      select 1
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname = required_name
    )

    union all

    select 'enum:order_status.' || required_name
    from unnest(array['in_transport','waiting_client']::text[]) as required(required_name)
    where not exists (
      select 1
      from pg_type t
      join pg_namespace n on n.oid = t.typnamespace
      join pg_enum e on e.enumtypid = t.oid
      where n.nspname = 'public'
        and t.typname = 'order_status'
        and e.enumlabel = required_name
    )
  ) checks;

  if missing_items is not null then
    raise exception 'Reparação cancelada. O schema ainda não contém: %', missing_items;
  end if;
end
$$;

insert into supabase_migrations.schema_migrations
  (version, statements, name)
values
    ('20260712190000', array[]::text[], 'initial'),
    ('20260712194040', array[]::text[], 'production_sectors_and_order_controls'),
    ('20260712194210', array[]::text[], 'harden_trigger_function_privileges'),
    ('20260712195724', array[]::text[], 'user_roles_and_installation_agenda'),
    ('20260712195908', array[]::text[], 'harden_role_management_privileges'),
    ('20260712200537', array[]::text[], 'optimize_role_policies_and_foreign_keys'),
    ('20260713010000', array[]::text[], 'publicolor_v3_order_and_installation'),
    ('20260713090000', array[]::text[], 'editable_orders_consultant_history'),
    ('20260713100000', array[]::text[], 'official_production_sectors'),
    ('20260713221049', array[]::text[], 'add_installation_time_confirmed_to_orders'),
    ('20260714010000', array[]::text[], 'order_workspace_module'),
    ('20260714213957', array[]::text[], 'client_materials_tintas'),
    ('20260714214125', array[]::text[], 'client_materials_source_row'),
    ('20260714223000', array[]::text[], 'client_materials_tintas'),
    ('20260715010000', array[]::text[], 'google_drive_links'),
    ('20260715030000', array[]::text[], 'reopen_completed_order'),
    ('20260716010000', array[]::text[], 'clients_module'),
    ('20260716020000', array[]::text[], 'organized_order_history'),
    ('20260717010000', array[]::text[], 'automatic_deadline_and_month_calendar'),
    ('20260718010000', array[]::text[], 'google_drive_oauth_integration'),
    ('20260719010000', array[]::text[], 'drive_upload_recovery_and_file_access'),
    ('20260720010000', array[]::text[], 'order_file_refresh_audit'),
    ('20260721010000', array[]::text[], 'order_file_remove_delete_modes'),
    ('20260722010000', array[]::text[], 'admin_platform_and_sql_updates'),
    ('20260723010000', array[]::text[], 'drive_order_folder_registry_and_sync'),
    ('20260723030000', array[]::text[], 'fix_order_files_upsert_constraint'),
    ('20260724010000', array[]::text[], 'fix_orders_insert_rls_for_pdf_import'),
    ('20260725010000', array[]::text[], 'fix_order_delete_cascade'),
    ('20260726010000', array[]::text[], 'activity_management'),
    ('20260727010000', array[]::text[], 'automatic_unique_order_number'),
    ('20260727030000', array[]::text[], 'prevent_duplicate_order_numbers'),
    ('20260728010000', array[]::text[], 'pdf_client_and_pcp_workflow')
on conflict (version) do nothing;

commit;

-- Resultado esperado: todas as versões abaixo aparecem uma única vez.
select version, name
from supabase_migrations.schema_migrations
where version in ('20260712190000','20260712194040','20260712194210','20260712195724','20260712195908','20260712200537','20260713010000','20260713090000','20260713100000','20260713221049','20260714010000','20260714213957','20260714214125','20260714223000','20260715010000','20260715030000','20260716010000','20260716020000','20260717010000','20260718010000','20260719010000','20260720010000','20260721010000','20260722010000','20260723010000','20260723030000','20260724010000','20260725010000','20260726010000','20260727010000','20260727030000','20260728010000')
order by version;
