-- Validação da importação da aba TINTAS

select
  (select count(*) from public.client_materials
   where source = 'Planilha MATERIAIS / TINTAS') as materiais_importados,
  (select count(distinct client_id) from public.client_materials
   where source = 'Planilha MATERIAIS / TINTAS') as clientes_com_materiais,
  (select count(*) from public.client_material_import_issues
   where source = 'Planilha MATERIAIS / TINTAS'
     and resolution_status = 'pending') as pendencias;

-- A soma da distribuição por letra deve coincidir com a quantidade total.
select
  c.name,
  cm.item_name,
  cm.quantity as total_informado,
  coalesce(
    (
      select sum((item ->> 'quantity')::integer)
      from jsonb_array_elements(cm.led_distribution) item
    ),
    0
  ) as total_por_letra,
  cm.led_distribution
from public.client_materials cm
join public.clients c on c.id = cm.client_id
where cm.category = 'led'
order by c.name;

-- Conferência dos agrupamentos que não devem virar vários clientes.
select c.name, cm.application, cm.item_name, cm.code, cm.catalog_page
from public.client_materials cm
join public.clients c on c.id = cm.client_id
where c.name in ('GOIANA EXPRESSO', 'GAVIÃO')
order by c.name, cm.source_row, cm.item_name;

-- Linhas que ficaram pendentes por não possuírem cliente na planilha.
select *
from public.client_material_import_issues
where source = 'Planilha MATERIAIS / TINTAS'
order by source_row;
