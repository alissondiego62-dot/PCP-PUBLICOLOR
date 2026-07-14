begin;

set local lock_timeout = '10s';
set local statement_timeout = '60s';

-- O último administrador ativo não pode remover o próprio acesso por engano.
create or replace function public.protect_last_active_admin()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if old.role = 'admin'
     and old.active = true
     and (new.role <> 'admin' or new.active = false)
     and not exists (
       select 1
       from public.profiles p
       where p.id <> old.id
         and p.role = 'admin'
         and p.active = true
     ) then
    raise exception 'É necessário manter pelo menos um administrador ativo.';
  end if;

  return new;
end;
$$;

drop trigger if exists protect_last_active_admin_update on public.profiles;
create trigger protect_last_active_admin_update
before update of role, active on public.profiles
for each row execute function public.protect_last_active_admin();

-- Remove privilégios de TRUNCATE, TRIGGER e REFERENCES concedidos por padrão.
revoke all on table
  public.profiles,
  public.sectors,
  public.orders,
  public.order_history,
  public.order_comments,
  public.order_files
from anon, authenticated;

grant select on table
  public.profiles,
  public.sectors,
  public.orders,
  public.order_history,
  public.order_comments,
  public.order_files
to authenticated;

grant update (name, role, avatar_url, active)
on public.profiles to authenticated;

grant insert, update, delete
on public.sectors to authenticated;

grant insert, delete
on public.orders to authenticated;

grant update (
  op_number,
  client_name,
  client_phone,
  description,
  product_type,
  quantity,
  entry_date,
  delivery_date,
  priority,
  sector_id,
  status,
  responsible_user_id,
  main_image_path,
  notes,
  blocked,
  position,
  completed_at,
  installation_scheduled_at
)
on public.orders to authenticated;

grant insert, update, delete
on public.order_comments to authenticated;

grant insert, delete
on public.order_files to authenticated;

revoke all on all sequences in schema public from anon, authenticated;

drop policy if exists "orders_create_leadership" on public.orders;
create policy "orders_create_leadership"
on public.orders for insert to authenticated
with check (
  (select public.current_user_role()) in ('admin', 'production')
  and created_by = (select auth.uid())
  and status in ('waiting', 'in_progress')
  and blocked = false
  and completed_at is null
  and installation_scheduled_at is null
);

revoke all on function public.protect_last_active_admin()
from public, anon, authenticated;

commit;
