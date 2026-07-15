-- PUBLICOLOR PCP 3.1.4 — SQL CUMULATIVO
-- Pode ser executado diretamente em bancos que ainda estão na versão 3.1.2.
-- A primeira etapa instala o fluxo 3.1.3; a segunda aplica a consolidação 3.1.4.

-- ================================================================
-- ETAPA 1 — BASE 3.1.3
-- ================================================================

-- Publicolor PCP 3.1.3
-- Materiais simplificados por OS e atividade automática de Compras.

begin;

-- Mantém compatibilidade com registros antigos, mas permite que o novo formulário
-- grave apenas o nome, a disponibilidade e uma observação opcional.
alter table public.order_materials
  alter column quantity set default 1;

alter table public.order_materials
  add column if not exists availability text,
  add column if not exists purchase_status text,
  add column if not exists purchase_activity_id uuid,
  add column if not exists available_at timestamptz,
  add column if not exists available_by uuid references public.profiles(id) on delete set null;

update public.order_materials
set availability = 'available'
where availability is null;

alter table public.order_materials
  alter column availability set default 'available',
  alter column availability set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'order_materials_availability_check'
      and conrelid = 'public.order_materials'::regclass
  ) then
    alter table public.order_materials
      add constraint order_materials_availability_check
      check (availability in ('available', 'unavailable'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'order_materials_purchase_status_check'
      and conrelid = 'public.order_materials'::regclass
  ) then
    alter table public.order_materials
      add constraint order_materials_purchase_status_check
      check (
        purchase_status is null or purchase_status in (
          'pending',
          'awaiting_quote',
          'awaiting_separation',
          'awaiting_delivery',
          'finalized'
        )
      );
  end if;
end
$$;

alter table public.activities
  add column if not exists activity_status text,
  add column if not exists activity_type text,
  add column if not exists order_id uuid,
  add column if not exists order_material_id uuid,
  add column if not exists due_at timestamptz;

update public.activities
set activity_status = case when completed then 'finalized' else 'pending' end
where activity_status is null;

update public.activities
set activity_type = 'general'
where activity_type is null;

alter table public.activities
  alter column activity_status set default 'pending',
  alter column activity_status set not null,
  alter column activity_type set default 'general',
  alter column activity_type set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'activities_activity_status_check'
      and conrelid = 'public.activities'::regclass
  ) then
    alter table public.activities
      add constraint activities_activity_status_check
      check (activity_status in (
        'pending',
        'awaiting_quote',
        'awaiting_separation',
        'awaiting_delivery',
        'finalized'
      ));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'activities_activity_type_check'
      and conrelid = 'public.activities'::regclass
  ) then
    alter table public.activities
      add constraint activities_activity_type_check
      check (activity_type in ('general', 'material_purchase'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'activities_order_id_fkey'
      and conrelid = 'public.activities'::regclass
  ) then
    alter table public.activities
      add constraint activities_order_id_fkey
      foreign key (order_id) references public.orders(id) on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'activities_order_material_id_fkey'
      and conrelid = 'public.activities'::regclass
  ) then
    alter table public.activities
      add constraint activities_order_material_id_fkey
      foreign key (order_material_id) references public.order_materials(id) on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'order_materials_purchase_activity_id_fkey'
      and conrelid = 'public.order_materials'::regclass
  ) then
    alter table public.order_materials
      add constraint order_materials_purchase_activity_id_fkey
      foreign key (purchase_activity_id) references public.activities(id) on delete set null;
  end if;
end
$$;

create unique index if not exists activities_order_material_unique_idx
  on public.activities(order_material_id)
  where order_material_id is not null;

create index if not exists activities_purchase_status_idx
  on public.activities(activity_type, activity_status, due_at)
  where activity_type = 'material_purchase';

create index if not exists order_materials_availability_idx
  on public.order_materials(order_id, availability, created_at);

-- Sincroniza o booleano histórico de conclusão com o novo status operacional.
create or replace function public.prepare_activity_completion()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  new.updated_at := now();

  if tg_op = 'INSERT' then
    if new.completed or new.activity_status = 'finalized' then
      new.completed := true;
      new.activity_status := 'finalized';
      new.completed_at := coalesce(new.completed_at, now());
      new.completed_by := coalesce(new.completed_by, auth.uid());
    else
      new.completed := false;
      new.completed_at := null;
      new.completed_by := null;
    end if;
    return new;
  end if;

  if new.completed is distinct from old.completed then
    if new.completed then
      new.activity_status := 'finalized';
      new.completed_at := now();
      new.completed_by := auth.uid();
    else
      if new.activity_status = 'finalized' then
        new.activity_status := 'pending';
      end if;
      if new.activity_type = 'material_purchase' then
        new.due_at := now() + interval '24 hours';
        new.due_date := new.due_at::date;
      end if;
      new.completed_at := null;
      new.completed_by := null;
    end if;
  elsif new.activity_status is distinct from old.activity_status then
    if new.activity_status = 'finalized' then
      new.completed := true;
      new.completed_at := now();
      new.completed_by := auth.uid();
    else
      new.completed := false;
      if old.activity_status = 'finalized' and new.activity_type = 'material_purchase' then
        new.due_at := now() + interval '24 hours';
        new.due_date := new.due_at::date;
      end if;
      new.completed_at := null;
      new.completed_by := null;
    end if;
  elsif new.completed then
    new.activity_status := 'finalized';
    new.completed_at := coalesce(new.completed_at, now());
    new.completed_by := coalesce(new.completed_by, auth.uid());
  end if;

  return new;
end;
$$;

create or replace function public.set_order_material_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists order_materials_set_updated_at on public.order_materials;
create trigger order_materials_set_updated_at
before update on public.order_materials
for each row execute function public.set_order_material_updated_at();

-- Cria/reabre a atividade de compra sempre que o material não estiver disponível.
create or replace function public.sync_purchase_activity_from_material()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_group_id uuid;
  v_activity_id uuid;
  v_activity_status text;
  v_activity_completed boolean;
  v_order_number text;
  v_client_name text;
  v_actor uuid := coalesce(auth.uid(), new.created_by);
  v_due_at timestamptz;
  v_description text;
  v_reopen boolean := false;
begin
  -- Evita retorno circular quando a alteração começou pela própria atividade.
  if pg_trigger_depth() > 1 then
    return new;
  end if;

  select o.op_number, o.client_name
    into v_order_number, v_client_name
  from public.orders o
  where o.id = new.order_id;

  if new.availability = 'unavailable' then
    select g.id
      into v_group_id
    from public.activity_groups g
    where lower(trim(g.name)) = 'compras'
    order by g.created_at
    limit 1;

    if v_group_id is null then
      insert into public.activity_groups(name, description, position, created_by)
      values (
        'Compras',
        'Atividades automáticas e manuais relacionadas à compra de materiais.',
        coalesce((select max(position) + 1 from public.activity_groups), 0),
        v_actor
      )
      returning id into v_group_id;
    end if;

    select a.id, a.activity_status, a.completed
      into v_activity_id, v_activity_status, v_activity_completed
    from public.activities a
    where a.order_material_id = new.id
    limit 1;

    v_reopen := v_activity_id is null
      or v_activity_completed
      or v_activity_status = 'finalized';

    if tg_op = 'UPDATE' then
      if old.availability = 'available' then
        v_reopen := true;
      end if;
    end if;

    v_due_at := now() + interval '24 hours';
    v_description := format(
      'OP %s · %s%s',
      coalesce(v_order_number, 'não identificada'),
      coalesce(v_client_name, 'cliente não identificado'),
      case when nullif(trim(new.notes), '') is null then '' else E'\nObservação: ' || trim(new.notes) end
    );

    if v_activity_id is null then
      insert into public.activities(
        group_id,
        title,
        description,
        due_date,
        due_at,
        priority,
        assigned_to,
        completed,
        activity_status,
        activity_type,
        order_id,
        order_material_id,
        position,
        created_by
      )
      values (
        v_group_id,
        'Comprar ' || trim(new.material_name),
        v_description,
        v_due_at::date,
        v_due_at,
        'normal',
        v_actor,
        false,
        'pending',
        'material_purchase',
        new.order_id,
        new.id,
        coalesce((
          select max(a.position) + 1
          from public.activities a
          where a.group_id = v_group_id and a.parent_id is null
        ), 0),
        v_actor
      )
      returning id, activity_status into v_activity_id, v_activity_status;
    elsif v_reopen then
      update public.activities
      set group_id = v_group_id,
          title = 'Comprar ' || trim(new.material_name),
          description = v_description,
          due_date = v_due_at::date,
          due_at = v_due_at,
          assigned_to = v_actor,
          completed = false,
          activity_status = 'pending',
          activity_type = 'material_purchase',
          order_id = new.order_id,
          updated_at = now()
      where id = v_activity_id
      returning activity_status into v_activity_status;
    else
      update public.activities
      set group_id = v_group_id,
          title = 'Comprar ' || trim(new.material_name),
          description = v_description,
          assigned_to = coalesce(assigned_to, v_actor),
          activity_type = 'material_purchase',
          order_id = new.order_id,
          updated_at = now()
      where id = v_activity_id
      returning activity_status into v_activity_status;
    end if;

    update public.order_materials
    set purchase_activity_id = v_activity_id,
        purchase_status = coalesce(v_activity_status, 'pending'),
        available_at = null,
        available_by = null
    where id = new.id;
  else
    v_activity_id := new.purchase_activity_id;

    if v_activity_id is null then
      select a.id into v_activity_id
      from public.activities a
      where a.order_material_id = new.id
      limit 1;
    end if;

    if v_activity_id is not null then
      update public.activities
      set completed = true,
          activity_status = 'finalized',
          updated_at = now()
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

-- Ao mudar o status da atividade, reflete imediatamente a disponibilidade na OS.
create or replace function public.sync_material_from_purchase_activity()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_actor uuid := coalesce(auth.uid(), new.completed_by, new.created_by);
begin
  if pg_trigger_depth() > 1
     or new.activity_type <> 'material_purchase'
     or new.order_material_id is null then
    return new;
  end if;

  if new.completed or new.activity_status = 'finalized' then
    update public.order_materials
    set availability = 'available',
        purchase_activity_id = new.id,
        purchase_status = 'finalized',
        available_at = coalesce(new.completed_at, now()),
        available_by = v_actor
    where id = new.order_material_id;
  else
    update public.order_materials
    set availability = 'unavailable',
        purchase_activity_id = new.id,
        purchase_status = new.activity_status,
        available_at = null,
        available_by = null
    where id = new.order_material_id;
  end if;

  return new;
end;
$$;

drop trigger if exists order_materials_sync_purchase_activity on public.order_materials;
create trigger order_materials_sync_purchase_activity
after insert or update of availability, material_name, notes
on public.order_materials
for each row execute function public.sync_purchase_activity_from_material();

drop trigger if exists activities_sync_order_material on public.activities;
create trigger activities_sync_order_material
after insert or update of activity_status, completed
on public.activities
for each row execute function public.sync_material_from_purchase_activity();

alter table public.order_materials replica identity full;
alter table public.activities replica identity full;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'order_materials'
     ) then
    alter publication supabase_realtime add table public.order_materials;
  end if;
exception
  when insufficient_privilege then null;
end
$$;

notify pgrst, 'reload schema';

commit;

-- ================================================================
-- ETAPA 2 — RECURSOS 3.1.4
-- ================================================================

-- Publicolor PCP 3.1.4
-- Compras consolidadas por OS, subatividades recolhíveis e preço unitário.

begin;

alter table public.order_materials
  add column if not exists unit_price numeric(14,2);

alter table public.order_materials
  drop constraint if exists order_materials_unit_price_check;

alter table public.order_materials
  add constraint order_materials_unit_price_check
  check (unit_price is null or unit_price >= 0);

alter table public.activities
  drop constraint if exists activities_activity_type_check;

alter table public.activities
  add constraint activities_activity_type_check
  check (activity_type in ('general', 'material_purchase', 'purchase_order'));

-- Converte as atividades de compra existentes em subatividades de uma compra
-- principal por OS, preservando status, responsável, prazo e vínculos.
do $$
declare
  r record;
  v_parent_id uuid;
  v_order_number text;
  v_client_name text;
  v_title text;
  v_description text;
begin
  for r in
    select
      a.order_id,
      (array_agg(a.group_id order by a.created_at, a.id))[1] as group_id,
      (array_agg(coalesce(a.assigned_to, a.created_by) order by a.created_at, a.id))[1] as actor_id,
      bool_and(a.completed or a.activity_status = 'finalized') as all_finalized,
      min(a.due_at) as first_due_at
    from public.activities a
    where a.activity_type = 'material_purchase'
      and a.order_id is not null
    group by a.order_id
  loop
    select o.op_number, o.client_name
      into v_order_number, v_client_name
    from public.orders o
    where o.id = r.order_id;

    v_title := 'Comprar materiais — OP ' || coalesce(v_order_number, 'não identificada');
    v_description := format(
      'Compra consolidada dos materiais da OP %s · %s',
      coalesce(v_order_number, 'não identificada'),
      coalesce(v_client_name, 'cliente não identificado')
    );

    select a.id
      into v_parent_id
    from public.activities a
    where a.order_id = r.order_id
      and a.activity_type = 'purchase_order'
      and a.parent_id is null
    order by a.created_at
    limit 1;

    if v_parent_id is null then
      insert into public.activities(
        group_id,
        parent_id,
        title,
        description,
        due_date,
        due_at,
        priority,
        assigned_to,
        completed,
        activity_status,
        activity_type,
        order_id,
        order_material_id,
        position,
        created_by
      )
      values (
        r.group_id,
        null,
        v_title,
        v_description,
        coalesce(r.first_due_at, now() + interval '24 hours')::date,
        coalesce(r.first_due_at, now() + interval '24 hours'),
        'normal',
        r.actor_id,
        r.all_finalized,
        case when r.all_finalized then 'finalized' else 'pending' end,
        'purchase_order',
        r.order_id,
        null,
        coalesce((
          select max(a.position) + 1
          from public.activities a
          where a.group_id = r.group_id and a.parent_id is null
        ), 0),
        r.actor_id
      )
      returning id into v_parent_id;
    else
      update public.activities
      set group_id = r.group_id,
          title = v_title,
          description = v_description,
          assigned_to = coalesce(assigned_to, r.actor_id),
          activity_type = 'purchase_order',
          order_id = r.order_id,
          order_material_id = null,
          updated_at = now()
      where id = v_parent_id;
    end if;

    update public.activities
    set parent_id = v_parent_id,
        group_id = r.group_id,
        updated_at = now()
    where activity_type = 'material_purchase'
      and order_id = r.order_id
      and id <> v_parent_id;
  end loop;
end
$$;

update public.activities a
set title = trim(m.material_name),
    updated_at = now()
from public.order_materials m
where a.activity_type = 'material_purchase'
  and a.order_material_id = m.id
  and a.title is distinct from trim(m.material_name);

create unique index if not exists activities_purchase_order_unique_idx
  on public.activities(order_id)
  where activity_type = 'purchase_order'
    and parent_id is null
    and order_id is not null;

create index if not exists order_materials_unit_price_idx
  on public.order_materials(order_id, unit_price)
  where unit_price is not null;

-- Mantém o booleano histórico e o status operacional sincronizados. A compra
-- principal também recebe novo prazo de 24 horas quando for reaberta.
create or replace function public.prepare_activity_completion()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  new.updated_at := now();

  if tg_op = 'INSERT' then
    if new.completed or new.activity_status = 'finalized' then
      new.completed := true;
      new.activity_status := 'finalized';
      new.completed_at := coalesce(new.completed_at, now());
      new.completed_by := coalesce(new.completed_by, auth.uid());
    else
      new.completed := false;
      new.completed_at := null;
      new.completed_by := null;
    end if;
    return new;
  end if;

  if new.completed is distinct from old.completed then
    if new.completed then
      new.activity_status := 'finalized';
      new.completed_at := now();
      new.completed_by := auth.uid();
    else
      if new.activity_status = 'finalized' then
        new.activity_status := 'pending';
      end if;
      if new.activity_type in ('material_purchase', 'purchase_order') then
        new.due_at := now() + interval '24 hours';
        new.due_date := new.due_at::date;
      end if;
      new.completed_at := null;
      new.completed_by := null;
    end if;
  elsif new.activity_status is distinct from old.activity_status then
    if new.activity_status = 'finalized' then
      new.completed := true;
      new.completed_at := now();
      new.completed_by := auth.uid();
    else
      new.completed := false;
      if old.activity_status = 'finalized'
         and new.activity_type in ('material_purchase', 'purchase_order') then
        new.due_at := now() + interval '24 hours';
        new.due_date := new.due_at::date;
      end if;
      new.completed_at := null;
      new.completed_by := null;
    end if;
  elsif new.completed then
    new.activity_status := 'finalized';
    new.completed_at := coalesce(new.completed_at, now());
    new.completed_by := coalesce(new.completed_by, auth.uid());
  end if;

  return new;
end;
$$;

-- Cria ou reutiliza uma compra principal por OS e mantém cada material como
-- subatividade vinculada. A atividade principal é reaberta quando um novo item
-- fica indisponível.
create or replace function public.sync_purchase_activity_from_material()
returns trigger
language plpgsql
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
  v_due_at timestamptz;
  v_description text;
  v_parent_description text;
  v_reopen boolean := false;
begin
  if pg_trigger_depth() > 1 then
    return new;
  end if;

  select o.op_number, o.client_name
    into v_order_number, v_client_name
  from public.orders o
  where o.id = new.order_id;

  if new.availability = 'unavailable' then
    -- Impede grupos Compras duplicados e duas atividades principais para a mesma OP.
    perform pg_advisory_xact_lock(hashtext('publicolor_activity_group_compras')::bigint);
    perform pg_advisory_xact_lock(hashtext(new.order_id::text)::bigint);

    select g.id
      into v_group_id
    from public.activity_groups g
    where lower(trim(g.name)) = 'compras'
    order by g.created_at
    limit 1;

    if v_group_id is null then
      insert into public.activity_groups(name, description, position, created_by)
      values (
        'Compras',
        'Atividades automáticas e manuais relacionadas à compra de materiais.',
        coalesce((select max(position) + 1 from public.activity_groups), 0),
        v_actor
      )
      returning id into v_group_id;
    end if;

    v_due_at := now() + interval '24 hours';
    v_parent_description := format(
      'Compra consolidada dos materiais da OP %s · %s',
      coalesce(v_order_number, 'não identificada'),
      coalesce(v_client_name, 'cliente não identificado')
    );

    select a.id
      into v_parent_id
    from public.activities a
    where a.order_id = new.order_id
      and a.activity_type = 'purchase_order'
      and a.parent_id is null
    order by a.created_at
    limit 1;

    if v_parent_id is null then
      insert into public.activities(
        group_id,
        parent_id,
        title,
        description,
        due_date,
        due_at,
        priority,
        assigned_to,
        completed,
        activity_status,
        activity_type,
        order_id,
        order_material_id,
        position,
        created_by
      )
      values (
        v_group_id,
        null,
        'Comprar materiais — OP ' || coalesce(v_order_number, 'não identificada'),
        v_parent_description,
        v_due_at::date,
        v_due_at,
        'normal',
        v_actor,
        false,
        'pending',
        'purchase_order',
        new.order_id,
        null,
        coalesce((
          select max(a.position) + 1
          from public.activities a
          where a.group_id = v_group_id and a.parent_id is null
        ), 0),
        v_actor
      )
      returning id into v_parent_id;
    else
      update public.activities
      set group_id = v_group_id,
          title = 'Comprar materiais — OP ' || coalesce(v_order_number, 'não identificada'),
          description = v_parent_description,
          assigned_to = coalesce(assigned_to, v_actor),
          completed = case when activity_status = 'finalized' then false else completed end,
          activity_status = case when activity_status = 'finalized' then 'pending' else activity_status end,
          due_at = case when activity_status = 'finalized' then v_due_at else due_at end,
          due_date = case when activity_status = 'finalized' then v_due_at::date else due_date end,
          activity_type = 'purchase_order',
          order_id = new.order_id,
          order_material_id = null,
          updated_at = now()
      where id = v_parent_id;
    end if;

    select a.id, a.activity_status, a.completed
      into v_activity_id, v_activity_status, v_activity_completed
    from public.activities a
    where a.order_material_id = new.id
    limit 1;

    v_reopen := v_activity_id is null
      or v_activity_completed
      or v_activity_status = 'finalized';

    if tg_op = 'UPDATE' and old.availability = 'available' then
      v_reopen := true;
    end if;

    v_description := format(
      'OP %s · %s\nQuantidade: %s %s%s',
      coalesce(v_order_number, 'não identificada'),
      coalesce(v_client_name, 'cliente não identificado'),
      trim(to_char(new.quantity, 'FM999999990.###')),
      coalesce(nullif(trim(new.unit), ''), 'un'),
      case when nullif(trim(new.notes), '') is null then '' else E'\nObservação: ' || trim(new.notes) end
    );

    if v_activity_id is null then
      insert into public.activities(
        group_id,
        parent_id,
        title,
        description,
        due_date,
        due_at,
        priority,
        assigned_to,
        completed,
        activity_status,
        activity_type,
        order_id,
        order_material_id,
        position,
        created_by
      )
      values (
        v_group_id,
        v_parent_id,
        trim(new.material_name),
        v_description,
        v_due_at::date,
        v_due_at,
        'normal',
        v_actor,
        false,
        'pending',
        'material_purchase',
        new.order_id,
        new.id,
        coalesce((
          select max(a.position) + 1
          from public.activities a
          where a.parent_id = v_parent_id
        ), 0),
        v_actor
      )
      returning id, activity_status into v_activity_id, v_activity_status;
    elsif v_reopen then
      update public.activities
      set group_id = v_group_id,
          parent_id = v_parent_id,
          title = trim(new.material_name),
          description = v_description,
          due_date = v_due_at::date,
          due_at = v_due_at,
          assigned_to = v_actor,
          completed = false,
          activity_status = 'pending',
          activity_type = 'material_purchase',
          order_id = new.order_id,
          updated_at = now()
      where id = v_activity_id
      returning activity_status into v_activity_status;
    else
      update public.activities
      set group_id = v_group_id,
          parent_id = v_parent_id,
          title = trim(new.material_name),
          description = v_description,
          assigned_to = coalesce(assigned_to, v_actor),
          activity_type = 'material_purchase',
          order_id = new.order_id,
          updated_at = now()
      where id = v_activity_id
      returning activity_status into v_activity_status;
    end if;

    update public.order_materials
    set purchase_activity_id = v_activity_id,
        purchase_status = coalesce(v_activity_status, 'pending'),
        available_at = null,
        available_by = null
    where id = new.id;
  else
    v_activity_id := new.purchase_activity_id;

    if v_activity_id is null then
      select a.id into v_activity_id
      from public.activities a
      where a.order_material_id = new.id
      limit 1;
    end if;

    if v_activity_id is not null then
      update public.activities
      set completed = true,
          activity_status = 'finalized',
          updated_at = now()
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

-- Ao reabrir uma subatividade, reabre a atividade principal para impedir que
-- uma compra com itens pendentes permaneça finalizada e oculta.
create or replace function public.sync_purchase_parent_from_child()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if pg_trigger_depth() > 1
     or new.parent_id is null
     or new.activity_type <> 'material_purchase' then
    return new;
  end if;

  if not new.completed and new.activity_status <> 'finalized' then
    update public.activities
    set completed = false,
        activity_status = case when activity_status = 'finalized' then 'pending' else activity_status end,
        due_at = case when activity_status = 'finalized' then now() + interval '24 hours' else due_at end,
        due_date = case when activity_status = 'finalized' then (now() + interval '24 hours')::date else due_date end,
        updated_at = now()
    where id = new.parent_id
      and activity_type = 'purchase_order';
  end if;

  return new;
end;
$$;

-- Atualiza o texto automático quando quantidade ou unidade forem alteradas.
drop trigger if exists order_materials_sync_purchase_activity on public.order_materials;
create trigger order_materials_sync_purchase_activity
after insert or update of availability, material_name, quantity, unit, notes
on public.order_materials
for each row execute function public.sync_purchase_activity_from_material();

-- Registra alterações de nome, quantidade, unidade, preço e disponibilidade no
-- histórico da própria OS.
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
begin
  if old.material_name is distinct from new.material_name then
    insert into public.order_change_history(order_id, changed_by, field_name, old_value, new_value, change_group)
    values (new.order_id, v_actor, 'material_name', old.material_name, new.material_name, 'materials');
  end if;

  if old.quantity is distinct from new.quantity then
    insert into public.order_change_history(order_id, changed_by, field_name, old_value, new_value, change_group)
    values (
      new.order_id,
      v_actor,
      'material_quantity',
      format('%s · %s %s', old.material_name, trim(to_char(old.quantity, 'FM999999990.###')), old.unit),
      format('%s · %s %s', new.material_name, trim(to_char(new.quantity, 'FM999999990.###')), new.unit),
      'materials'
    );
  end if;

  if old.unit is distinct from new.unit then
    insert into public.order_change_history(order_id, changed_by, field_name, old_value, new_value, change_group)
    values (
      new.order_id,
      v_actor,
      'material_unit',
      format('%s · %s', old.material_name, old.unit),
      format('%s · %s', new.material_name, new.unit),
      'materials'
    );
  end if;

  if old.unit_price is distinct from new.unit_price then
    insert into public.order_change_history(order_id, changed_by, field_name, old_value, new_value, change_group)
    values (
      new.order_id,
      v_actor,
      'material_unit_price',
      case when old.unit_price is null then old.material_name || ' · não informado' else format('%s · R$ %s', old.material_name, trim(to_char(old.unit_price, 'FM999999990.00'))) end,
      case when new.unit_price is null then new.material_name || ' · não informado' else format('%s · R$ %s', new.material_name, trim(to_char(new.unit_price, 'FM999999990.00'))) end,
      'materials'
    );
  end if;

  if old.availability is distinct from new.availability then
    insert into public.order_change_history(order_id, changed_by, field_name, old_value, new_value, change_group)
    values (
      new.order_id,
      v_actor,
      'material_availability',
      format('%s · %s', old.material_name, case when old.availability = 'available' then 'Disponível' else 'Não disponível' end),
      format('%s · %s', new.material_name, case when new.availability = 'available' then 'Disponível' else 'Não disponível' end),
      'materials'
    );
  end if;

  if old.purchase_status is distinct from new.purchase_status then
    v_old_status := case old.purchase_status
      when 'pending' then 'Pendente'
      when 'awaiting_quote' then 'Aguardando orçamento'
      when 'awaiting_separation' then 'Aguardando separação'
      when 'awaiting_delivery' then 'Aguardando entrega'
      when 'finalized' then 'Finalizada'
      else 'Não definido'
    end;
    v_new_status := case new.purchase_status
      when 'pending' then 'Pendente'
      when 'awaiting_quote' then 'Aguardando orçamento'
      when 'awaiting_separation' then 'Aguardando separação'
      when 'awaiting_delivery' then 'Aguardando entrega'
      when 'finalized' then 'Finalizada'
      else 'Não definido'
    end;
    insert into public.order_change_history(order_id, changed_by, field_name, old_value, new_value, change_group)
    values (
      new.order_id,
      v_actor,
      'material_purchase_status',
      format('%s · %s', old.material_name, v_old_status),
      format('%s · %s', new.material_name, v_new_status),
      'materials'
    );
  end if;

  return new;
end;
$$;

revoke all on function public.log_order_material_changes() from public;
revoke all on function public.log_order_material_changes() from anon;
revoke all on function public.log_order_material_changes() from authenticated;

drop trigger if exists order_materials_log_changes on public.order_materials;
create trigger order_materials_log_changes
after update of material_name, quantity, unit, unit_price, availability, purchase_status
on public.order_materials
for each row execute function public.log_order_material_changes();

drop trigger if exists activities_sync_purchase_parent on public.activities;
create trigger activities_sync_purchase_parent
after insert or update of activity_status, completed, parent_id
on public.activities
for each row execute function public.sync_purchase_parent_from_child();

create or replace function public.cleanup_empty_purchase_parent()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if pg_trigger_depth() > 1 then
    return old;
  end if;

  if old.activity_type = 'material_purchase' and old.parent_id is not null then
    delete from public.activities parent
    where parent.id = old.parent_id
      and parent.activity_type = 'purchase_order'
      and not exists (
        select 1 from public.activities child where child.parent_id = parent.id
      );
  end if;
  return old;
end;
$$;

drop trigger if exists activities_cleanup_purchase_parent on public.activities;
create trigger activities_cleanup_purchase_parent
after delete on public.activities
for each row execute function public.cleanup_empty_purchase_parent();

alter table public.order_materials replica identity full;
alter table public.activities replica identity full;

notify pgrst, 'reload schema';

commit;
-- Publicolor PCP 3.2.0
-- Otimizações de banco, edição sincronizada de materiais e consultas operacionais.

begin;

-- Índices direcionados às páginas independentes. Todos usam IF NOT EXISTS para
-- permitir execução segura em bancos já parcialmente atualizados.
create index if not exists orders_active_sector_status_idx
  on public.orders(sector_id, status, delivery_date, position)
  where status <> 'completed';

create index if not exists orders_active_delivery_idx
  on public.orders(delivery_date, priority, sector_id)
  where status <> 'completed';

create index if not exists orders_installation_schedule_idx
  on public.orders(installation_scheduled_at, installation_status)
  where installation_scheduled_at is not null;

create index if not exists orders_client_active_idx
  on public.orders(client_id, status, created_at desc)
  where client_id is not null;

create index if not exists activities_open_group_due_idx
  on public.activities(group_id, due_at, position)
  where completed = false;

create index if not exists activities_order_type_status_idx
  on public.activities(order_id, activity_type, activity_status, updated_at desc)
  where order_id is not null;

create index if not exists activities_parent_open_idx
  on public.activities(parent_id, completed, position)
  where parent_id is not null;

create index if not exists order_materials_order_availability_status_idx
  on public.order_materials(order_id, availability, purchase_status, created_at)
  where availability = 'unavailable';

create index if not exists order_history_order_created_idx
  on public.order_history(order_id, created_at desc);

create index if not exists order_history_recent_idx
  on public.order_history(created_at desc);

create index if not exists order_change_history_order_created_idx
  on public.order_change_history(order_id, created_at desc);

create index if not exists order_files_active_order_created_idx
  on public.order_files(order_id, created_at desc)
  where removed_from_order_at is null;

-- Renomeia somente o material realmente vinculado à atividade informada. A
-- função permanece SECURITY INVOKER para respeitar as políticas RLS da tabela.
create or replace function public.rename_linked_order_material(
  p_activity_id uuid,
  p_material_name text
)
returns table (
  material_id uuid,
  order_id uuid,
  material_name text
)
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_name text := trim(coalesce(p_material_name, ''));
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.' using errcode = '42501';
  end if;

  if v_name = '' then
    raise exception 'O nome do material não pode ficar vazio.' using errcode = '22023';
  end if;

  return query
  update public.order_materials m
  set material_name = v_name,
      updated_at = now()
  from public.activities a
  where a.id = p_activity_id
    and a.activity_type = 'material_purchase'
    and a.order_material_id = m.id
  returning m.id, m.order_id, m.material_name;

  if not found then
    raise exception 'Atividade de compra sem material vinculado.' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.rename_linked_order_material(uuid, text) from public;
revoke all on function public.rename_linked_order_material(uuid, text) from anon;
grant execute on function public.rename_linked_order_material(uuid, text) to authenticated;

-- Garante que alterações externas no material continuem refletidas no título da
-- subatividade, inclusive importações e correções feitas diretamente na OS.
create or replace function public.keep_purchase_activity_title_in_sync()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  if pg_trigger_depth() > 1 or old.material_name is not distinct from new.material_name then
    return new;
  end if;

  update public.activities
  set title = trim(new.material_name),
      updated_at = now()
  where order_material_id = new.id
    and activity_type = 'material_purchase'
    and title is distinct from trim(new.material_name);

  return new;
end;
$$;

revoke all on function public.keep_purchase_activity_title_in_sync() from public;
revoke all on function public.keep_purchase_activity_title_in_sync() from anon;
revoke all on function public.keep_purchase_activity_title_in_sync() from authenticated;

drop trigger if exists order_materials_keep_activity_title on public.order_materials;
create trigger order_materials_keep_activity_title
after update of material_name on public.order_materials
for each row execute function public.keep_purchase_activity_title_in_sync();

alter table public.activities replica identity full;
alter table public.order_materials replica identity full;

notify pgrst, 'reload schema';

commit;
