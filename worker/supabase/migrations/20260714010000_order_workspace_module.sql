begin;

create table if not exists public.order_materials (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  material_name text not null check (char_length(material_name) between 1 and 180),
  quantity numeric(12,3) not null check (quantity > 0),
  unit text not null default 'un',
  width numeric(8,3),
  status text not null default 'planned' check (status in ('planned','reserved','consumed')),
  notes text,
  created_by uuid not null default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.order_checklist_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  label text not null check (char_length(label) between 1 and 250),
  category text not null default 'Geral',
  completed boolean not null default false,
  position integer not null default 0,
  completed_by uuid references public.profiles(id),
  completed_at timestamptz,
  created_by uuid not null default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now()
);

create index if not exists order_materials_order_idx on public.order_materials(order_id, created_at);
create index if not exists order_checklist_items_order_idx on public.order_checklist_items(order_id, position);

alter table public.order_materials enable row level security;
alter table public.order_checklist_items enable row level security;

drop policy if exists "materials_read_authenticated" on public.order_materials;
create policy "materials_read_authenticated" on public.order_materials for select to authenticated using (true);
drop policy if exists "materials_manage_team" on public.order_materials;
create policy "materials_manage_team" on public.order_materials for all to authenticated
using (public.current_user_role() in ('admin','manager','production'))
with check (public.current_user_role() in ('admin','manager','production'));

drop policy if exists "checklist_read_authenticated" on public.order_checklist_items;
create policy "checklist_read_authenticated" on public.order_checklist_items for select to authenticated using (true);
drop policy if exists "checklist_manage_team" on public.order_checklist_items;
create policy "checklist_manage_team" on public.order_checklist_items for all to authenticated
using (public.current_user_role() in ('admin','manager','production'))
with check (public.current_user_role() in ('admin','manager','production'));

grant select, insert, update, delete on public.order_materials, public.order_checklist_items to authenticated;

insert into storage.buckets (id, name, public, file_size_limit)
values ('order-files', 'order-files', false, 26214400)
on conflict (id) do update set file_size_limit = excluded.file_size_limit;

drop policy if exists "order_files_storage_read" on storage.objects;
create policy "order_files_storage_read" on storage.objects for select to authenticated
using (bucket_id = 'order-files');
drop policy if exists "order_files_storage_insert" on storage.objects;
create policy "order_files_storage_insert" on storage.objects for insert to authenticated
with check (bucket_id = 'order-files' and public.current_user_role() in ('admin','manager','production'));
drop policy if exists "order_files_storage_delete" on storage.objects;
create policy "order_files_storage_delete" on storage.objects for delete to authenticated
using (bucket_id = 'order-files' and public.current_user_role() in ('admin','manager','production'));

commit;
