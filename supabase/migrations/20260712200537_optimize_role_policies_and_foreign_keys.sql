begin;

set local lock_timeout = '10s';
set local statement_timeout = '60s';

-- Evita duas políticas SELECT permissivas sobre setores.
drop policy if exists "sectors_manage_leadership" on public.sectors;

create policy "sectors_insert_admin"
on public.sectors for insert to authenticated
with check ((select public.current_user_role()) = 'admin');

create policy "sectors_update_admin"
on public.sectors for update to authenticated
using ((select public.current_user_role()) = 'admin')
with check ((select public.current_user_role()) = 'admin');

create policy "sectors_delete_admin"
on public.sectors for delete to authenticated
using ((select public.current_user_role()) = 'admin');

-- Comentários próprios podem ter apenas o texto alterado.
revoke update on public.order_comments from authenticated;
grant update (comment) on public.order_comments to authenticated;

-- Índices para as chaves estrangeiras consultadas pela interface e auditoria.
create index if not exists order_comments_user_idx
  on public.order_comments (user_id);

create index if not exists order_files_order_idx
  on public.order_files (order_id);

create index if not exists order_files_uploaded_by_idx
  on public.order_files (uploaded_by);

create index if not exists order_history_user_idx
  on public.order_history (user_id);

create index if not exists order_history_previous_sector_idx
  on public.order_history (previous_sector_id);

create index if not exists order_history_new_sector_idx
  on public.order_history (new_sector_id);

create index if not exists orders_created_by_idx
  on public.orders (created_by);

create index if not exists orders_responsible_user_idx
  on public.orders (responsible_user_id)
  where responsible_user_id is not null;

commit;
