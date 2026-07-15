-- Publicolor 3.0.5
-- Define o PNG gerado da página importada do PDF como miniatura oficial da OS.
-- Seguro para execução repetida e compatível com pedidos/subpedidos migrados.

begin;

create or replace view public.order_thumbnail_candidates
with (security_invoker = true)
as
select distinct on (files.order_id)
  files.id,
  files.order_id,
  files.file_name,
  files.file_type,
  files.file_category,
  files.drive_file_id,
  files.notes,
  files.drive_modified_at,
  files.created_at
from public.order_files as files
where files.removed_from_order_at is null
  and files.drive_file_id is not null
  and btrim(files.drive_file_id) <> ''
  and (
    lower(coalesce(files.file_type, '')) = 'image/png'
    or lower(files.file_name) like '%.png'
  )
order by
  files.order_id,
  case
    when lower(coalesce(files.notes, '')) like '%importada em pdf%usada como miniatura%' then 0
    when files.file_category = 'document'
      and lower(coalesce(files.file_name, '')) ~ '(^|[-_ ])p(a|á)gina[-_ ]?[0-9]+\.png$' then 0
    when files.file_category = 'document' then 1
    when lower(coalesce(files.file_name, '') || ' ' || coalesce(files.notes, ''))
      ~ '(miniatura|thumbnail|pagina|página|capa|principal|preview)' then 2
    else 3
  end,
  coalesce(files.drive_modified_at, files.created_at) desc,
  files.created_at desc;

revoke all on public.order_thumbnail_candidates from anon, authenticated;
grant select on public.order_thumbnail_candidates to service_role;

with imported_pdf_pages as (
  select distinct on (files.order_id)
    files.order_id,
    files.drive_file_id
  from public.order_files as files
  where files.removed_from_order_at is null
    and files.drive_file_id is not null
    and btrim(files.drive_file_id) <> ''
    and (
      lower(coalesce(files.file_type, '')) = 'image/png'
      or lower(files.file_name) like '%.png'
    )
    and (
      lower(coalesce(files.notes, '')) like '%importada em pdf%usada como miniatura%'
      or (
        files.file_category = 'document'
        and lower(coalesce(files.file_name, '')) ~ '(^|[-_ ])p(a|á)gina[-_ ]?[0-9]+\.png$'
      )
    )
  order by
    files.order_id,
    coalesce(files.drive_modified_at, files.created_at) desc,
    files.created_at desc
)
update public.orders as orders
set main_image_path = 'gdrive-pdf:' || imported_pdf_pages.drive_file_id
from imported_pdf_pages
where orders.id = imported_pdf_pages.order_id
  and orders.main_image_path is distinct from 'gdrive-pdf:' || imported_pdf_pages.drive_file_id;

comment on view public.order_thumbnail_candidates is
  'Miniatura oficial por pedido: prioriza a página PNG importada do PDF da OS.';

commit;
