-- Publicolor PCP 3.1.0 — observabilidade e cache de miniaturas
begin;

create extension if not exists pgcrypto;

create table if not exists public.system_observability_events (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'system' check (kind in ('integration','frontend_error','api_error','system')),
  level text not null default 'info' check (level in ('info','warning','error')),
  source text not null,
  action text not null,
  status text,
  message text not null,
  order_id uuid references public.orders(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  actor_email text,
  duration_ms integer check (duration_ms is null or duration_ms >= 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists system_observability_events_created_idx
  on public.system_observability_events(created_at desc);
create index if not exists system_observability_events_level_idx
  on public.system_observability_events(level, created_at desc);
create index if not exists system_observability_events_source_idx
  on public.system_observability_events(source, created_at desc);
create index if not exists system_observability_events_order_idx
  on public.system_observability_events(order_id, created_at desc)
  where order_id is not null;

alter table public.system_observability_events enable row level security;

drop policy if exists system_observability_events_admin_read on public.system_observability_events;
create policy system_observability_events_admin_read
  on public.system_observability_events
  for select
  to authenticated
  using (public.current_user_role() = 'admin');

revoke insert, update, delete on public.system_observability_events from anon, authenticated;
grant select on public.system_observability_events to authenticated;

-- Mantém os campos anteriores disponíveis em exclusões de comentários no Realtime.
alter table public.order_comments replica identity full;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('order-thumbnails', 'order-thumbnails', false, 26214400, array['image/png','image/jpeg','image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = greatest(storage.buckets.file_size_limit, excluded.file_size_limit),
  allowed_mime_types = excluded.allowed_mime_types;


-- Garante que o Realtime acompanhe apenas as entidades operacionais usadas pelo frontend.
do $$
declare
  target_table text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    for target_table in
      select unnest(array['orders','order_comments','profiles','clients','sectors']::text[])
    loop
      if to_regclass(format('public.%I', target_table)) is not null
        and not exists (
          select 1
          from pg_publication_tables
          where pubname = 'supabase_realtime'
            and schemaname = 'public'
            and tablename = target_table
        )
      then
        execute format('alter publication supabase_realtime add table public.%I', target_table);
      end if;
    end loop;
  end if;
end
$$;

commit;
