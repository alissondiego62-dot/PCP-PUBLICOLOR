-- PUBLICOLOR PCP 3.4.2 · validação somente leitura
select jsonb_build_object(
  'database_release',(select value from public.system_settings where key='database_release'),
  'profiles_columns',(select jsonb_agg(column_name order by ordinal_position) from information_schema.columns where table_schema='public' and table_name='profiles' and column_name in ('display_title','admin_notes','last_seen_at')),
  'manager_role_supported',coalesce((select pg_get_constraintdef(oid) ilike '%manager%' from pg_constraint where conrelid='public.profiles'::regclass and conname='profiles_supported_roles_check'),false),
  'activity_purchase_columns',(select jsonb_agg(column_name order by ordinal_position) from information_schema.columns where table_schema='public' and table_name='activities' and column_name in ('purchase_quantity','purchase_unit','purchase_unit_price','activity_type')),
  'permission_tables',(select jsonb_agg(table_name order by table_name) from information_schema.tables where table_schema='public' and table_name in ('app_permissions','role_permissions','user_permission_overrides')),
  'permission_count',(select count(*) from public.app_permissions),
  'role_permission_count',(select count(*) from public.role_permissions),
  'administrator_required_permissions',(select jsonb_build_object(
    'users_manage',coalesce((select allowed from public.role_permissions where role='admin' and permission_key='users.manage'),false),
    'settings_permissions',coalesce((select allowed from public.role_permissions where role='admin' and permission_key='settings.permissions'),false)
  )),
  'access_log_table',to_regclass('public.user_access_log') is not null,
  'public_access_wrappers',(select jsonb_agg(jsonb_build_object('name',p.proname,'security_definer',p.prosecdef) order by p.proname) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('record_my_access','touch_my_access','close_my_access','has_app_permission')),
  'private_permission_function',to_regprocedure('private.has_app_permission(text)') is not null,
  'purchase_group_items',(select count(*) from public.activities a join public.activity_groups g on g.id=a.group_id where public.normalize_publicolor_text(g.name)='COMPRAS' and a.deleted_at is null),
  'nonstandard_purchase_items',(select count(*) from public.activities a join public.activity_groups g on g.id=a.group_id where public.normalize_publicolor_text(g.name)='COMPRAS' and a.deleted_at is null and a.activity_type not in ('purchase_order','material_purchase')),
  'orders_without_client_id',(select count(*) from public.orders where client_id is null and nullif(trim(client_name),'') is not null),
  'last_admin_trigger',exists(select 1 from pg_trigger where tgrelid='public.profiles'::regclass and tgname='profiles_protect_last_admin' and not tgisinternal)
) as publicolor_342_validation;
