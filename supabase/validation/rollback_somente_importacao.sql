-- Remove somente os dados importados da aba TINTAS.
-- Não remove clientes, pedidos nem registros cadastrados manualmente.

delete from public.client_materials
where source = 'Planilha MATERIAIS / TINTAS';

delete from public.client_material_import_issues
where source = 'Planilha MATERIAIS / TINTAS';
