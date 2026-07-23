begin;

alter table public.order_files
  add column if not exists updated_by uuid,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists origin text not null default 'legacy',
  add column if not exists drive_modified_at timestamptz,
  add column if not exists drive_last_modified_by_name text,
  add column if not exists drive_last_modified_by_email text,
  add column if not exists drive_md5_checksum text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'order_files_updated_by_fkey'
  ) then
    alter table public.order_files
      add constraint order_files_updated_by_fkey
      foreign key (updated_by) references public.profiles(id);
  end if;
end $$;

update public.order_files
set
  origin = case
    when drive_file_id is not null then 'drive_upload'
    when drive_url is not null then 'manual_link'
    else 'legacy'
  end,
  updated_at = coalesce(updated_at, created_at)
where origin = 'legacy';

alter table public.order_files
  drop constraint if exists order_files_origin_check;

alter table public.order_files
  add constraint order_files_origin_check
  check (origin in ('drive_upload', 'drive_sync', 'manual_link', 'legacy'));

create index if not exists order_files_updated_by_idx
  on public.order_files (updated_by)
  where updated_by is not null;

create index if not exists order_files_drive_modified_idx
  on public.order_files (order_id, drive_modified_at desc)
  where drive_file_id is not null;

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
    actor_id := coalesce(new.updated_by, new.uploaded_by);
    drive_actor := coalesce(
      nullif(new.drive_last_modified_by_name, ''),
      nullif(new.drive_last_modified_by_email, ''),
      'usuário do Google Drive'
    );

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

  actor_id := coalesce(old.updated_by, old.uploaded_by);
  insert into public.order_history (order_id, user_id, action_type, description)
  values (old.order_id, actor_id, 'file_removed', format('Vínculo do arquivo removido: %s', old.file_name));
  return old;
end;
$$;

drop trigger if exists audit_order_file_changes on public.order_files;
drop trigger if exists audit_order_file_changes_after on public.order_files;
drop trigger if exists audit_order_file_delete_before on public.order_files;

create trigger audit_order_file_changes_after
after insert or update on public.order_files
for each row execute function public.audit_order_file_change();

create trigger audit_order_file_delete_before
before delete on public.order_files
for each row execute function public.audit_order_file_change();

drop policy if exists "files_update_team" on public.order_files;
create policy "files_update_team"
on public.order_files for update to authenticated
using ((select public.current_user_role()) is not null)
with check (
  (select public.current_user_role()) is not null
  and updated_by = (select auth.uid())
);

grant select, insert, update, delete on public.order_files to authenticated;

comment on column public.order_files.origin is
  'Origem do vínculo: upload pelo sistema, sincronização da pasta, link manual ou registro legado.';
comment on column public.order_files.updated_by is
  'Último usuário do Publicolor que sincronizou ou editou as informações do arquivo.';
comment on column public.order_files.drive_modified_at is
  'Data da última alteração informada pelo Google Drive.';
comment on column public.order_files.drive_last_modified_by_name is
  'Nome do último usuário que modificou o arquivo no Google Drive, quando disponibilizado pela API.';

commit;
