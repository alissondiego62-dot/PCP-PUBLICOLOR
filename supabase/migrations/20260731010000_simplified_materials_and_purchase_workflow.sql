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
