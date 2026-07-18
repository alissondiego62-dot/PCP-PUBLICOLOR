-- PUBLICOLOR PCP 3.4.2 — ATUALIZAÇÃO CUMULATIVA
-- Execute primeiro em HOMOLOGAÇÃO. Este arquivo inclui as estruturas de
-- Materiais/Compras 3.1.3–3.1.4, Dashboard/rotas 3.2.0 e Fundação 3.4.1.
-- Não execute os SQLs antigos separadamente depois deste arquivo.

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


-- Publicolor PCP 3.4.1
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

-- ============================================================================
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

-- PUBLICOLOR PCP 3.5.0 REVISADO
-- Configuração do Kanban e fluxo Produção Concluída -> Agenda -> Instalação.
-- Esta migração é idempotente e também corrige uma aplicação parcial do 3.5.0 anterior.

begin;

-- -----------------------------------------------------------------------------
-- 1. Configuração dos setores
-- -----------------------------------------------------------------------------

alter table public.sectors
  add column if not exists uses_status boolean not null default true,
  add column if not exists requires_scheduling boolean not null default false,
  add column if not exists show_in_agenda boolean not null default false,
  add column if not exists allow_manual_move boolean not null default true,
  add column if not exists special_type text,
  add column if not exists color text,
  add column if not exists icon text;

alter table public.sectors drop constraint if exists sectors_special_type_check;
alter table public.sectors
  add constraint sectors_special_type_check
  check (special_type is null or special_type in ('production_completed', 'installation'));

alter table public.sectors drop constraint if exists sectors_color_check;
alter table public.sectors
  add constraint sectors_color_check
  check (color is null or color ~ '^#[0-9A-Fa-f]{6}$');

-- Corrige possíveis duplicidades deixadas por uma execução parcial anterior.
with duplicated as (
  select id,
         row_number() over (partition by special_type order by active desc, position, id) as row_number
  from public.sectors
  where special_type is not null
)
update public.sectors s
set special_type = null
from duplicated d
where s.id = d.id
  and d.row_number > 1;

create unique index if not exists sectors_special_type_unique_idx
  on public.sectors (special_type)
  where special_type is not null;

create index if not exists sectors_active_position_idx
  on public.sectors (active, position, name);

-- Remove a regra anterior antes de reorganizar os registros existentes.
drop trigger if exists orders_enforce_installation_schedule on public.orders;
drop trigger if exists orders_enforce_special_sector_flow on public.orders;
drop function if exists public.enforce_installation_schedule();
drop function if exists public.enforce_special_sector_flow();

do $$
declare
  v_installation_id uuid;
  v_production_completed_id uuid;
  v_installation_position integer;
begin
  select id, position
  into v_installation_id, v_installation_position
  from public.sectors
  where special_type = 'installation'
     or public.normalize_publicolor_text(name) = 'INSTALACAO'
  order by case when special_type = 'installation' then 0 else 1 end,
           active desc,
           position
  limit 1;

  if v_installation_id is null then
    select coalesce(max(position), 0) + 1
    into v_installation_position
    from public.sectors;

    insert into public.sectors (
      name, position, active, uses_status, requires_scheduling,
      show_in_agenda, allow_manual_move, special_type, color
    ) values (
      'INSTALAÇÃO', v_installation_position, true, false, true,
      true, true, 'installation', '#2563EB'
    ) returning id into v_installation_id;
  else
    update public.sectors
    set name = 'INSTALAÇÃO',
        active = true,
        uses_status = false,
        requires_scheduling = true,
        show_in_agenda = true,
        allow_manual_move = true,
        special_type = 'installation',
        color = coalesce(color, '#2563EB')
    where id = v_installation_id;
  end if;

  select id
  into v_production_completed_id
  from public.sectors
  where special_type = 'production_completed'
     or public.normalize_publicolor_text(name) in ('PRODUCAO CONCLUIDA', 'PRODUCAO FINALIZADA')
  order by case when special_type = 'production_completed' then 0 else 1 end,
           active desc,
           position
  limit 1;

  if v_production_completed_id is null then
    insert into public.sectors (
      name, position, active, uses_status, requires_scheduling,
      show_in_agenda, allow_manual_move, special_type, color
    ) values (
      'PRODUÇÃO CONCLUÍDA', v_installation_position, true, false, false,
      true, true, 'production_completed', '#16A34A'
    ) returning id into v_production_completed_id;
  else
    update public.sectors
    set name = 'PRODUÇÃO CONCLUÍDA',
        active = true,
        uses_status = false,
        requires_scheduling = false,
        show_in_agenda = true,
        allow_manual_move = true,
        special_type = 'production_completed',
        color = coalesce(color, '#16A34A')
    where id = v_production_completed_id;
  end if;

  -- Reordena sem criar posições duplicadas: Produção Concluída fica imediatamente
  -- antes de Instalação e os demais setores preservam sua ordem relativa.
  with ranked as (
    select id,
           row_number() over (
             order by
               case
                 when id = v_production_completed_id then v_installation_position::numeric - 0.5
                 when id = v_installation_id then v_installation_position::numeric
                 else position::numeric
               end,
               case when id = v_production_completed_id then 0 when id = v_installation_id then 1 else 2 end,
               name,
               id
           )::integer as new_position
    from public.sectors
  )
  update public.sectors s
  set position = ranked.new_position
  from ranked
  where s.id = ranked.id;

  -- Solicitação operacional: todos os pedidos que estavam em Instalação voltam,
  -- por ora, para Produção Concluída. Datas anteriores são preservadas apenas como
  -- referência, mas precisam ser confirmadas novamente na Agenda.
  update public.orders
  set sector_id = v_production_completed_id,
      status = 'waiting',
      installation_status = 'pending',
      installation_time_confirmed = false,
      updated_at = now()
  where sector_id = v_installation_id
    and status <> 'completed';

  update public.orders
  set status = 'waiting',
      installation_status = 'pending',
      installation_time_confirmed = false,
      updated_at = now()
  where sector_id = v_production_completed_id
    and status <> 'completed';
end
$$;

-- -----------------------------------------------------------------------------
-- 2. Regras de segurança dos setores
-- -----------------------------------------------------------------------------

alter table public.sectors enable row level security;

drop policy if exists sectors_read_authenticated on public.sectors;
create policy sectors_read_authenticated
on public.sectors for select to authenticated
using ((select auth.uid()) is not null);

-- Políticas permissivas necessárias para a operação normal.
drop policy if exists sectors_operation_insert on public.sectors;
create policy sectors_operation_insert
on public.sectors for insert to authenticated
with check ((select private.has_app_permission('settings.operation')));

drop policy if exists sectors_operation_update on public.sectors;
create policy sectors_operation_update
on public.sectors for update to authenticated
using ((select private.has_app_permission('settings.operation')))
with check ((select private.has_app_permission('settings.operation')));

drop policy if exists sectors_operation_delete on public.sectors;
create policy sectors_operation_delete
on public.sectors for delete to authenticated
using ((select private.has_app_permission('settings.operation')));

-- Políticas restritivas impedem que uma política antiga e ampla contorne a permissão.
drop policy if exists sectors_operation_insert_restrictive on public.sectors;
create policy sectors_operation_insert_restrictive
on public.sectors as restrictive for insert to authenticated
with check ((select private.has_app_permission('settings.operation')));

drop policy if exists sectors_operation_update_restrictive on public.sectors;
create policy sectors_operation_update_restrictive
on public.sectors as restrictive for update to authenticated
using ((select private.has_app_permission('settings.operation')))
with check ((select private.has_app_permission('settings.operation')));

drop policy if exists sectors_operation_delete_restrictive on public.sectors;
create policy sectors_operation_delete_restrictive
on public.sectors as restrictive for delete to authenticated
using ((select private.has_app_permission('settings.operation')));

grant select, insert, update, delete on public.sectors to authenticated;

-- A Agenda também precisa conseguir atualizar os campos da OS.
drop policy if exists orders_permission_update on public.orders;
create policy orders_permission_update
on public.orders as restrictive for update to authenticated
using (
  (select private.has_app_permission('orders.edit'))
  or (select private.has_app_permission('production.move'))
  or (select private.has_app_permission('orders.finalize'))
  or (select private.has_app_permission('agenda.manage'))
)
with check (
  (select private.has_app_permission('orders.edit'))
  or (select private.has_app_permission('production.move'))
  or (select private.has_app_permission('orders.finalize'))
  or (select private.has_app_permission('agenda.manage'))
);

-- -----------------------------------------------------------------------------
-- 3. Regra obrigatória de agendamento
-- -----------------------------------------------------------------------------

create or replace function public.enforce_special_sector_flow()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_target_special_type text;
  v_target_uses_status boolean;
  v_previous_special_type text;
begin
  select special_type, uses_status
  into v_target_special_type, v_target_uses_status
  from public.sectors
  where id = new.sector_id;

  if tg_op = 'UPDATE' then
    select special_type
    into v_previous_special_type
    from public.sectors
    where id = old.sector_id;
  end if;

  if new.status <> 'completed' and v_target_special_type = 'installation' then
    if new.installation_scheduled_at is null
       or coalesce(new.installation_time_confirmed, false) is not true then
      raise exception 'Defina e confirme a data e a hora antes de mover o pedido para Instalação.'
        using errcode = '23514';
    end if;
    new.status := 'waiting';
    new.installation_status := case
      when new.installation_status in ('in_progress', 'completed') then new.installation_status
      else 'scheduled'
    end;
  elsif new.status <> 'completed' and v_target_special_type = 'production_completed' then
    new.status := 'waiting';
    new.installation_status := 'pending';
    new.installation_time_confirmed := false;
  elsif new.status <> 'completed' and coalesce(v_target_uses_status, true) is false then
    new.status := 'waiting';
  end if;

  if tg_op = 'UPDATE'
     and new.status <> 'completed'
     and v_previous_special_type = 'installation'
     and v_target_special_type is distinct from 'installation' then
    new.installation_status := 'pending';
    new.installation_time_confirmed := false;
  end if;

  return new;
end;
$$;

create trigger orders_enforce_special_sector_flow
before insert or update of sector_id, status, installation_scheduled_at,
  installation_time_confirmed, installation_status
on public.orders
for each row execute function public.enforce_special_sector_flow();

-- -----------------------------------------------------------------------------
-- 4. Agendamento atômico de um pedido ou de uma pilha
-- -----------------------------------------------------------------------------

create or replace function private.schedule_orders_for_installation(
  p_order_ids uuid[],
  p_scheduled_at timestamptz,
  p_team text,
  p_vehicle text,
  p_address text,
  p_notes text
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_order_ids uuid[];
  v_installation_id uuid;
  v_expected integer;
  v_updated integer;
begin
  if (select auth.uid()) is null
     or not private.has_app_permission('agenda.manage') then
    raise exception 'Você não possui permissão para gerenciar a Agenda.'
      using errcode = '42501';
  end if;

  if p_scheduled_at is null then
    raise exception 'A data e a hora da instalação são obrigatórias.'
      using errcode = '23514';
  end if;

  select array_agg(distinct value)
  into v_order_ids
  from unnest(coalesce(p_order_ids, array[]::uuid[])) as u(value);

  if coalesce(cardinality(v_order_ids), 0) = 0 then
    raise exception 'Nenhum pedido foi informado para o agendamento.'
      using errcode = '22023';
  end if;

  select id
  into v_installation_id
  from public.sectors
  where special_type = 'installation'
    and active is true
  limit 1;

  if v_installation_id is null then
    raise exception 'O setor especial Instalação não está ativo.'
      using errcode = '23514';
  end if;

  select count(*)
  into v_expected
  from public.orders
  where id = any(v_order_ids)
    and status <> 'completed';

  if v_expected <> cardinality(v_order_ids) then
    raise exception 'Um ou mais pedidos não existem ou já foram concluídos.'
      using errcode = '23514';
  end if;

  update public.orders
  set sector_id = v_installation_id,
      status = 'waiting',
      installation_scheduled_at = p_scheduled_at,
      installation_status = 'scheduled',
      installation_time_confirmed = true,
      installation_team = coalesce(nullif(trim(p_team), ''), installation_team),
      installation_vehicle = coalesce(nullif(trim(p_vehicle), ''), installation_vehicle),
      installation_address = coalesce(nullif(trim(p_address), ''), installation_address),
      installation_notes = coalesce(nullif(trim(p_notes), ''), installation_notes),
      installation_completed_at = null,
      updated_at = now()
  where id = any(v_order_ids)
    and status <> 'completed';

  get diagnostics v_updated = row_count;

  if v_updated <> cardinality(v_order_ids) then
    raise exception 'Nem todos os pedidos puderam ser agendados.'
      using errcode = 'P0001';
  end if;

  insert into public.order_history (order_id, action_type, description, user_id)
  select id,
         'installation_scheduled',
         format(
           'Instalação agendada para %s e pedido movido para Instalação.',
           to_char(p_scheduled_at at time zone 'America/Manaus', 'DD/MM/YYYY HH24:MI')
         ),
         (select auth.uid())
  from public.orders
  where id = any(v_order_ids);

  return v_updated;
end;
$$;

revoke all on function private.schedule_orders_for_installation(uuid[], timestamptz, text, text, text, text)
from public, anon;
grant execute on function private.schedule_orders_for_installation(uuid[], timestamptz, text, text, text, text)
to authenticated;

create or replace function public.schedule_orders_for_installation(
  p_order_ids uuid[],
  p_scheduled_at timestamptz,
  p_team text,
  p_vehicle text,
  p_address text,
  p_notes text
)
returns integer
language sql
security definer
set search_path = pg_catalog, public, private
as $$
  select private.schedule_orders_for_installation(
    p_order_ids, p_scheduled_at, p_team, p_vehicle, p_address, p_notes
  )
$$;

revoke all on function public.schedule_orders_for_installation(uuid[], timestamptz, text, text, text, text)
from public, anon;
grant execute on function public.schedule_orders_for_installation(uuid[], timestamptz, text, text, text, text)
to authenticated;

-- -----------------------------------------------------------------------------
-- 5. Reordenação segura dos setores pelo endpoint administrativo
-- -----------------------------------------------------------------------------

create or replace function public.reorder_kanban_sectors(p_sector_ids uuid[])
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_total integer;
  v_distinct_total integer;
  v_existing_total integer;
begin
  v_total := coalesce(cardinality(p_sector_ids), 0);
  if v_total = 0 then
    raise exception 'A lista de setores não pode ficar vazia.' using errcode = '22023';
  end if;

  select count(distinct value) into v_distinct_total
  from unnest(p_sector_ids) as u(value);
  if v_distinct_total <> v_total then
    raise exception 'A lista de setores possui identificadores repetidos.' using errcode = '22023';
  end if;

  select count(*) into v_existing_total
  from public.sectors
  where id = any(p_sector_ids);
  if v_existing_total <> v_total then
    raise exception 'A lista contém um setor inexistente.' using errcode = '22023';
  end if;

  update public.sectors s
  set position = ordered.ordinality::integer
  from unnest(p_sector_ids) with ordinality as ordered(id, ordinality)
  where s.id = ordered.id;

  with remaining as (
    select id,
           row_number() over (order by position, name, id)::integer + v_total as next_position
    from public.sectors
    where not (id = any(p_sector_ids))
  )
  update public.sectors s
  set position = remaining.next_position
  from remaining
  where s.id = remaining.id;
end;
$$;

revoke all on function public.reorder_kanban_sectors(uuid[]) from public, anon, authenticated;
grant execute on function public.reorder_kanban_sectors(uuid[]) to service_role;

insert into public.system_settings (key, value, description)
values (
  'database_release',
  to_jsonb('3.5.0-revisado'::text),
  'Configuração do Kanban e fluxo Produção Concluída, Agenda e Instalação'
)
on conflict (key) do update
set value = excluded.value,
    description = excluded.description,
    updated_at = now();

notify pgrst, 'reload schema';
commit;
