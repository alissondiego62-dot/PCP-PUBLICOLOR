-- Publicolor 3.0
-- Otimização segura de consultas, sincronização de miniaturas e limpeza de valores vazios.
-- Pode ser executado mais de uma vez.

begin;

-- Valores vazios não devem ser tratados como caminhos ou responsáveis válidos.
update public.orders
set main_image_path = null
where main_image_path is not null
  and btrim(main_image_path) = '';

update public.orders
set consultant_name = null
where consultant_name is not null
  and btrim(consultant_name) = '';

update public.order_files
set drive_file_id = null
where drive_file_id is not null
  and btrim(drive_file_id) = '';

-- Consultas principais do Dashboard, Kanban, Pedidos, Concluídos e Agenda.
create index if not exists orders_active_board_idx
  on public.orders (sector_id, status, position, delivery_date)
  where status <> 'completed';

create index if not exists orders_active_delivery_idx
  on public.orders (delivery_date, priority, created_at desc)
  where status <> 'completed';

create index if not exists orders_completed_recent_idx
  on public.orders (completed_at desc, created_at desc)
  where status = 'completed';

create index if not exists orders_client_status_delivery_idx
  on public.orders (client_id, status, delivery_date)
  where client_id is not null;

create index if not exists orders_consultant_active_idx
  on public.orders ((upper(btrim(consultant_name))), status, delivery_date)
  where consultant_name is not null
    and status <> 'completed';

create index if not exists orders_position_idx
  on public.orders (position, created_at);

-- Histórico de alterações usa duas colunas em conjunto; as demais abas já possuem
-- índices equivalentes nas migrações anteriores.
create index if not exists order_change_history_order_created_idx
  on public.order_change_history (order_id, created_at desc);

-- PNG visível da aba Arquivos. O índice também acelera a sincronização permanente.
create index if not exists order_files_thumbnail_sync_idx
  on public.order_files (
    order_id,
    file_category,
    drive_modified_at desc,
    created_at desc
  )
  where removed_from_order_at is null
    and drive_file_id is not null
    and (
      lower(coalesce(file_type, '')) = 'image/png'
      or lower(file_name) like '%.png'
    );

-- Uma linha por pedido com o melhor PNG disponível para miniatura.
-- Prioridade: categoria Documento, arquivo marcado como miniatura/capa/página e, por fim,
-- o PNG modificado mais recentemente.
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
    when files.file_category = 'document' then 0
    when lower(coalesce(files.file_name, '') || ' ' || coalesce(files.notes, ''))
      ~ '(miniatura|thumbnail|pagina|página|capa|principal|preview)' then 1
    else 2
  end,
  coalesce(files.drive_modified_at, files.created_at) desc,
  files.created_at desc;

revoke all on public.order_thumbnail_candidates from anon, authenticated;
grant select on public.order_thumbnail_candidates to service_role;

-- Evita transferir todos os comentários ao navegador apenas para contar por pedido.
create or replace view public.order_comment_counts
with (security_invoker = true)
as
select
  comments.order_id,
  count(*)::bigint as comment_count
from public.order_comments as comments
group by comments.order_id;

grant select on public.order_comment_counts to authenticated, service_role;

comment on view public.order_thumbnail_candidates is
  'Melhor PNG visível da aba Arquivos para cada pedido ou subpedido.';

comment on view public.order_comment_counts is
  'Contagem agregada de comentários por pedido para Dashboard, Kanban e Pedidos.';

-- Atualiza as estatísticas usadas pelo planejador de consultas.
analyze public.orders;
analyze public.order_files;
analyze public.order_comments;

commit;

-- Validação rápida. Esses SELECTs não alteram dados.
select 'orders' as item, count(*) as total from public.orders
union all
select 'order_files_png', count(*) from public.order_thumbnail_candidates
union all
select 'orders_with_comments', count(*) from public.order_comment_counts;
