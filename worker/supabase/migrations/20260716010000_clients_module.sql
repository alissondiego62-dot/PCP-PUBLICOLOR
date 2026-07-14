begin;

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  trade_name text,
  document text,
  phone text,
  whatsapp text,
  email text,
  contact_name text,
  address text,
  district text,
  city text,
  state text,
  notes text,
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists clients_document_unique
  on public.clients (document)
  where document is not null and document <> '';

create index if not exists clients_name_idx on public.clients using gin (to_tsvector('simple', coalesce(name,'') || ' ' || coalesce(trade_name,'')));

alter table public.orders add column if not exists client_id uuid references public.clients(id) on delete restrict;
create index if not exists orders_client_id_idx on public.orders(client_id);

insert into public.clients (name, trade_name, active)
select distinct trim(o.client_name), trim(o.client_name), true
from public.orders o
where trim(coalesce(o.client_name,'')) <> ''
  and not exists (
    select 1 from public.clients c
    where lower(trim(c.name)) = lower(trim(o.client_name))
  );

update public.orders o
set client_id = c.id
from public.clients c
where o.client_id is null
  and lower(trim(c.name)) = lower(trim(o.client_name));

alter table public.clients enable row level security;

drop policy if exists clients_read_authenticated on public.clients;
create policy clients_read_authenticated on public.clients
for select to authenticated using (public.current_user_role() is not null);

drop policy if exists clients_insert_team on public.clients;
create policy clients_insert_team on public.clients
for insert to authenticated with check (
  public.current_user_role()::text in ('admin','production','manager')
);

drop policy if exists clients_update_team on public.clients;
create policy clients_update_team on public.clients
for update to authenticated using (
  public.current_user_role()::text in ('admin','production','manager')
) with check (
  public.current_user_role()::text in ('admin','production','manager')
);

grant select, insert, update on public.clients to authenticated;
grant usage on schema public to authenticated;

create or replace function public.set_clients_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end; $$;

drop trigger if exists clients_set_updated_at on public.clients;
create trigger clients_set_updated_at before update on public.clients
for each row execute function public.set_clients_updated_at();

commit;
