begin;

set local lock_timeout = '10s';
set local statement_timeout = '60s';

alter table public.order_history
  add column if not exists previous_blocked boolean,
  add column if not exists new_blocked boolean;

create or replace function public.audit_order_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  new.updated_at := clock_timestamp();

  if new.status = 'completed' then
    if old.status is distinct from new.status then
      new.completed_at := clock_timestamp();
    else
      new.completed_at := coalesce(old.completed_at, clock_timestamp());
    end if;
    new.blocked := false;
  else
    new.completed_at := null;
  end if;

  if old.sector_id is distinct from new.sector_id
     or old.status is distinct from new.status then
    insert into public.order_history (
      order_id, user_id, action_type, description,
      previous_sector_id, new_sector_id, previous_status, new_status,
      previous_blocked, new_blocked
    ) values (
      new.id,
      auth.uid(),
      case
        when new.status = 'completed' then 'completed'
        when old.status = 'completed' then 'reopened'
        else 'movement'
      end,
      case
        when new.status = 'completed' then 'Pedido finalizado'
        when old.status = 'completed' then 'Pedido reaberto'
        else 'Pedido movimentado no Kanban'
      end,
      old.sector_id, new.sector_id, old.status, new.status,
      old.blocked, new.blocked
    );
  end if;

  if old.blocked is distinct from new.blocked
     and new.status <> 'completed' then
    insert into public.order_history (
      order_id, user_id, action_type, description,
      previous_sector_id, new_sector_id, previous_status, new_status,
      previous_blocked, new_blocked
    ) values (
      new.id,
      auth.uid(),
      case when new.blocked then 'paused' else 'resumed' end,
      case when new.blocked then 'Pedido pausado' else 'Pedido retomado' end,
      old.sector_id, new.sector_id, old.status, new.status,
      old.blocked, new.blocked
    );
  end if;

  return new;
end;
$$;

lock table public.sectors, public.orders in share row exclusive mode;

update public.orders
set status = 'waiting',
    blocked = true
where status = 'paused';

update public.orders
set completed_at = coalesce(completed_at, updated_at, now()),
    blocked = false
where status = 'completed';

update public.orders
set completed_at = null
where status <> 'completed'
  and completed_at is not null;

create temporary table desired_sectors (
  position integer primary key,
  name text not null unique
) on commit drop;

insert into desired_sectors (position, name) values
  (1,  'PCP'),
  (2,  'Impressão Digital'),
  (3,  'Plotter de Recorte'),
  (4,  'Laminação / Calandra'),
  (5,  'Acabamento'),
  (6,  'Router CNC'),
  (7,  'Laser'),
  (8,  'Metalurgia / Serralheria'),
  (9,  'Pintura'),
  (10, 'Montagem de Letreiros'),
  (11, 'Controle de Qualidade'),
  (12, 'Instalação Externa');

create temporary table sector_aliases (
  old_name text primary key,
  new_name text not null
) on commit drop;

insert into sector_aliases (old_name, new_name) values
  ('Criação', 'PCP'),
  ('Criação e Projeto', 'PCP'),
  ('Impressão', 'Impressão Digital'),
  ('Plotagem', 'Plotter de Recorte'),
  ('Serralheria', 'Metalurgia / Serralheria'),
  ('Instalação', 'Instalação Externa');

do $$
declare
  unmapped_names text;
begin
  select string_agg(distinct s.name, ', ' order by s.name)
    into unmapped_names
  from public.orders o
  join public.sectors s on s.id = o.sector_id
  where o.status <> 'completed'
    and s.name <> 'Concluído'
    and not exists (
      select 1 from desired_sectors d where d.name = s.name
    )
    and not exists (
      select 1 from sector_aliases a where a.old_name = s.name
    );

  if unmapped_names is not null then
    raise exception
      'Existem pedidos ativos em setores sem mapeamento: %. Revise-os antes de repetir a migração.',
      unmapped_names;
  end if;
end
$$;

insert into public.sectors (name, position, active)
select name, position, true
from desired_sectors
on conflict (name) do update
set position = excluded.position,
    active = true;

with targets as (
  select old_sector.id as old_id, new_sector.id as new_id
  from sector_aliases a
  join public.sectors old_sector on old_sector.name = a.old_name
  join public.sectors new_sector on new_sector.name = a.new_name
)
update public.orders o
set sector_id = targets.new_id
from targets
where o.sector_id = targets.old_id
  and o.status <> 'completed'
  and targets.old_id <> targets.new_id;

update public.orders o
set status = 'completed',
    blocked = false
from public.sectors s
where o.sector_id = s.id
  and s.name = 'Concluído'
  and o.status <> 'completed';

update public.sectors s
set active = false
where not exists (
  select 1 from desired_sectors d where d.name = s.name
);

insert into storage.buckets (
  id, name, public, file_size_limit, allowed_mime_types
) values (
  'order-thumbnails',
  'order-thumbnails',
  false,
  5242880,
  array['image/png']::text[]
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "order_thumbnails_read" on storage.objects;
drop policy if exists "order_thumbnails_insert" on storage.objects;
drop policy if exists "order_thumbnails_update" on storage.objects;
drop policy if exists "order_thumbnails_delete" on storage.objects;

create policy "order_thumbnails_read"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'order-thumbnails'
  and public.current_user_role() is not null
);

create policy "order_thumbnails_insert"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'order-thumbnails'
  and public.current_user_role() in ('admin', 'manager', 'production')
  and lower(storage.extension(name)) = 'png'
  and (storage.foldername(name))[1] = 'orders'
);

create policy "order_thumbnails_update"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'order-thumbnails'
  and public.current_user_role() in ('admin', 'manager', 'production')
)
with check (
  bucket_id = 'order-thumbnails'
  and public.current_user_role() in ('admin', 'manager', 'production')
  and lower(storage.extension(name)) = 'png'
  and (storage.foldername(name))[1] = 'orders'
);

create policy "order_thumbnails_delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'order-thumbnails'
  and public.current_user_role() in ('admin', 'manager')
);

revoke all on function public.current_user_role() from public;
grant execute on function public.current_user_role() to authenticated;

commit;
