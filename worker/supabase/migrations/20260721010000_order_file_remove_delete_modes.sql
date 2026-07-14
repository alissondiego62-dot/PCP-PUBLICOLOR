begin;

alter table public.order_files
  add column if not exists removal_mode text,
  add column if not exists removed_from_order_at timestamptz,
  add column if not exists removed_from_order_by uuid;

alter table public.order_files
  drop constraint if exists order_files_removal_mode_check;

alter table public.order_files
  add constraint order_files_removal_mode_check
  check (removal_mode is null or removal_mode in ('unlink', 'drive_delete'));

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'order_files_removed_from_order_by_fkey'
  ) then
    alter table public.order_files
      add constraint order_files_removed_from_order_by_fkey
      foreign key (removed_from_order_by) references public.profiles(id);
  end if;
end $$;

create index if not exists order_files_visible_order_idx
  on public.order_files (order_id, created_at desc)
  where removed_from_order_at is null;

create or replace function public.audit_order_file_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid;
  action_name text;
  action_description text;
  drive_actor text;
begin
  if tg_op = 'INSERT' then
    actor_id := new.uploaded_by;
    drive_actor := coalesce(
      nullif(new.drive_last_modified_by_name, ''),
      nullif(new.drive_last_modified_by_email, ''),
      'usuário do Google Drive'
    );
    action_name := case new.origin
      when 'drive_upload' then 'file_uploaded'
      when 'drive_sync' then 'file_synced'
      when 'manual_link' then 'file_linked'
      else 'file_added'
    end;
    action_description := case new.origin
      when 'drive_upload' then format('Arquivo enviado ao Google Drive: %s', new.file_name)
      when 'drive_sync' then format('Arquivo localizado na pasta do Drive e vinculado: %s · arquivo no Drive por %s', new.file_name, drive_actor)
      when 'manual_link' then format('Link do Google Drive vinculado: %s', new.file_name)
      else format('Arquivo registrado na ordem: %s', new.file_name)
    end;

    insert into public.order_history (order_id, user_id, action_type, description)
    values (new.order_id, actor_id, action_name, action_description);
    return new;
  end if;

  if tg_op = 'UPDATE' then
    actor_id := coalesce(new.updated_by, new.removed_from_order_by, new.uploaded_by);
    drive_actor := coalesce(
      nullif(new.drive_last_modified_by_name, ''),
      nullif(new.drive_last_modified_by_email, ''),
      'usuário do Google Drive'
    );

    if new.removed_from_order_at is not null
       and old.removed_from_order_at is null then
      insert into public.order_history (order_id, user_id, action_type, description)
      values (
        new.order_id,
        actor_id,
        'file_removed',
        format('Arquivo removido da OS e mantido no Google Drive: %s', new.file_name)
      );
      return new;
    end if;

    if new.drive_modified_at is distinct from old.drive_modified_at
       or new.drive_md5_checksum is distinct from old.drive_md5_checksum
       or new.drive_last_modified_by_name is distinct from old.drive_last_modified_by_name
       or new.drive_last_modified_by_email is distinct from old.drive_last_modified_by_email
       or new.drive_folder_id is distinct from old.drive_folder_id
       or new.file_name is distinct from old.file_name
       or new.file_size is distinct from old.file_size
       or new.file_type is distinct from old.file_type then
      action_name := 'file_drive_updated';
      action_description := format(
        'Alteração do arquivo sincronizada do Google Drive: %s · modificado por %s',
        new.file_name,
        drive_actor
      );
    elsif new.file_category is distinct from old.file_category
       or new.version is distinct from old.version
       or new.notes is distinct from old.notes
       or new.is_approved is distinct from old.is_approved
       or new.drive_url is distinct from old.drive_url then
      action_name := 'file_updated';
      action_description := format('Informações do arquivo atualizadas: %s', new.file_name);
    else
      return new;
    end if;

    insert into public.order_history (order_id, user_id, action_type, description)
    values (new.order_id, actor_id, action_name, action_description);
    return new;
  end if;

  actor_id := coalesce(old.updated_by, old.removed_from_order_by, old.uploaded_by);

  if old.removal_mode = 'drive_delete' then
    insert into public.order_history (order_id, user_id, action_type, description)
    values (
      old.order_id,
      actor_id,
      'file_deleted_from_drive',
      format('Arquivo excluído do Google Drive e removido da OS: %s', old.file_name)
    );
  else
    insert into public.order_history (order_id, user_id, action_type, description)
    values (
      old.order_id,
      actor_id,
      'file_removed',
      format('Vínculo do arquivo removido da OS: %s', old.file_name)
    );
  end if;

  return old;
end;
$$;

comment on column public.order_files.removal_mode is
  'Ação preparada antes da remoção: unlink mantém o arquivo no Drive; drive_delete exclui também do Google Drive.';
comment on column public.order_files.removed_from_order_at is
  'Data em que o arquivo deixou de aparecer na OS sem ser apagado do Google Drive.';
comment on column public.order_files.removed_from_order_by is
  'Usuário do Publicolor que removeu o arquivo somente da OS.';

commit;
