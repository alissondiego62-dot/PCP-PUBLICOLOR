begin;

-- Garante que todos os registros diretamente vinculados a uma ordem sejam
-- removidos automaticamente quando a ordem for apagada. Alguns bancos antigos
-- foram criados com a FK de order_history sem ON DELETE CASCADE.

do $$
begin
  if to_regclass('public.order_history') is not null then
    alter table public.order_history drop constraint if exists order_history_order_id_fkey;
    alter table public.order_history
      add constraint order_history_order_id_fkey
      foreign key (order_id) references public.orders(id) on delete cascade;
  end if;

  if to_regclass('public.order_comments') is not null then
    alter table public.order_comments drop constraint if exists order_comments_order_id_fkey;
    alter table public.order_comments
      add constraint order_comments_order_id_fkey
      foreign key (order_id) references public.orders(id) on delete cascade;
  end if;

  if to_regclass('public.order_files') is not null then
    alter table public.order_files drop constraint if exists order_files_order_id_fkey;
    alter table public.order_files
      add constraint order_files_order_id_fkey
      foreign key (order_id) references public.orders(id) on delete cascade;
  end if;

  if to_regclass('public.order_change_history') is not null then
    alter table public.order_change_history drop constraint if exists order_change_history_order_id_fkey;
    alter table public.order_change_history
      add constraint order_change_history_order_id_fkey
      foreign key (order_id) references public.orders(id) on delete cascade;
  end if;

  if to_regclass('public.order_materials') is not null then
    alter table public.order_materials drop constraint if exists order_materials_order_id_fkey;
    alter table public.order_materials
      add constraint order_materials_order_id_fkey
      foreign key (order_id) references public.orders(id) on delete cascade;
  end if;

  if to_regclass('public.order_checklist_items') is not null then
    alter table public.order_checklist_items drop constraint if exists order_checklist_items_order_id_fkey;
    alter table public.order_checklist_items
      add constraint order_checklist_items_order_id_fkey
      foreign key (order_id) references public.orders(id) on delete cascade;
  end if;

  if to_regclass('public.google_drive_upload_sessions') is not null then
    alter table public.google_drive_upload_sessions drop constraint if exists google_drive_upload_sessions_order_id_fkey;
    alter table public.google_drive_upload_sessions
      add constraint google_drive_upload_sessions_order_id_fkey
      foreign key (order_id) references public.orders(id) on delete cascade;
  end if;

  if to_regclass('public.order_drive_folders') is not null then
    alter table public.order_drive_folders drop constraint if exists order_drive_folders_order_id_fkey;
    alter table public.order_drive_folders
      add constraint order_drive_folders_order_id_fkey
      foreign key (order_id) references public.orders(id) on delete cascade;
  end if;
end
$$;

-- Exclusão atômica: o navegador chama uma única função, e o banco aplica as
-- cascatas acima dentro da mesma transação.
create or replace function public.delete_order_permanently(target_order_id uuid)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  requester_role text;
  deleted_count integer;
begin
  select p.role::text
    into requester_role
  from public.profiles p
  where p.id = auth.uid()
    and p.active = true;

  if requester_role is distinct from 'admin' then
    raise exception 'Somente administradores podem apagar pedidos.'
      using errcode = '42501';
  end if;

  -- Remove primeiro os registros filhos. O trigger de exclusão de arquivos
  -- registra a ação em order_history; por isso o histórico é limpo por último.
  if to_regclass('public.google_drive_upload_sessions') is not null then
    execute 'delete from public.google_drive_upload_sessions where order_id = $1'
      using target_order_id;
  end if;
  if to_regclass('public.order_drive_folders') is not null then
    execute 'delete from public.order_drive_folders where order_id = $1'
      using target_order_id;
  end if;
  if to_regclass('public.order_checklist_items') is not null then
    execute 'delete from public.order_checklist_items where order_id = $1'
      using target_order_id;
  end if;
  if to_regclass('public.order_materials') is not null then
    execute 'delete from public.order_materials where order_id = $1'
      using target_order_id;
  end if;
  if to_regclass('public.order_comments') is not null then
    execute 'delete from public.order_comments where order_id = $1'
      using target_order_id;
  end if;
  if to_regclass('public.order_files') is not null then
    execute 'delete from public.order_files where order_id = $1'
      using target_order_id;
  end if;
  if to_regclass('public.order_change_history') is not null then
    execute 'delete from public.order_change_history where order_id = $1'
      using target_order_id;
  end if;
  if to_regclass('public.order_history') is not null then
    execute 'delete from public.order_history where order_id = $1'
      using target_order_id;
  end if;

  delete from public.orders
  where id = target_order_id;

  get diagnostics deleted_count = row_count;

  if deleted_count = 0 then
    raise exception 'Pedido não encontrado ou já removido.'
      using errcode = 'P0002';
  end if;

  return true;
end;
$$;

revoke all on function public.delete_order_permanently(uuid) from public;
grant execute on function public.delete_order_permanently(uuid) to authenticated;

notify pgrst, 'reload schema';

commit;
