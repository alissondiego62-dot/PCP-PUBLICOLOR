-- Publicolor PCP 3.4.0
-- Fundação modular, resumo operacional, capacidade, auditoria e otimizações.

begin;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- Colunas operacionais e exclusão lógica.
alter table public.sectors
  add column if not exists wip_limit integer;

alter table public.sectors
  drop constraint if exists sectors_wip_limit_check;
alter table public.sectors
  add constraint sectors_wip_limit_check check (wip_limit is null or wip_limit > 0);

alter table public.orders
  add column if not exists sector_entered_at timestamptz not null default now();

update public.orders
set sector_entered_at = coalesce(updated_at, created_at, now())
where sector_entered_at is null;

alter table public.profiles
  add column if not exists last_seen_at timestamptz,
  add column if not exists invited_at timestamptz,
  add column if not exists invite_status text;

update public.profiles
set invite_status = case when active then 'accepted' else 'cancelled' end
where invite_status is null;

alter table public.profiles
  drop constraint if exists profiles_invite_status_check;
alter table public.profiles
  add constraint profiles_invite_status_check
  check (invite_status is null or invite_status in ('pending','accepted','expired','cancelled'));

alter table public.activities
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references public.profiles(id) on delete set null;

alter table public.order_materials
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references public.profiles(id) on delete set null,
  add column if not exists actual_unit_price numeric,
  add column if not exists purchased_quantity numeric,
  add column if not exists received_quantity numeric,
  add column if not exists purchase_order_number text,
  add column if not exists purchase_ordered_at timestamptz,
  add column if not exists invoice_number text,
  add column if not exists purchase_document_url text,
  add column if not exists invoice_file_url text,
  add column if not exists receipt_notes text;

alter table public.order_materials drop constraint if exists order_materials_actual_unit_price_check;
alter table public.order_materials add constraint order_materials_actual_unit_price_check check (actual_unit_price is null or actual_unit_price >= 0);
alter table public.order_materials drop constraint if exists order_materials_purchased_quantity_check;
alter table public.order_materials add constraint order_materials_purchased_quantity_check check (purchased_quantity is null or purchased_quantity >= 0);
alter table public.order_materials drop constraint if exists order_materials_received_quantity_check;
alter table public.order_materials add constraint order_materials_received_quantity_check check (received_quantity is null or received_quantity >= 0);

-- Configurações operacionais centralizadas.
create table if not exists public.operational_settings (
  setting_key text primary key,
  setting_value jsonb not null,
  description text,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.operational_settings(setting_key, setting_value, description)
values
  ('purchase_deadline_hours', to_jsonb(24), 'Prazo padrão de compras automáticas em horas.'),
  ('installation_daily_capacity', to_jsonb(8), 'Capacidade visual diária da agenda.'),
  ('thumbnail_background_mode', to_jsonb('wifi'::text), 'Carregamento das miniaturas: always, wifi ou visible_only.'),
  ('default_purchase_responsible_id', 'null'::jsonb, 'Responsável padrão de compras; nulo usa o usuário criador.'),
  ('completed_orders_default_days', to_jsonb(90), 'Período padrão da página de pedidos concluídos.')
on conflict (setting_key) do nothing;

create or replace function public.set_operational_settings_updated_at()
returns trigger language plpgsql security invoker set search_path = pg_catalog, public as $$
begin
  new.updated_at := now();
  new.updated_by := coalesce(new.updated_by, auth.uid());
  return new;
end;
$$;
revoke all on function public.set_operational_settings_updated_at() from public, anon, authenticated;
drop trigger if exists operational_settings_updated_at on public.operational_settings;
create trigger operational_settings_updated_at before insert or update on public.operational_settings
for each row execute function public.set_operational_settings_updated_at();

alter table public.operational_settings enable row level security;
drop policy if exists operational_settings_read_authenticated on public.operational_settings;
create policy operational_settings_read_authenticated on public.operational_settings for select to authenticated
using ((select auth.uid()) is not null);
drop policy if exists operational_settings_manage_admin on public.operational_settings;
create policy operational_settings_manage_admin on public.operational_settings for all to authenticated
using (public.current_user_role() = 'admin')
with check (public.current_user_role() = 'admin');
grant select on public.operational_settings to authenticated;
grant insert, update, delete on public.operational_settings to authenticated;

-- Regras operacionais configuráveis para atividades automáticas de compra.
create or replace function public.sync_purchase_activity_from_material()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_group_id uuid;
  v_parent_id uuid;
  v_activity_id uuid;
  v_activity_status text;
  v_activity_completed boolean;
  v_order_number text;
  v_client_name text;
  v_actor uuid := coalesce(auth.uid(), new.created_by);
  v_default_responsible uuid;
  v_assignee uuid;
  v_deadline_hours integer := 24;
  v_due_at timestamptz;
  v_description text;
  v_parent_description text;
  v_reopen boolean := false;
begin
  if pg_trigger_depth() > 1 then return new; end if;

  select greatest(1, least(720, coalesce((setting_value #>> '{}')::integer, 24)))
    into v_deadline_hours
  from public.operational_settings
  where setting_key = 'purchase_deadline_hours';
  v_deadline_hours := coalesce(v_deadline_hours, 24);

  begin
    select nullif(setting_value #>> '{}', '')::uuid
      into v_default_responsible
    from public.operational_settings
    where setting_key = 'default_purchase_responsible_id';
  exception when invalid_text_representation then
    v_default_responsible := null;
  end;

  if v_default_responsible is not null and not exists (
    select 1 from public.profiles where id = v_default_responsible and active
  ) then
    v_default_responsible := null;
  end if;
  v_assignee := coalesce(v_default_responsible, v_actor);

  select o.op_number, o.client_name into v_order_number, v_client_name
  from public.orders o where o.id = new.order_id;

  if new.availability = 'unavailable' then
    perform pg_advisory_xact_lock(hashtext('publicolor_activity_group_compras')::bigint);
    perform pg_advisory_xact_lock(hashtext(new.order_id::text)::bigint);

    select g.id into v_group_id
    from public.activity_groups g
    where lower(trim(g.name)) = 'compras'
    order by g.created_at limit 1;

    if v_group_id is null then
      insert into public.activity_groups(name, description, position, created_by)
      values ('Compras', 'Atividades automáticas e manuais relacionadas à compra de materiais.',
        coalesce((select max(position) + 1 from public.activity_groups), 0), v_actor)
      returning id into v_group_id;
    end if;

    v_due_at := now() + make_interval(hours => v_deadline_hours);
    v_parent_description := format('Compra consolidada dos materiais da OP %s · %s',
      coalesce(v_order_number, 'não identificada'), coalesce(v_client_name, 'cliente não identificado'));

    select a.id into v_parent_id
    from public.activities a
    where a.order_id = new.order_id and a.activity_type = 'purchase_order'
      and a.parent_id is null and a.deleted_at is null
    order by a.created_at limit 1;

    if v_parent_id is null then
      insert into public.activities(
        group_id,parent_id,title,description,due_date,due_at,priority,assigned_to,
        completed,activity_status,activity_type,order_id,order_material_id,position,created_by
      ) values (
        v_group_id,null,'Comprar materiais — OP ' || coalesce(v_order_number, 'não identificada'),
        v_parent_description,v_due_at::date,v_due_at,'normal',v_assignee,false,'pending',
        'purchase_order',new.order_id,null,
        coalesce((select max(a.position) + 1 from public.activities a where a.group_id = v_group_id and a.parent_id is null), 0),
        v_actor
      ) returning id into v_parent_id;
    else
      update public.activities
      set group_id = v_group_id,
          title = 'Comprar materiais — OP ' || coalesce(v_order_number, 'não identificada'),
          description = v_parent_description,
          assigned_to = coalesce(assigned_to, v_assignee),
          completed = case when activity_status = 'finalized' then false else completed end,
          activity_status = case when activity_status = 'finalized' then 'pending' else activity_status end,
          due_at = case when activity_status = 'finalized' then v_due_at else due_at end,
          due_date = case when activity_status = 'finalized' then v_due_at::date else due_date end,
          activity_type = 'purchase_order', order_id = new.order_id,
          order_material_id = null, deleted_at = null, deleted_by = null, updated_at = now()
      where id = v_parent_id;
    end if;

    select a.id, a.activity_status, a.completed
      into v_activity_id, v_activity_status, v_activity_completed
    from public.activities a
    where a.order_material_id = new.id
    order by a.created_at limit 1;

    v_reopen := v_activity_id is null or v_activity_completed or v_activity_status = 'finalized';
    if tg_op = 'UPDATE' and old.availability = 'available' then v_reopen := true; end if;

    v_description := format('OP %s · %s\nQuantidade: %s %s%s',
      coalesce(v_order_number, 'não identificada'), coalesce(v_client_name, 'cliente não identificado'),
      trim(to_char(new.quantity, 'FM999999990.###')), coalesce(nullif(trim(new.unit), ''), 'un'),
      case when nullif(trim(new.notes), '') is null then '' else E'\nObservação: ' || trim(new.notes) end);

    if v_activity_id is null then
      insert into public.activities(
        group_id,parent_id,title,description,due_date,due_at,priority,assigned_to,
        completed,activity_status,activity_type,order_id,order_material_id,position,created_by
      ) values (
        v_group_id,v_parent_id,trim(new.material_name),v_description,v_due_at::date,v_due_at,
        'normal',v_assignee,false,'pending','material_purchase',new.order_id,new.id,
        coalesce((select max(a.position) + 1 from public.activities a where a.parent_id = v_parent_id), 0),v_actor
      ) returning id, activity_status into v_activity_id, v_activity_status;
    elsif v_reopen then
      update public.activities
      set group_id = v_group_id, parent_id = v_parent_id, title = trim(new.material_name),
          description = v_description, due_date = v_due_at::date, due_at = v_due_at,
          assigned_to = v_assignee, completed = false, activity_status = 'pending',
          activity_type = 'material_purchase', order_id = new.order_id,
          deleted_at = null, deleted_by = null, updated_at = now()
      where id = v_activity_id returning activity_status into v_activity_status;
    else
      update public.activities
      set group_id = v_group_id, parent_id = v_parent_id, title = trim(new.material_name),
          description = v_description, assigned_to = coalesce(assigned_to, v_assignee),
          activity_type = 'material_purchase', order_id = new.order_id,
          deleted_at = null, deleted_by = null, updated_at = now()
      where id = v_activity_id returning activity_status into v_activity_status;
    end if;

    update public.order_materials
    set purchase_activity_id = v_activity_id,
        purchase_status = coalesce(v_activity_status, 'pending'),
        available_at = null, available_by = null
    where id = new.id;
  else
    v_activity_id := new.purchase_activity_id;
    if v_activity_id is null then
      select a.id into v_activity_id from public.activities a
      where a.order_material_id = new.id order by a.created_at limit 1;
    end if;
    if v_activity_id is not null then
      update public.activities
      set completed = true, activity_status = 'finalized', updated_at = now()
      where id = v_activity_id;
    end if;
    update public.order_materials
    set purchase_activity_id = v_activity_id,
        purchase_status = case when v_activity_id is null then null else 'finalized' end,
        available_at = coalesce(new.available_at, now()),
        available_by = coalesce(new.available_by, v_actor)
    where id = new.id;
  end if;
  return new;
end;
$$;
revoke all on function public.sync_purchase_activity_from_material() from public, anon;
grant execute on function public.sync_purchase_activity_from_material() to authenticated;

create or replace function public.sync_purchase_parent_from_child()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare v_deadline_hours integer := 24;
begin
  if pg_trigger_depth() > 1 or new.parent_id is null or new.activity_type <> 'material_purchase' then return new; end if;
  select greatest(1, least(720, coalesce((setting_value #>> '{}')::integer, 24)))
    into v_deadline_hours from public.operational_settings where setting_key = 'purchase_deadline_hours';
  v_deadline_hours := coalesce(v_deadline_hours, 24);
  if not new.completed and new.activity_status <> 'finalized' then
    update public.activities
    set completed = false,
        activity_status = case when activity_status = 'finalized' then 'pending' else activity_status end,
        due_at = case when activity_status = 'finalized' then now() + make_interval(hours => v_deadline_hours) else due_at end,
        due_date = case when activity_status = 'finalized' then (now() + make_interval(hours => v_deadline_hours))::date else due_date end,
        updated_at = now()
    where id = new.parent_id and activity_type = 'purchase_order' and deleted_at is null;
  end if;
  return new;
end;
$$;
revoke all on function public.sync_purchase_parent_from_child() from public, anon;
grant execute on function public.sync_purchase_parent_from_child() to authenticated;

-- Apenas uma compra principal ativa por OP; finalizadas logicamente podem ser preservadas.
drop index if exists public.activities_purchase_order_unique_idx;
create unique index activities_purchase_order_unique_idx
  on public.activities(order_id)
  where activity_type = 'purchase_order' and parent_id is null and order_id is not null and deleted_at is null;

-- Auditoria completa dos campos de compra e recebimento dentro do histórico da OS.
create or replace function public.log_order_material_changes()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor uuid := auth.uid();
  v_old_status text;
  v_new_status text;
  v_field text;
  v_old text;
  v_new text;
begin
  if old.material_name is distinct from new.material_name then
    insert into public.order_change_history(order_id, changed_by, field_name, old_value, new_value, change_group)
    values (new.order_id, v_actor, 'material_name', old.material_name, new.material_name, 'materials');
  end if;
  if old.quantity is distinct from new.quantity then
    insert into public.order_change_history(order_id, changed_by, field_name, old_value, new_value, change_group)
    values (new.order_id, v_actor, 'material_quantity',
      format('%s · %s %s', old.material_name, trim(to_char(old.quantity, 'FM999999990.###')), old.unit),
      format('%s · %s %s', new.material_name, trim(to_char(new.quantity, 'FM999999990.###')), new.unit), 'materials');
  end if;
  if old.unit is distinct from new.unit then
    insert into public.order_change_history(order_id, changed_by, field_name, old_value, new_value, change_group)
    values (new.order_id, v_actor, 'material_unit', format('%s · %s', old.material_name, old.unit), format('%s · %s', new.material_name, new.unit), 'materials');
  end if;
  if old.unit_price is distinct from new.unit_price then
    insert into public.order_change_history(order_id, changed_by, field_name, old_value, new_value, change_group)
    values (new.order_id, v_actor, 'material_unit_price', old.unit_price::text, new.unit_price::text, 'purchases');
  end if;
  if old.actual_unit_price is distinct from new.actual_unit_price then
    insert into public.order_change_history(order_id, changed_by, field_name, old_value, new_value, change_group)
    values (new.order_id, v_actor, 'material_actual_unit_price', old.actual_unit_price::text, new.actual_unit_price::text, 'purchases');
  end if;
  if old.purchased_quantity is distinct from new.purchased_quantity then
    insert into public.order_change_history(order_id, changed_by, field_name, old_value, new_value, change_group)
    values (new.order_id, v_actor, 'material_purchased_quantity', old.purchased_quantity::text, new.purchased_quantity::text, 'purchases');
  end if;
  if old.received_quantity is distinct from new.received_quantity then
    insert into public.order_change_history(order_id, changed_by, field_name, old_value, new_value, change_group)
    values (new.order_id, v_actor, 'material_received_quantity', old.received_quantity::text, new.received_quantity::text, 'purchases');
  end if;
  if old.purchase_order_number is distinct from new.purchase_order_number then
    insert into public.order_change_history(order_id, changed_by, field_name, old_value, new_value, change_group)
    values (new.order_id, v_actor, 'purchase_order_number', old.purchase_order_number, new.purchase_order_number, 'purchases');
  end if;
  if old.purchase_ordered_at is distinct from new.purchase_ordered_at then
    insert into public.order_change_history(order_id, changed_by, field_name, old_value, new_value, change_group)
    values (new.order_id, v_actor, 'purchase_ordered_at', old.purchase_ordered_at::text, new.purchase_ordered_at::text, 'purchases');
  end if;
  if old.invoice_number is distinct from new.invoice_number then
    insert into public.order_change_history(order_id, changed_by, field_name, old_value, new_value, change_group)
    values (new.order_id, v_actor, 'invoice_number', old.invoice_number, new.invoice_number, 'purchases');
  end if;
  if old.purchase_document_url is distinct from new.purchase_document_url then
    insert into public.order_change_history(order_id, changed_by, field_name, old_value, new_value, change_group)
    values (new.order_id, v_actor, 'purchase_document_url', old.purchase_document_url, new.purchase_document_url, 'purchases');
  end if;
  if old.invoice_file_url is distinct from new.invoice_file_url then
    insert into public.order_change_history(order_id, changed_by, field_name, old_value, new_value, change_group)
    values (new.order_id, v_actor, 'invoice_file_url', old.invoice_file_url, new.invoice_file_url, 'purchases');
  end if;
  if old.receipt_notes is distinct from new.receipt_notes then
    insert into public.order_change_history(order_id, changed_by, field_name, old_value, new_value, change_group)
    values (new.order_id, v_actor, 'receipt_notes', old.receipt_notes, new.receipt_notes, 'purchases');
  end if;
  if old.availability is distinct from new.availability then
    insert into public.order_change_history(order_id, changed_by, field_name, old_value, new_value, change_group)
    values (new.order_id, v_actor, 'material_availability', old.availability, new.availability, 'materials');
  end if;
  if old.purchase_status is distinct from new.purchase_status then
    v_old_status := coalesce(old.purchase_status, 'não definido');
    v_new_status := coalesce(new.purchase_status, 'não definido');
    insert into public.order_change_history(order_id, changed_by, field_name, old_value, new_value, change_group)
    values (new.order_id, v_actor, 'material_purchase_status', v_old_status, v_new_status, 'purchases');
  end if;
  if old.deleted_at is distinct from new.deleted_at then
    insert into public.order_change_history(order_id, changed_by, field_name, old_value, new_value, change_group)
    values (new.order_id, v_actor, 'material_deleted', old.deleted_at::text, new.deleted_at::text, 'materials');
  end if;
  return new;
end;
$$;
revoke all on function public.log_order_material_changes() from public, anon, authenticated;
drop trigger if exists order_materials_log_changes on public.order_materials;
create trigger order_materials_log_changes
after update of material_name, quantity, unit, unit_price, actual_unit_price, purchased_quantity,
  received_quantity, purchase_order_number, purchase_ordered_at, invoice_number,
  purchase_document_url, invoice_file_url, receipt_notes, availability, purchase_status, deleted_at
on public.order_materials
for each row execute function public.log_order_material_changes();

-- Auditoria administrativa.
create table if not exists public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists admin_audit_log_created_idx on public.admin_audit_log(created_at desc);
create index if not exists admin_audit_log_actor_idx on public.admin_audit_log(actor_id, created_at desc);
alter table public.admin_audit_log enable row level security;
drop policy if exists admin_audit_log_admin_read on public.admin_audit_log;
create policy admin_audit_log_admin_read on public.admin_audit_log for select to authenticated
using (public.current_user_role() = 'admin');
revoke insert, update, delete on public.admin_audit_log from anon, authenticated;
grant select on public.admin_audit_log to authenticated;

-- Fila preparada para reconciliações e integrações demoradas.
create table if not exists public.integration_jobs (
  id uuid primary key default gen_random_uuid(),
  job_type text not null,
  dedupe_key text,
  status text not null default 'queued' check (status in ('queued','running','succeeded','failed','cancelled')),
  attempts integer not null default 0 check (attempts >= 0),
  max_attempts integer not null default 5 check (max_attempts > 0),
  next_attempt_at timestamptz not null default now(),
  payload jsonb not null default '{}'::jsonb,
  result jsonb,
  last_error text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);
create unique index if not exists integration_jobs_active_dedupe_uidx
  on public.integration_jobs(dedupe_key)
  where dedupe_key is not null and status in ('queued','running');
create index if not exists integration_jobs_pending_idx
  on public.integration_jobs(status, next_attempt_at, created_at)
  where status in ('queued','failed');

create or replace function public.set_integration_job_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function public.set_integration_job_updated_at() from public, anon, authenticated;
drop trigger if exists integration_jobs_updated_at on public.integration_jobs;
create trigger integration_jobs_updated_at
before insert or update on public.integration_jobs
for each row execute function public.set_integration_job_updated_at();

-- Libera travas abandonadas por interrupções antigas. A próxima execução poderá
-- ser iniciada novamente pela tela de diagnóstico sem duplicar jobs ativos.
update public.integration_jobs
set status = 'failed',
    last_error = coalesce(last_error, 'Execução interrompida antes da conclusão.'),
    completed_at = coalesce(completed_at, now()),
    next_attempt_at = now(),
    updated_at = now()
where status = 'running'
  and coalesce(updated_at, started_at, created_at) < now() - interval '2 hours';

alter table public.integration_jobs enable row level security;
drop policy if exists integration_jobs_admin_read on public.integration_jobs;
create policy integration_jobs_admin_read on public.integration_jobs for select to authenticated
using (public.current_user_role() = 'admin');
revoke insert, update, delete on public.integration_jobs from anon, authenticated;
grant select on public.integration_jobs to authenticated;

alter table public.system_observability_events
  add column if not exists correlation_id uuid default gen_random_uuid(),
  add column if not exists route text,
  add column if not exists attempt integer;
create index if not exists system_observability_correlation_idx on public.system_observability_events(correlation_id);

-- Um único registro informa ao Dashboard que os totais mudaram.
create table if not exists public.dashboard_refresh_events (
  id smallint primary key default 1 check (id = 1),
  source text not null default 'system',
  changed_at timestamptz not null default now()
);
insert into public.dashboard_refresh_events(id, source) values (1, 'migration') on conflict (id) do nothing;
alter table public.dashboard_refresh_events enable row level security;
drop policy if exists dashboard_refresh_events_read on public.dashboard_refresh_events;
create policy dashboard_refresh_events_read on public.dashboard_refresh_events for select to authenticated
using ((select auth.uid()) is not null);
grant select on public.dashboard_refresh_events to authenticated;

create or replace function private.touch_dashboard_refresh()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  insert into public.dashboard_refresh_events(id, source, changed_at)
  values (1, tg_table_name, now())
  on conflict (id) do update set source = excluded.source, changed_at = excluded.changed_at;
  return null;
end;
$$;
revoke all on function private.touch_dashboard_refresh() from public, anon, authenticated;

do $$
declare target text;
begin
  foreach target in array array['orders','activities','order_materials'] loop
    execute format('drop trigger if exists %I on public.%I', target || '_dashboard_refresh', target);
    execute format('create trigger %I after insert or update or delete on public.%I for each statement execute function private.touch_dashboard_refresh()', target || '_dashboard_refresh', target);
  end loop;
end
$$;

-- Mantém o tempo no setor sem depender do frontend.
create or replace function public.prepare_order_sector_entry()
returns trigger language plpgsql security invoker set search_path = pg_catalog, public as $$
begin
  if tg_op = 'INSERT' then
    new.sector_entered_at := coalesce(new.sector_entered_at, now());
  elsif old.sector_id is distinct from new.sector_id or old.status is distinct from new.status then
    new.sector_entered_at := now();
  end if;
  return new;
end;
$$;
revoke all on function public.prepare_order_sector_entry() from public, anon, authenticated;
drop trigger if exists orders_prepare_sector_entry on public.orders;
create trigger orders_prepare_sector_entry before insert or update of sector_id, status on public.orders
for each row execute function public.prepare_order_sector_entry();

-- Presença do próprio usuário, sem liberar UPDATE direto sobre papel ou acesso.
create or replace function public.touch_my_profile()
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_user_id uuid := auth.uid();
begin
  if v_user_id is null then raise exception 'Usuário não autenticado.' using errcode = '42501'; end if;
  update public.profiles set last_seen_at = now(), invite_status = 'accepted' where id = v_user_id;
end;
$$;
revoke all on function public.touch_my_profile() from public, anon;
grant execute on function public.touch_my_profile() to authenticated;

-- Resumo compacto do Dashboard. A função respeita as políticas RLS.
create or replace function public.get_dashboard_operational_summary()
returns table (
  unavailable_order_count bigint,
  unavailable_material_count bigint,
  open_purchase_count bigint,
  purchase_overdue_count bigint,
  purchase_due_24h_count bigint,
  missing_price_count bigint,
  estimated_open_purchase_total numeric,
  created_last_7d bigint,
  completed_last_7d bigint,
  installation_overdue_count bigint,
  purchases_by_status jsonb
)
language sql
stable
security invoker
set search_path = pg_catalog, public
as $$
  select
    (select count(distinct m.order_id) from public.order_materials m where m.availability = 'unavailable' and m.deleted_at is null),
    (select count(*) from public.order_materials m where m.availability = 'unavailable' and m.deleted_at is null),
    (select count(*) from public.activities a where a.activity_type = 'material_purchase' and not a.completed and a.deleted_at is null),
    (select count(*) from public.activities a where a.activity_type = 'material_purchase' and not a.completed and a.deleted_at is null and a.due_at < now()),
    (select count(*) from public.activities a where a.activity_type = 'material_purchase' and not a.completed and a.deleted_at is null and a.due_at >= now() and a.due_at <= now() + interval '24 hours'),
    (select count(*) from public.order_materials m where m.availability = 'unavailable' and m.unit_price is null and m.deleted_at is null),
    coalesce((select sum(coalesce(m.quantity, 0) * coalesce(m.unit_price, 0)) from public.order_materials m where m.availability = 'unavailable' and m.deleted_at is null and coalesce(m.purchase_status, 'pending') <> 'finalized'), 0),
    (select count(*) from public.orders o where o.created_at >= now() - interval '7 days'),
    (select count(*) from public.orders o where o.status = 'completed' and o.completed_at >= now() - interval '7 days'),
    (select count(*) from public.orders o where o.status <> 'completed' and o.installation_scheduled_at < now() and coalesce(o.installation_status, 'pending') <> 'completed'),
    coalesce((select jsonb_object_agg(status_key, status_count) from (
      select a.activity_status as status_key, count(*) as status_count
      from public.activities a
      where a.activity_type = 'material_purchase' and not a.completed and a.deleted_at is null
      group by a.activity_status
    ) grouped), '{}'::jsonb);
$$;
revoke all on function public.get_dashboard_operational_summary() from public, anon;
grant execute on function public.get_dashboard_operational_summary() to authenticated;

-- Alteração de status atômica para principal e subatividades.
create or replace function public.cascade_activity_status(
  p_activity_id uuid,
  p_status text,
  p_include_children boolean default false
)
returns integer
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare v_count integer := 0;
begin
  if auth.uid() is null or not public.can_manage_activities() then
    raise exception 'Operação não autorizada.' using errcode = '42501';
  end if;
  if p_status not in ('pending','awaiting_quote','awaiting_separation','awaiting_delivery','finalized') then
    raise exception 'Status inválido.' using errcode = '22023';
  end if;
  update public.activities
  set activity_status = p_status, updated_at = now()
  where deleted_at is null
    and (id = p_activity_id or (p_include_children and parent_id = p_activity_id));
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke all on function public.cascade_activity_status(uuid, text, boolean) from public, anon;
grant execute on function public.cascade_activity_status(uuid, text, boolean) to authenticated;

-- Índices usados pelas páginas independentes e paginação.
create index if not exists orders_active_updated_idx on public.orders(updated_at desc) where status <> 'completed';
create index if not exists orders_completed_pagination_idx on public.orders(completed_at desc, id) where status = 'completed';
create index if not exists orders_sector_entry_idx on public.orders(sector_id, sector_entered_at) where status <> 'completed';
create index if not exists activities_visible_group_idx on public.activities(group_id, completed, position) where deleted_at is null;
create index if not exists activities_visible_parent_idx on public.activities(parent_id, position) where parent_id is not null and deleted_at is null;
create index if not exists activities_purchase_due_visible_idx on public.activities(activity_status, due_at) where activity_type = 'material_purchase' and completed = false and deleted_at is null;
create index if not exists order_materials_visible_order_idx on public.order_materials(order_id, created_at) where deleted_at is null;
create index if not exists profiles_access_idx on public.profiles(active, role, name);

-- Reduz o payload do Realtime; as chaves primárias permanecem disponíveis em DELETE.
alter table public.activities replica identity default;
alter table public.order_materials replica identity default;

-- Publicação apenas das entidades realmente utilizadas em tempo real.
do $$
declare target text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach target in array array['dashboard_refresh_events','activities','order_materials'] loop
      if to_regclass(format('public.%I', target)) is not null and not exists (
        select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = target
      ) then execute format('alter publication supabase_realtime add table public.%I', target); end if;
    end loop;
  end if;
end
$$;

notify pgrst, 'reload schema';
commit;
