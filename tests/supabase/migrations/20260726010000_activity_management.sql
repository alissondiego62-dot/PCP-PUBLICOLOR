begin;

create table if not exists public.activity_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 120),
  description text,
  position integer not null default 0,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.activities (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.activity_groups(id) on delete cascade,
  parent_id uuid references public.activities(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 240),
  description text,
  due_date date,
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  assigned_to uuid references public.profiles(id) on delete set null,
  completed boolean not null default false,
  completed_at timestamptz,
  completed_by uuid references auth.users(id) on delete set null,
  position integer not null default 0,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint activities_parent_not_self check (parent_id is null or parent_id <> id)
);

create index if not exists activity_groups_position_idx on public.activity_groups(position, created_at);
create index if not exists activities_group_position_idx on public.activities(group_id, parent_id, position, created_at);
create index if not exists activities_open_due_idx on public.activities(completed, due_date) where completed = false;
create index if not exists activities_assigned_to_idx on public.activities(assigned_to) where assigned_to is not null;

create or replace function public.can_manage_activities()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.active = true
      and p.role::text in ('admin', 'manager', 'production')
  );
$$;

revoke all on function public.can_manage_activities() from public;
grant execute on function public.can_manage_activities() to authenticated;

create or replace function public.validate_activity_hierarchy()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  parent_group_id uuid;
  grandparent_id uuid;
begin
  if new.parent_id is null then
    return new;
  end if;

  select a.group_id, a.parent_id
    into parent_group_id, grandparent_id
  from public.activities a
  where a.id = new.parent_id;

  if parent_group_id is null then
    raise exception 'A atividade principal selecionada não existe.' using errcode = '23503';
  end if;

  if parent_group_id <> new.group_id then
    raise exception 'A atividade principal e a subatividade devem pertencer ao mesmo grupo.' using errcode = '23514';
  end if;

  if grandparent_id is not null then
    raise exception 'O sistema permite somente atividade principal e um nível de subatividade.' using errcode = '23514';
  end if;

  return new;
end;
$$;

create or replace function public.set_activity_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.prepare_activity_completion()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  new.updated_at := now();

  if tg_op = 'INSERT' then
    if new.completed then
      new.completed_at := coalesce(new.completed_at, now());
      new.completed_by := coalesce(new.completed_by, auth.uid());
    else
      new.completed_at := null;
      new.completed_by := null;
    end if;
  elsif new.completed is distinct from old.completed then
    if new.completed then
      new.completed_at := now();
      new.completed_by := auth.uid();
    else
      new.completed_at := null;
      new.completed_by := null;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists activity_groups_set_updated_at on public.activity_groups;
create trigger activity_groups_set_updated_at
before update on public.activity_groups
for each row execute function public.set_activity_updated_at();

drop trigger if exists activities_validate_hierarchy on public.activities;
create trigger activities_validate_hierarchy
before insert or update of group_id, parent_id on public.activities
for each row execute function public.validate_activity_hierarchy();

drop trigger if exists activities_prepare_write on public.activities;
create trigger activities_prepare_write
before insert or update on public.activities
for each row execute function public.prepare_activity_completion();

alter table public.activity_groups enable row level security;
alter table public.activities enable row level security;

drop policy if exists activity_groups_read_authenticated on public.activity_groups;
create policy activity_groups_read_authenticated
on public.activity_groups for select
to authenticated
using (auth.uid() is not null);

drop policy if exists activity_groups_insert_operators on public.activity_groups;
create policy activity_groups_insert_operators
on public.activity_groups for insert
to authenticated
with check (public.can_manage_activities() and created_by = auth.uid());

drop policy if exists activity_groups_update_operators on public.activity_groups;
create policy activity_groups_update_operators
on public.activity_groups for update
to authenticated
using (public.can_manage_activities())
with check (public.can_manage_activities());

drop policy if exists activity_groups_delete_operators on public.activity_groups;
create policy activity_groups_delete_operators
on public.activity_groups for delete
to authenticated
using (public.can_manage_activities());

drop policy if exists activities_read_authenticated on public.activities;
create policy activities_read_authenticated
on public.activities for select
to authenticated
using (auth.uid() is not null);

drop policy if exists activities_insert_operators on public.activities;
create policy activities_insert_operators
on public.activities for insert
to authenticated
with check (public.can_manage_activities() and created_by = auth.uid());

drop policy if exists activities_update_operators on public.activities;
create policy activities_update_operators
on public.activities for update
to authenticated
using (public.can_manage_activities())
with check (public.can_manage_activities());

drop policy if exists activities_delete_operators on public.activities;
create policy activities_delete_operators
on public.activities for delete
to authenticated
using (public.can_manage_activities());

grant select on public.activity_groups, public.activities to authenticated;
grant insert, update, delete on public.activity_groups, public.activities to authenticated;

alter table public.activity_groups replica identity full;
alter table public.activities replica identity full;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'activity_groups'
    ) then
      alter publication supabase_realtime add table public.activity_groups;
    end if;

    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'activities'
    ) then
      alter publication supabase_realtime add table public.activities;
    end if;
  end if;
exception
  when insufficient_privilege then null;
end
$$;

notify pgrst, 'reload schema';

commit;
