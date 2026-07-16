-- PUBLICOLOR PCP 3.4.2
-- Materiais responsivos, Compras padronizadas, acessos e permissões configuráveis
-- ============================================================================
begin;

-- Registro de versão e configurações estruturais do sistema.
-- A tabela não existia em bancos anteriores e precisa ser criada antes do INSERT final.
create table if not exists public.system_settings (
  key text primary key,
  value jsonb not null default 'null'::jsonb,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);

alter table public.system_settings
  add column if not exists value jsonb,
  add column if not exists description text,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists updated_by uuid references public.profiles(id) on delete set null;

update public.system_settings
set value = 'null'::jsonb
where value is null;

alter table public.system_settings
  alter column value set default 'null'::jsonb,
  alter column value set not null;

create or replace function public.set_system_settings_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  if auth.uid() is not null then
    new.updated_by := auth.uid();
  end if;
  return new;
end
$$;

drop trigger if exists system_settings_set_updated_at on public.system_settings;
create trigger system_settings_set_updated_at
before update on public.system_settings
for each row execute function public.set_system_settings_updated_at();

alter table public.system_settings enable row level security;
revoke all on table public.system_settings from anon;
grant select, insert, update, delete on table public.system_settings to authenticated;
grant all on table public.system_settings to service_role;

drop policy if exists system_settings_read_authenticated on public.system_settings;
create policy system_settings_read_authenticated
on public.system_settings for select to authenticated
using ((select auth.uid()) is not null);

drop policy if exists system_settings_insert_admin on public.system_settings;
create policy system_settings_insert_admin
on public.system_settings for insert to authenticated
with check ((select public.current_user_role()) = 'admin');

drop policy if exists system_settings_update_admin on public.system_settings;
create policy system_settings_update_admin
on public.system_settings for update to authenticated
using ((select public.current_user_role()) = 'admin')
with check ((select public.current_user_role()) = 'admin');

drop policy if exists system_settings_delete_admin on public.system_settings;
create policy system_settings_delete_admin
on public.system_settings for delete to authenticated
using ((select public.current_user_role()) = 'admin');

alter table public.profiles add column if not exists display_title text;
alter table public.profiles add column if not exists admin_notes text;

alter table public.profiles drop constraint if exists profiles_supported_roles_check;
alter table public.profiles add constraint profiles_supported_roles_check
  check (role::text in ('admin','manager','production','viewer'));
comment on column public.profiles.role is
  'admin=Administrador; manager=Gerente; production=Operador; viewer=Visualizador';

drop policy if exists profiles_update_admin on public.profiles;
create policy profiles_update_admin on public.profiles for update to authenticated
using ((select public.current_user_role()) = 'admin')
with check ((select public.current_user_role()) = 'admin' and role::text in ('admin','manager','production','viewer'));

alter table public.activities add column if not exists purchase_quantity numeric;
alter table public.activities add column if not exists purchase_unit text;
alter table public.activities add column if not exists purchase_unit_price numeric;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'activities_purchase_quantity_positive') then
    alter table public.activities add constraint activities_purchase_quantity_positive check (purchase_quantity is null or purchase_quantity > 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'activities_purchase_unit_price_nonnegative') then
    alter table public.activities add constraint activities_purchase_unit_price_nonnegative check (purchase_unit_price is null or purchase_unit_price >= 0);
  end if;
end $$;

create or replace function public.normalize_publicolor_text(value text)
returns text language sql immutable parallel safe as $$
  select upper(trim(translate(coalesce(value,''), 'ÁÀÃÂÄÉÈÊËÍÌÎÏÓÒÕÔÖÚÙÛÜÇáàãâäéèêëíìîïóòõôöúùûüç', 'AAAAAEEEEIIIIOOOOOUUUUCaaaaaeeeeiiiiooooouuuuc')))
$$;

create or replace function public.prepare_purchase_activity()
returns trigger language plpgsql security invoker set search_path = public, pg_temp as $$
declare group_name text;
begin
  select public.normalize_publicolor_text(name) into group_name from public.activity_groups where id = new.group_id;
  if group_name = 'COMPRAS' then
    new.activity_type := case when new.parent_id is null then 'purchase_order' else 'material_purchase' end;
    if new.parent_id is not null then
      new.purchase_quantity := coalesce(new.purchase_quantity, 1);
      new.purchase_unit := coalesce(nullif(trim(new.purchase_unit), ''), 'un');
    end if;
  elsif new.order_material_id is null then
    new.activity_type := 'general';
    new.purchase_quantity := null;
    new.purchase_unit := null;
    new.purchase_unit_price := null;
  end if;
  return new;
end $$;

drop trigger if exists activities_prepare_purchase_group on public.activities;
create trigger activities_prepare_purchase_group before insert or update of group_id,parent_id,activity_type,purchase_quantity,purchase_unit,purchase_unit_price on public.activities for each row execute function public.prepare_purchase_activity();

update public.activities a set
  activity_type = case when a.parent_id is null then 'purchase_order' else 'material_purchase' end,
  purchase_quantity = case when a.parent_id is null then a.purchase_quantity else coalesce(a.purchase_quantity,1) end,
  purchase_unit = case when a.parent_id is null then a.purchase_unit else coalesce(nullif(trim(a.purchase_unit),''),'un') end
from public.activity_groups g
where g.id=a.group_id and public.normalize_publicolor_text(g.name)='COMPRAS';

create table if not exists public.app_permissions (
  permission_key text primary key,
  module text not null,
  label text not null,
  description text not null default '',
  critical boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.role_permissions (
  role text not null check (role in ('admin','manager','production','viewer')),
  permission_key text not null references public.app_permissions(permission_key) on delete cascade,
  allowed boolean not null default false,
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now(),
  primary key(role,permission_key)
);
create table if not exists public.user_permission_overrides (
  user_id uuid not null references public.profiles(id) on delete cascade,
  permission_key text not null references public.app_permissions(permission_key) on delete cascade,
  allowed boolean not null,
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now(),
  primary key(user_id,permission_key)
);

insert into public.app_permissions(permission_key,module,label,description,critical) values
('dashboard.view','Dashboard','Visualizar Dashboard','Acessar indicadores e prioridades.',false),
('production.view','Produção','Visualizar Kanban','Consultar pedidos por setor.',false),
('production.move','Produção','Mover pedidos e alterar status','Trocar setor e status.',false),
('orders.view','Pedidos','Visualizar pedidos','Consultar pedidos ativos e concluídos.',false),
('orders.create','Pedidos','Criar e importar pedidos','Criar OS e importar PDF.',false),
('orders.edit','Pedidos','Editar pedidos','Alterar dados da OS.',false),
('orders.finalize','Pedidos','Finalizar e reabrir OS','Concluir ou reabrir ordens.',false),
('orders.delete','Pedidos','Excluir pedidos','Apagar ordens.',true),
('materials.view','Materiais','Visualizar materiais','Consultar materiais da OS.',false),
('materials.edit','Materiais','Editar materiais','Criar, editar e excluir materiais.',false),
('activities.view','Atividades e Compras','Visualizar atividades','Consultar atividades e compras.',false),
('activities.manage','Atividades e Compras','Gerenciar atividades','Criar, editar e concluir atividades.',false),
('purchases.prices','Atividades e Compras','Alterar preços','Editar preço e recebimento.',false),
('agenda.view','Agenda','Visualizar Agenda','Consultar instalações e entregas.',false),
('agenda.manage','Agenda','Gerenciar Agenda','Agendar e reagendar.',false),
('clients.view','Clientes','Visualizar clientes','Consultar clientes.',false),
('clients.manage','Clientes','Gerenciar clientes','Criar e editar clientes.',false),
('users.view','Usuários','Visualizar usuários','Consultar usuários e acessos.',false),
('users.manage','Usuários','Gerenciar usuários','Editar usuários e níveis.',true),
('settings.view','Configurações','Visualizar Configurações','Acessar configurações permitidas.',false),
('settings.operation','Configurações','Alterar operação','Configurar regras operacionais.',false),
('settings.integrations','Configurações','Gerenciar integrações','Acessar integrações e dados.',false),
('settings.permissions','Configurações','Configurar permissões','Editar matriz de acesso.',true),
('settings.infrastructure','Configurações','Acessar infraestrutura','Executar ações avançadas.',true)
on conflict(permission_key) do update set module=excluded.module,label=excluded.label,description=excluded.description,critical=excluded.critical,updated_at=now();

insert into public.role_permissions(role,permission_key,allowed)
select role, p.permission_key,
case
 when role='admin' then true
 when role='manager' then p.permission_key = any(array['dashboard.view','production.view','production.move','orders.view','orders.create','orders.edit','orders.finalize','materials.view','materials.edit','activities.view','activities.manage','purchases.prices','agenda.view','agenda.manage','clients.view','clients.manage','users.view','settings.view','settings.operation','settings.integrations'])
 when role='production' then p.permission_key = any(array['dashboard.view','production.view','production.move','orders.view','orders.create','orders.edit','orders.finalize','materials.view','materials.edit','activities.view','activities.manage','purchases.prices','agenda.view','agenda.manage','clients.view','clients.manage'])
 else p.permission_key = any(array['dashboard.view','production.view','orders.view','materials.view','activities.view','agenda.view','clients.view']) end
from unnest(array['admin','manager','production','viewer']) role cross join public.app_permissions p
on conflict(role,permission_key) do nothing;

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create or replace function private.has_app_permission(permission_name text)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((
    select case
      when p.active is not true then false
      when p.role::text='admin' then true
      when o.allowed is not null then o.allowed
      else rp.allowed end
    from public.profiles p
    left join public.user_permission_overrides o on o.user_id=p.id and o.permission_key=permission_name
    left join public.role_permissions rp on rp.role=p.role::text and rp.permission_key=permission_name
    where p.id=(select auth.uid())
  ),false)
$$;
revoke all on function private.has_app_permission(text) from public, anon;
grant execute on function private.has_app_permission(text) to authenticated;

create or replace function public.has_app_permission(permission_name text)
returns boolean language sql stable security invoker set search_path = public, pg_temp as $$
  select private.has_app_permission(permission_name)
$$;
revoke all on function public.has_app_permission(text) from public, anon;
grant execute on function public.has_app_permission(text) to authenticated;

alter table public.app_permissions enable row level security;
alter table public.role_permissions enable row level security;
alter table public.user_permission_overrides enable row level security;
drop policy if exists app_permissions_read on public.app_permissions;
create policy app_permissions_read on public.app_permissions for select to authenticated using ((select auth.uid()) is not null);
drop policy if exists role_permissions_read on public.role_permissions;
create policy role_permissions_read on public.role_permissions for select to authenticated using ((select auth.uid()) is not null);
drop policy if exists role_permissions_admin_write on public.role_permissions;
create policy role_permissions_admin_write on public.role_permissions for all to authenticated using ((select public.current_user_role()) = 'admin') with check ((select public.current_user_role()) = 'admin');
drop policy if exists user_permission_overrides_read on public.user_permission_overrides;
create policy user_permission_overrides_read on public.user_permission_overrides for select to authenticated using (user_id=(select auth.uid()) or (select public.current_user_role()) = 'admin');
drop policy if exists user_permission_overrides_admin_write on public.user_permission_overrides;
create policy user_permission_overrides_admin_write on public.user_permission_overrides for all to authenticated using ((select public.current_user_role()) = 'admin') with check ((select public.current_user_role()) = 'admin');
grant select on public.app_permissions,public.role_permissions,public.user_permission_overrides to authenticated;
grant insert,update,delete on public.role_permissions,public.user_permission_overrides to authenticated;

-- Camada restritiva: mantém as políticas existentes e exige a permissão configurada.
drop policy if exists orders_permission_insert on public.orders;
create policy orders_permission_insert on public.orders as restrictive for insert to authenticated with check ((select private.has_app_permission('orders.create')));
drop policy if exists orders_permission_update on public.orders;
create policy orders_permission_update on public.orders as restrictive for update to authenticated using ((select private.has_app_permission('orders.edit')) or (select private.has_app_permission('production.move')) or (select private.has_app_permission('orders.finalize'))) with check ((select private.has_app_permission('orders.edit')) or (select private.has_app_permission('production.move')) or (select private.has_app_permission('orders.finalize')));
drop policy if exists orders_permission_delete on public.orders;
create policy orders_permission_delete on public.orders as restrictive for delete to authenticated using ((select private.has_app_permission('orders.delete')));
drop policy if exists materials_permission_insert on public.order_materials;
create policy materials_permission_insert on public.order_materials as restrictive for insert to authenticated with check ((select private.has_app_permission('materials.edit')));
drop policy if exists materials_permission_update on public.order_materials;
create policy materials_permission_update on public.order_materials as restrictive for update to authenticated using ((select private.has_app_permission('materials.edit'))) with check ((select private.has_app_permission('materials.edit')));
drop policy if exists materials_permission_delete on public.order_materials;
create policy materials_permission_delete on public.order_materials as restrictive for delete to authenticated using ((select private.has_app_permission('materials.edit')));
drop policy if exists activities_permission_insert on public.activities;
create policy activities_permission_insert on public.activities as restrictive for insert to authenticated with check ((select private.has_app_permission('activities.manage')));
drop policy if exists activities_permission_update on public.activities;
create policy activities_permission_update on public.activities as restrictive for update to authenticated using ((select private.has_app_permission('activities.manage'))) with check ((select private.has_app_permission('activities.manage')));
drop policy if exists activities_permission_delete on public.activities;
create policy activities_permission_delete on public.activities as restrictive for delete to authenticated using ((select private.has_app_permission('activities.manage')));
drop policy if exists activity_groups_permission_insert on public.activity_groups;
create policy activity_groups_permission_insert on public.activity_groups as restrictive for insert to authenticated with check ((select private.has_app_permission('activities.manage')));
drop policy if exists activity_groups_permission_update on public.activity_groups;
create policy activity_groups_permission_update on public.activity_groups as restrictive for update to authenticated using ((select private.has_app_permission('activities.manage'))) with check ((select private.has_app_permission('activities.manage')));
drop policy if exists activity_groups_permission_delete on public.activity_groups;
create policy activity_groups_permission_delete on public.activity_groups as restrictive for delete to authenticated using ((select private.has_app_permission('activities.manage')));
drop policy if exists clients_permission_insert on public.clients;
create policy clients_permission_insert on public.clients as restrictive for insert to authenticated with check ((select private.has_app_permission('clients.manage')));
drop policy if exists clients_permission_update on public.clients;
create policy clients_permission_update on public.clients as restrictive for update to authenticated using ((select private.has_app_permission('clients.manage'))) with check ((select private.has_app_permission('clients.manage')));
drop policy if exists clients_permission_delete on public.clients;
create policy clients_permission_delete on public.clients as restrictive for delete to authenticated using ((select private.has_app_permission('clients.manage')));

create table if not exists public.user_access_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  session_id text,
  signed_in_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  signed_out_at timestamptz,
  user_agent text,
  platform text,
  device_label text,
  created_at timestamptz not null default now()
);
create index if not exists user_access_log_user_recent_idx on public.user_access_log(user_id,signed_in_at desc);
alter table public.user_access_log enable row level security;
drop policy if exists user_access_log_admin_read on public.user_access_log;
create policy user_access_log_admin_read on public.user_access_log for select to authenticated using (user_id=(select auth.uid()) or (select private.has_app_permission('users.view')));
grant select on public.user_access_log to authenticated;

create or replace function private.record_my_access_impl(p_user_agent text default null,p_platform text default null,p_device_label text default null)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare access_id uuid; session_value text;
begin
 if auth.uid() is null then raise exception 'Sessão não autenticada'; end if;
 session_value := coalesce(auth.jwt()->>'session_id',auth.jwt()->>'sid');
 select id into access_id from public.user_access_log where user_id=(select auth.uid()) and signed_out_at is null and session_id is not distinct from session_value order by signed_in_at desc limit 1;
 if access_id is null then
  insert into public.user_access_log(user_id,session_id,user_agent,platform,device_label) values((select auth.uid()),session_value,left(p_user_agent,1000),left(p_platform,120),left(p_device_label,120)) returning id into access_id;
 else update public.user_access_log set last_seen_at=now(),user_agent=coalesce(left(p_user_agent,1000),user_agent),platform=coalesce(left(p_platform,120),platform),device_label=coalesce(left(p_device_label,120),device_label) where id=access_id and user_id=(select auth.uid()); end if;
 update public.profiles set last_seen_at=now(),invite_status=case when invite_status='pending' then 'accepted' else invite_status end where id=(select auth.uid());
 return access_id;
end $$;
create or replace function private.touch_my_access_impl(p_access_id uuid)
returns void language plpgsql security definer set search_path=public,pg_temp as $$ begin
 if auth.uid() is null then raise exception 'Sessão não autenticada'; end if;
 update public.user_access_log set last_seen_at=now() where id=p_access_id and user_id=(select auth.uid()) and signed_out_at is null;
 update public.profiles set last_seen_at=now() where id=(select auth.uid());
end $$;
create or replace function private.close_my_access_impl(p_access_id uuid)
returns void language plpgsql security definer set search_path=public,pg_temp as $$ begin
 if auth.uid() is null then return; end if;
 update public.user_access_log set last_seen_at=now(),signed_out_at=now() where id=p_access_id and user_id=(select auth.uid()) and signed_out_at is null;
end $$;
revoke all on function private.record_my_access_impl(text,text,text),private.touch_my_access_impl(uuid),private.close_my_access_impl(uuid) from public,anon;
grant execute on function private.record_my_access_impl(text,text,text),private.touch_my_access_impl(uuid),private.close_my_access_impl(uuid) to authenticated;

create or replace function public.record_my_access(p_user_agent text default null,p_platform text default null,p_device_label text default null)
returns uuid language sql security invoker set search_path=public,pg_temp as $$ select private.record_my_access_impl(p_user_agent,p_platform,p_device_label) $$;
create or replace function public.touch_my_access(p_access_id uuid)
returns void language sql security invoker set search_path=public,pg_temp as $$ select private.touch_my_access_impl(p_access_id) $$;
create or replace function public.close_my_access(p_access_id uuid)
returns void language sql security invoker set search_path=public,pg_temp as $$ select private.close_my_access_impl(p_access_id) $$;
revoke all on function public.record_my_access(text,text,text),public.touch_my_access(uuid),public.close_my_access(uuid) from public,anon;
grant execute on function public.record_my_access(text,text,text),public.touch_my_access(uuid),public.close_my_access(uuid) to authenticated;

create or replace function public.protect_last_active_admin()
returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if old.active and old.role::text='admin' and (not new.active or new.role::text<>'admin') then
  if (select count(*) from public.profiles where active and role::text='admin' and id<>old.id) = 0 then raise exception 'O último administrador ativo não pode ser inativado ou rebaixado.'; end if;
 end if;
 return new;
end $$;
drop trigger if exists profiles_protect_last_admin on public.profiles;
create trigger profiles_protect_last_admin before update of active,role on public.profiles for each row execute function public.protect_last_active_admin();

-- Repara apenas vínculos inequívocos de clientes antigos.
with normalized_clients as (
 select id,public.normalize_publicolor_text(coalesce(nullif(trade_name,''),name)) normalized_name,count(*) over(partition by public.normalize_publicolor_text(coalesce(nullif(trade_name,''),name))) matches
 from public.clients where active is not false
)
update public.orders o set client_id=c.id
from normalized_clients c
where o.client_id is null and c.matches=1 and c.normalized_name=public.normalize_publicolor_text(o.client_name);

insert into public.system_settings(key,value,description)
values('database_release','"3.4.2"'::jsonb,'Versão estrutural do banco Publicolor PCP')
on conflict(key) do update set value=excluded.value,description=excluded.description,updated_at=now();

notify pgrst, 'reload schema';
commit;
