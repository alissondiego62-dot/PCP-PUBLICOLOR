begin;

-- Repara instalações que executaram apenas a migração OAuth, mas ainda não
-- possuíam todas as colunas necessárias para vincular os arquivos às ordens.
alter table public.order_files
  alter column file_path drop not null;

alter table public.order_files
  add column if not exists drive_url text,
  add column if not exists drive_file_id text,
  add column if not exists drive_folder_id text,
  add column if not exists file_category text not null default 'other',
  add column if not exists version text,
  add column if not exists notes text,
  add column if not exists is_approved boolean not null default false;

alter table public.order_files
  drop constraint if exists order_files_file_category_check;

alter table public.order_files
  add constraint order_files_file_category_check
  check (file_category in ('art','approval','production','photo','installation','document','other'));

alter table public.order_files
  drop constraint if exists order_files_source_check;

alter table public.order_files
  add constraint order_files_source_check
  check (file_path is not null or drive_url is not null);

alter table public.order_files
  drop constraint if exists order_files_drive_url_check;

alter table public.order_files
  add constraint order_files_drive_url_check
  check (
    drive_url is null
    or drive_url ~ '^https://(drive|docs)[.]google[.]com/'
  );

create index if not exists order_files_drive_file_idx
  on public.order_files (drive_file_id)
  where drive_file_id is not null;

create index if not exists order_files_drive_category_idx
  on public.order_files (order_id, file_category, created_at desc);

-- Todo usuário ativo e autenticado pode consultar e anexar arquivos.
-- A remoção do vínculo fica restrita ao administrador.
drop policy if exists "files_read_authenticated" on public.order_files;
create policy "files_read_authenticated"
on public.order_files for select to authenticated
using ((select public.current_user_role()) is not null);

drop policy if exists "files_create_team" on public.order_files;
create policy "files_create_team"
on public.order_files for insert to authenticated
with check (
  (select public.current_user_role()) is not null
  and uploaded_by = (select auth.uid())
);

drop policy if exists "files_delete_owner_or_admin" on public.order_files;
create policy "files_delete_owner_or_admin"
on public.order_files for delete to authenticated
using ((select public.current_user_role()) = 'admin');

grant select, insert, delete on public.order_files to authenticated;

comment on column public.order_files.drive_file_id is
  'ID do arquivo no Google Drive. Usado para sincronização, download protegido e prevenção de vínculos duplicados.';

commit;
