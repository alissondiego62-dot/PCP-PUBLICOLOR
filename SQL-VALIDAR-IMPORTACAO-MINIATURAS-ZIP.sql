-- Publicolor 3.0.6 — validação do módulo de miniaturas por ZIP
-- Este arquivo NÃO altera dados nem estrutura. Pode ser executado no SQL Editor.

do $$
declare
  missing_items text;
begin
  select string_agg(item, ', ' order by item)
    into missing_items
  from (
    select 'tabela:' || required_table as item
    from unnest(array['orders','order_files','order_history','google_drive_upload_sessions']::text[]) required(required_table)
    where to_regclass('public.' || required_table) is null

    union all

    select 'orders.' || required_column
    from unnest(array['id','op_number','client_name','main_image_path']::text[]) required(required_column)
    where not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'orders' and column_name = required_column
    )

    union all

    select 'order_files.' || required_column
    from unnest(array['id','order_id','file_name','file_type','drive_file_id','drive_folder_id','file_category','notes','removal_mode','removed_from_order_at']::text[]) required(required_column)
    where not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'order_files' and column_name = required_column
    )
  ) validation;

  if missing_items is not null then
    raise exception 'Módulo de miniaturas ZIP não pode operar. Itens ausentes: %', missing_items;
  end if;
end
$$;

select
  'OK' as status,
  count(*) as total_pedidos,
  count(*) filter (where nullif(trim(main_image_path), '') is not null) as pedidos_com_miniatura
from public.orders;
