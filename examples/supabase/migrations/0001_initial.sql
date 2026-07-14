-- Controle de Pedidos Kanban — estrutura inicial segura para Supabase

create extension if not exists pgcrypto;

create type public.user_role as enum ('admin', 'manager', 'production', 'viewer');
create type public.order_status as enum ('waiting', 'in_progress', 'completed', 'paused');
create type public.order_priority as enum ('low', 'normal', 'high', 'urgent');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null default '',
  email text not null default '',
  role public.user_role not null default 'viewer',
  avatar_url text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.sectors (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  position integer not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  op_number text not null unique,
  client_name text not null,
  client_phone text,
  description text not null,
  product_type text,
  quantity integer not null default 1 check (quantity > 0),
  entry_date date not null default current_date,
  delivery_date date not null,
  priority public.order_priority not null default 'normal',
  sector_id uuid not null references public.sectors(id),
  status public.order_status not null default 'waiting',
  responsible_user_id uuid references public.profiles(id),
  main_image_path text,
  notes text,
  blocked boolean not null default false,
  position integer not null default 0,
  completed_at timestamptz,
  created_by uuid not null default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.order_history (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.orders(id) on delete cascade,
  user_id uuid references public.profiles(id),
  action_type text not null,
  description text not null,
  previous_sector_id uuid references public.sectors(id),
  new_sector_id uuid references public.sectors(id),
  previous_status public.order_status,
  new_status public.order_status,
  created_at timestamptz not null default now()
);

create table public.order_comments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles(id),
  comment text not null check (char_length(comment) between 1 and 4000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.order_files (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  uploaded_by uuid not null default auth.uid() references public.profiles(id),
  file_name text not null,
  file_path text not null unique,
  file_type text,
  file_size bigint check (file_size >= 0),
  created_at timestamptz not null default now()
);

create index orders_board_idx on public.orders (sector_id, status, position);
create index orders_delivery_idx on public.orders (delivery_date) where completed_at is null;
create index order_history_order_idx on public.order_history (order_id, created_at desc);
create index order_comments_order_idx on public.order_comments (order_id, created_at);

create or replace function public.current_user_role()
returns public.user_role
language sql
stable
security definer
set search_path = public
as $$ select role from public.profiles where id = auth.uid() and active = true $$;

create or replace function public.create_profile_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, name, email)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'name', ''), coalesce(new.email, ''));
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.create_profile_for_new_user();

create or replace function public.audit_order_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at := now();
  if old.sector_id is distinct from new.sector_id or old.status is distinct from new.status then
    insert into public.order_history (
      order_id, user_id, action_type, description,
      previous_sector_id, new_sector_id, previous_status, new_status
    ) values (
      new.id, auth.uid(), 'movement', 'Pedido movimentado no Kanban',
      old.sector_id, new.sector_id, old.status, new.status
    );
  end if;
  return new;
end;
$$;

create trigger audit_order_updates
before update on public.orders
for each row execute function public.audit_order_change();

alter table public.profiles enable row level security;
alter table public.sectors enable row level security;
alter table public.orders enable row level security;
alter table public.order_history enable row level security;
alter table public.order_comments enable row level security;
alter table public.order_files enable row level security;

create policy "profiles_read_authenticated" on public.profiles
for select to authenticated using (true);
create policy "profiles_update_admin" on public.profiles
for update to authenticated using (public.current_user_role() = 'admin')
with check (public.current_user_role() = 'admin');

create policy "sectors_read_authenticated" on public.sectors
for select to authenticated using (true);
create policy "sectors_manage_leadership" on public.sectors
for all to authenticated using (public.current_user_role() in ('admin', 'manager'))
with check (public.current_user_role() in ('admin', 'manager'));

create policy "orders_read_authenticated" on public.orders
for select to authenticated using (true);
create policy "orders_create_leadership" on public.orders
for insert to authenticated with check (public.current_user_role() in ('admin', 'manager'));
create policy "orders_update_team" on public.orders
for update to authenticated using (public.current_user_role() in ('admin', 'manager', 'production'))
with check (public.current_user_role() in ('admin', 'manager', 'production'));
create policy "orders_delete_admin" on public.orders
for delete to authenticated using (public.current_user_role() = 'admin');

create policy "history_read_authenticated" on public.order_history
for select to authenticated using (true);

create policy "comments_read_authenticated" on public.order_comments
for select to authenticated using (true);
create policy "comments_create_team" on public.order_comments
for insert to authenticated with check (public.current_user_role() in ('admin', 'manager', 'production'));
create policy "comments_change_own_or_admin" on public.order_comments
for update to authenticated using (user_id = auth.uid() or public.current_user_role() = 'admin')
with check (user_id = auth.uid() or public.current_user_role() = 'admin');
create policy "comments_delete_own_or_admin" on public.order_comments
for delete to authenticated using (user_id = auth.uid() or public.current_user_role() = 'admin');

create policy "files_read_authenticated" on public.order_files
for select to authenticated using (true);
create policy "files_create_team" on public.order_files
for insert to authenticated with check (public.current_user_role() in ('admin', 'manager', 'production'));
create policy "files_delete_owner_or_admin" on public.order_files
for delete to authenticated using (uploaded_by = auth.uid() or public.current_user_role() = 'admin');

revoke all on table public.profiles, public.sectors, public.orders, public.order_history, public.order_comments, public.order_files from anon;
grant select on table public.profiles, public.sectors, public.orders, public.order_history, public.order_comments, public.order_files to authenticated;
grant insert, update, delete on table public.sectors, public.orders, public.order_comments, public.order_files to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant execute on function public.current_user_role() to authenticated;

insert into public.sectors (name, position) values
  ('Criação', 1), ('Impressão', 2), ('Plotagem', 3), ('Acabamento', 4),
  ('Serralheria', 5), ('Pintura', 6), ('Instalação', 7), ('Concluído', 8);
