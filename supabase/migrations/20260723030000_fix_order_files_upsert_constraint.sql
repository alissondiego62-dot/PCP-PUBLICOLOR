begin;

-- O PostgREST/Supabase usa ON CONFLICT (order_id, drive_file_id) para
-- registrar os arquivos encontrados no Google Drive. Esta migração repara
-- bancos em que a restrição única não foi criada após versões anteriores.

-- IDs vazios não representam arquivos válidos do Google Drive.
update public.order_files
set drive_file_id = null
where drive_file_id is not null
  and btrim(drive_file_id) = '';

-- Mantém apenas o vínculo mais útil de cada arquivo por ordem antes de
-- criar a restrição única. Prioriza o registro visível e mais recente.
with ranked as (
  select
    id,
    row_number() over (
      partition by order_id, drive_file_id
      order by
        (removed_from_order_at is null) desc,
        drive_modified_at desc nulls last,
        updated_at desc nulls last,
        created_at desc,
        id
    ) as position
  from public.order_files
  where drive_file_id is not null
)
delete from public.order_files target
using ranked duplicate
where target.id = duplicate.id
  and duplicate.position > 1;

-- Remove apenas definições antigas com o mesmo nome. O índice é recriado
-- sem predicado para que o PostgreSQL consiga inferi-lo no ON CONFLICT.
alter table public.order_files
  drop constraint if exists order_files_order_drive_unique;

drop index if exists public.order_files_order_drive_unique_idx;

alter table public.order_files
  add constraint order_files_order_drive_unique
  unique (order_id, drive_file_id);

comment on constraint order_files_order_drive_unique on public.order_files is
  'Impede que o mesmo arquivo do Google Drive seja vinculado mais de uma vez à mesma ordem.';

commit;

-- Atualiza imediatamente o cache usado pela API REST do Supabase.
notify pgrst, 'reload schema';
