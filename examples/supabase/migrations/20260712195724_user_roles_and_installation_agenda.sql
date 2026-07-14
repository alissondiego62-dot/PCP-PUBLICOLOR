begin;

set local lock_timeout = '10s';
set local statement_timeout = '60s';

-- Os nomes exibidos na aplicação são:
-- admin = Administrador, production = Operador, viewer = Usuário.
-- Mantemos o valor manager no enum apenas por compatibilidade histórica.
update public.profiles
set role = 'production'
where role = 'manager';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_supported_roles_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_supported_roles_check
      check (role in ('admin', 'production', 'viewer'));
  end if;
end
$$;

comment on column public.profiles.role is
  'admin=Administrador; production=Operador; viewer=Usuário; manager=legado não utilizado';

alter table public.orders
  add column if not exists installation_scheduled_at timestamptz;

alter table public.order_history
  add column if not exists previous_installation_scheduled_at timestamptz,
  add column if not exists new_installation_scheduled_at timestamptz;

create index if not exists orders_installation_schedule_idx
  on public.orders (installation_scheduled_at)
  where installation_scheduled_at is not null
    and status <> 'completed';

-- A função também faz cumprir a regra de que só pedidos em Instalação Externa
-- podem receber um horário de instalação.
create or replace function public.audit_order_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  installation_sector_id uuid;
begin
  new.updated_at := clock_timestamp();
  new.blocked := false;

  select id
    into installation_sector_id
  from public.sectors
  where name = 'Instalação Externa'
  limit 1;

  if old.sector_id is distinct from new.sector_id
     and new.sector_id is distinct from installation_sector_id
     and old.installation_scheduled_at is not null then
    new.installation_scheduled_at := null;
  end if;

  if new.installation_scheduled_at is not null
     and new.sector_id is distinct from installation_sector_id then
    raise exception 'O pedido precisa estar no setor Instalação Externa para ser agendado.';
  end if;

  -- Operadores não podem trocar a autoria original por uma chamada direta à API.
  if auth.uid() is not null
     and public.current_user_role() <> 'admin' then
    new.created_by := old.created_by;
  end if;

  if new.status = 'completed' then
    if old.status is distinct from new.status then
      new.completed_at := clock_timestamp();
    else
      new.completed_at := coalesce(old.completed_at, clock_timestamp());
    end if;
  else
    new.completed_at := null;
  end if;

  if old.sector_id is distinct from new.sector_id
     or old.status is distinct from new.status then
    insert into public.order_history (
      order_id, user_id, action_type, description,
      previous_sector_id, new_sector_id, previous_status, new_status,
      previous_blocked, new_blocked,
      previous_installation_scheduled_at, new_installation_scheduled_at
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
      old.blocked, new.blocked,
      old.installation_scheduled_at, new.installation_scheduled_at
    );
  end if;

  if old.installation_scheduled_at
     is distinct from new.installation_scheduled_at then
    insert into public.order_history (
      order_id, user_id, action_type, description,
      previous_sector_id, new_sector_id, previous_status, new_status,
      previous_blocked, new_blocked,
      previous_installation_scheduled_at, new_installation_scheduled_at
    ) values (
      new.id,
      auth.uid(),
      case
        when new.installation_scheduled_at is null then 'installation_cancelled'
        when old.installation_scheduled_at is null then 'installation_scheduled'
        else 'installation_rescheduled'
      end,
      case
        when new.installation_scheduled_at is null then 'Agendamento da instalação removido'
        when old.installation_scheduled_at is null then
          'Instalação agendada para ' || to_char(
            new.installation_scheduled_at at time zone 'America/Manaus',
            'DD/MM/YYYY HH24:MI'
          )
        else
          'Instalação reagendada para ' || to_char(
            new.installation_scheduled_at at time zone 'America/Manaus',
            'DD/MM/YYYY HH24:MI'
          )
      end,
      old.sector_id, new.sector_id, old.status, new.status,
      old.blocked, new.blocked,
      old.installation_scheduled_at, new.installation_scheduled_at
    );
  end if;

  return new;
end;
$$;

-- A pausa foi removida da operação. Pedidos legados voltam ao fluxo normal.
update public.orders
set blocked = false
where blocked = true;

drop policy if exists "profiles_read_authenticated" on public.profiles;
drop policy if exists "profiles_update_admin" on public.profiles;
drop policy if exists "sectors_read_authenticated" on public.sectors;
drop policy if exists "sectors_manage_leadership" on public.sectors;
drop policy if exists "orders_read_authenticated" on public.orders;
drop policy if exists "orders_create_leadership" on public.orders;
drop policy if exists "orders_update_team" on public.orders;
drop policy if exists "orders_delete_admin" on public.orders;
drop policy if exists "history_read_authenticated" on public.order_history;
drop policy if exists "comments_read_authenticated" on public.order_comments;
drop policy if exists "comments_create_team" on public.order_comments;
drop policy if exists "comments_change_own_or_admin" on public.order_comments;
drop policy if exists "comments_delete_own_or_admin" on public.order_comments;
drop policy if exists "files_read_authenticated" on public.order_files;
drop policy if exists "files_create_team" on public.order_files;
drop policy if exists "files_delete_owner_or_admin" on public.order_files;

create policy "profiles_read_authenticated"
on public.profiles for select to authenticated
using ((select public.current_user_role()) is not null);

create policy "profiles_update_admin"
on public.profiles for update to authenticated
using ((select public.current_user_role()) = 'admin')
with check (
  (select public.current_user_role()) = 'admin'
  and role in ('admin', 'production', 'viewer')
);

create policy "sectors_read_authenticated"
on public.sectors for select to authenticated
using ((select public.current_user_role()) is not null);

create policy "sectors_manage_leadership"
on public.sectors for all to authenticated
using ((select public.current_user_role()) = 'admin')
with check ((select public.current_user_role()) = 'admin');

create policy "orders_read_authenticated"
on public.orders for select to authenticated
using ((select public.current_user_role()) is not null);

create policy "orders_create_leadership"
on public.orders for insert to authenticated
with check (
  (select public.current_user_role()) in ('admin', 'production')
  and created_by = (select auth.uid())
);

create policy "orders_update_team"
on public.orders for update to authenticated
using (
  (select public.current_user_role()) = 'admin'
  or (
    (select public.current_user_role()) = 'production'
    and status <> 'completed'
  )
)
with check ((select public.current_user_role()) in ('admin', 'production'));

create policy "orders_delete_admin"
on public.orders for delete to authenticated
using ((select public.current_user_role()) = 'admin');

create policy "history_read_authenticated"
on public.order_history for select to authenticated
using ((select public.current_user_role()) is not null);

create policy "comments_read_authenticated"
on public.order_comments for select to authenticated
using ((select public.current_user_role()) is not null);

create policy "comments_create_team"
on public.order_comments for insert to authenticated
with check (
  (select public.current_user_role()) in ('admin', 'production', 'viewer')
  and user_id = (select auth.uid())
);

create policy "comments_change_own_or_admin"
on public.order_comments for update to authenticated
using (
  (select public.current_user_role()) = 'admin'
  or user_id = (select auth.uid())
)
with check (
  (select public.current_user_role()) = 'admin'
  or user_id = (select auth.uid())
);

create policy "comments_delete_own_or_admin"
on public.order_comments for delete to authenticated
using (
  (select public.current_user_role()) = 'admin'
  or user_id = (select auth.uid())
);

create policy "files_read_authenticated"
on public.order_files for select to authenticated
using ((select public.current_user_role()) is not null);

create policy "files_create_team"
on public.order_files for insert to authenticated
with check (
  (select public.current_user_role()) in ('admin', 'production')
  and uploaded_by = (select auth.uid())
);

create policy "files_delete_owner_or_admin"
on public.order_files for delete to authenticated
using (
  (select public.current_user_role()) = 'admin'
  or (
    (select public.current_user_role()) = 'production'
    and uploaded_by = (select auth.uid())
  )
);

drop policy if exists "order_thumbnails_read" on storage.objects;
drop policy if exists "order_thumbnails_insert" on storage.objects;
drop policy if exists "order_thumbnails_update" on storage.objects;
drop policy if exists "order_thumbnails_delete" on storage.objects;

create policy "order_thumbnails_read"
on storage.objects for select to authenticated
using (
  bucket_id = 'order-thumbnails'
  and (select public.current_user_role()) is not null
);

create policy "order_thumbnails_insert"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'order-thumbnails'
  and (select public.current_user_role()) in ('admin', 'production')
  and lower(storage.extension(name)) = 'png'
  and (storage.foldername(name))[1] = 'orders'
);

create policy "order_thumbnails_update"
on storage.objects for update to authenticated
using (
  bucket_id = 'order-thumbnails'
  and (select public.current_user_role()) in ('admin', 'production')
)
with check (
  bucket_id = 'order-thumbnails'
  and (select public.current_user_role()) in ('admin', 'production')
  and lower(storage.extension(name)) = 'png'
  and (storage.foldername(name))[1] = 'orders'
);

create policy "order_thumbnails_delete"
on storage.objects for delete to authenticated
using (
  bucket_id = 'order-thumbnails'
  and (select public.current_user_role()) = 'admin'
);

revoke all on function public.audit_order_change() from public, anon, authenticated;
revoke all on function public.current_user_role() from public, anon;
grant execute on function public.current_user_role() to authenticated;

commit;
