begin;

-- Registra as pastas reais associadas a cada ordem. O vínculo deixa a
-- sincronização independente de nome de cliente, renomeações e estruturas
-- antigas de OP/subpedido.
create table if not exists public.order_drive_folders (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  drive_folder_id text not null,
  drive_folder_name text,
  parent_drive_folder_id text,
  folder_kind text not null default 'discovered',
  file_category text,
  discovered_by uuid references public.profiles(id),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (order_id, drive_folder_id),
  constraint order_drive_folders_kind_check
    check (folder_kind in ('order_root', 'category', 'discovered')),
  constraint order_drive_folders_category_check
    check (
      file_category is null
      or file_category in ('art','approval','production','photo','installation','document','other')
    )
);

create index if not exists order_drive_folders_order_idx
  on public.order_drive_folders (order_id, folder_kind, last_seen_at desc);

create index if not exists order_drive_folders_drive_idx
  on public.order_drive_folders (drive_folder_id);

alter table public.order_drive_folders enable row level security;

drop policy if exists "order_drive_folders_read_authenticated" on public.order_drive_folders;
create policy "order_drive_folders_read_authenticated"
on public.order_drive_folders for select to authenticated
using (auth.uid() is not null);

-- As gravações são feitas exclusivamente pelas rotas protegidas do servidor
-- usando a Service Role. Usuários comuns apenas consultam quando necessário.
revoke all on public.order_drive_folders from anon;
grant select on public.order_drive_folders to authenticated;


-- Remove vínculos duplicados criados por versões antigas da sincronização.
-- Mantém primeiro o vínculo visível e mais recente de cada arquivo do Drive.
with ranked_drive_files as (
  select
    id,
    row_number() over (
      partition by order_id, drive_file_id
      order by
        (removed_from_order_at is null) desc,
        drive_modified_at desc nulls last,
        updated_at desc nulls last,
        created_at desc
    ) as duplicate_position
  from public.order_files
  where drive_file_id is not null
)
delete from public.order_files target
using ranked_drive_files ranked
where target.id = ranked.id
  and ranked.duplicate_position > 1;

-- Um mesmo arquivo do Google Drive deve possuir somente um vínculo por OS.
create unique index if not exists order_files_order_drive_unique_idx
  on public.order_files (order_id, drive_file_id);

alter table public.orders
  add column if not exists drive_last_synced_at timestamptz,
  add column if not exists drive_last_sync_file_count integer not null default 0;

comment on table public.order_drive_folders is
  'Registro das pastas do Google Drive pertencentes a cada ordem, inclusive estruturas antigas ou renomeadas.';
comment on column public.orders.drive_last_synced_at is
  'Data da última varredura completa das pastas do Google Drive da ordem.';
comment on column public.orders.drive_last_sync_file_count is
  'Quantidade de arquivos encontrada na última varredura completa do Google Drive.';

commit;
