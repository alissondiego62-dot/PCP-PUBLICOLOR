begin;

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

create index if not exists order_files_drive_category_idx
  on public.order_files(order_id, file_category, created_at desc);

comment on column public.order_files.drive_url is 'Link compartilhável do arquivo ou pasta no Google Drive.';
comment on column public.order_files.drive_file_id is 'ID do arquivo no Google Drive para futura integração via API.';
comment on column public.order_files.drive_folder_id is 'ID da pasta da OS no Google Drive para futura integração via API.';
comment on column public.order_files.is_approved is 'Indica que o vínculo representa a arte aprovada para produção.';

commit;
