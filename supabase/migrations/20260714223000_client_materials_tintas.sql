-- Publicolor 2.0 — Materiais permanentes por cliente
-- Origem importada: planilha MATERIAIS, aba TINTAS.

create table if not exists public.client_materials (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  source_row integer,
  category text not null default 'tinta'
    check (category in ('tinta','verniz_acabamento','adesivo','acm','acrilico','led','fonte','outro')),
  item_name text not null,
  brand text,
  code text,
  catalog_page text,
  finish text,
  application text,
  quantity numeric,
  unit text,
  led_temperature text,
  led_distribution jsonb not null default '[]'::jsonb
    check (jsonb_typeof(led_distribution) = 'array'),
  notes text,
  raw_source text,
  source text not null default 'Planilha MATERIAIS / TINTAS',
  source_key text,
  active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.client_materials add column if not exists source_row integer;

create unique index if not exists client_materials_source_key_uq
  on public.client_materials(source_key)
  where source_key is not null;
create index if not exists client_materials_client_id_idx on public.client_materials(client_id);
create index if not exists client_materials_category_idx on public.client_materials(category);
create index if not exists client_materials_active_idx on public.client_materials(active);
create index if not exists client_materials_source_row_idx on public.client_materials(source_row);

create table if not exists public.client_material_import_issues (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'Planilha MATERIAIS / TINTAS',
  source_row integer,
  raw_source text not null,
  issue_type text not null,
  resolution_status text not null default 'pending'
    check (resolution_status in ('pending','resolved','ignored')),
  resolution_notes text,
  resolved_client_id uuid references public.clients(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(source, source_row, raw_source)
);

alter table public.client_materials enable row level security;
alter table public.client_material_import_issues enable row level security;

drop policy if exists client_materials_select_team on public.client_materials;
create policy client_materials_select_team
on public.client_materials for select
to authenticated
using (public.current_user_role() is not null);

drop policy if exists client_materials_insert_leadership on public.client_materials;
create policy client_materials_insert_leadership
on public.client_materials for insert
to authenticated
with check (
  public.current_user_role() in (
    'admin'::public.user_role,
    'production'::public.user_role,
    'manager'::public.user_role
  )
);

drop policy if exists client_materials_update_leadership on public.client_materials;
create policy client_materials_update_leadership
on public.client_materials for update
to authenticated
using (
  public.current_user_role() in (
    'admin'::public.user_role,
    'production'::public.user_role,
    'manager'::public.user_role
  )
)
with check (
  public.current_user_role() in (
    'admin'::public.user_role,
    'production'::public.user_role,
    'manager'::public.user_role
  )
);

drop policy if exists client_materials_delete_leadership on public.client_materials;
create policy client_materials_delete_leadership
on public.client_materials for delete
to authenticated
using (
  public.current_user_role() in (
    'admin'::public.user_role,
    'production'::public.user_role,
    'manager'::public.user_role
  )
);

drop policy if exists client_material_issues_select_team on public.client_material_import_issues;
create policy client_material_issues_select_team
on public.client_material_import_issues for select
to authenticated
using (public.current_user_role() is not null);

drop policy if exists client_material_issues_manage_leadership on public.client_material_import_issues;
create policy client_material_issues_manage_leadership
on public.client_material_import_issues for all
to authenticated
using (
  public.current_user_role() in (
    'admin'::public.user_role,
    'production'::public.user_role,
    'manager'::public.user_role
  )
)
with check (
  public.current_user_role() in (
    'admin'::public.user_role,
    'production'::public.user_role,
    'manager'::public.user_role
  )
);

grant select, insert, update, delete on public.client_materials to authenticated;
grant select, insert, update, delete on public.client_material_import_issues to authenticated;

drop trigger if exists client_materials_set_updated_at on public.client_materials;
create trigger client_materials_set_updated_at
before update on public.client_materials
for each row execute function public.set_clients_updated_at();

drop trigger if exists client_material_import_issues_set_updated_at on public.client_material_import_issues;
create trigger client_material_import_issues_set_updated_at
before update on public.client_material_import_issues
for each row execute function public.set_clients_updated_at();

-- Clientes encontrados na aba TINTAS.

with source_clients(name) as (
values
  ('A F MOTO (ALVARO FIORETTI)'),
  ('A ROMANA'),
  ('AMADEIRADO (NETO LOUREIRO)'),
  ('AMAZONIA IMOVEIS'),
  ('ARCO IRIS'),
  ('AROMA DE LUXO'),
  ('ATACADAO BOA SORTE'),
  ('AVATIM'),
  ('BELTEZ'),
  ('BETEL'),
  ('BKIT'),
  ('BODYUP'),
  ('CAROL COXINHA'),
  ('CASA DA ESCOVA'),
  ('CENTRO RAD'),
  ('CHÁCARA PORTO SEGURO'),
  ('CLINICA PERFIL'),
  ('CLINICA TAVARES'),
  ('CONSTANCE'),
  ('CONSTANT OFFIC'),
  ('CORREGEDORIA TJ'),
  ('DAM EMPORIO'),
  ('DANI STYNLING'),
  ('DELLANO'),
  ('DELUX'),
  ('DELÍCIAS D''ANA'),
  ('DETALHE PERFEITO'),
  ('DONNA'),
  ('DUDA RAMOS'),
  ('ENERGY CAR'),
  ('FARMA LIDER'),
  ('FIER'),
  ('GAVIÃO'),
  ('GLIA (VISUAL)'),
  ('GOIANA EXPRESSO'),
  ('HEMISSUL'),
  ('HP'),
  ('JAMILY BRAGA - 2B'),
  ('JORGE BICHOFF'),
  ('LILICA E TIGOR'),
  ('LINDA D''MAIS'),
  ('MASCOTE'),
  ('MORO LASER CLINIC'),
  ('MOVA PACE FITNESS'),
  ('NASSAU'),
  ('NORTER'),
  ('OGROS'),
  ('PATINHAS'),
  ('PATIO DOS CARROS'),
  ('PERFIL'),
  ('PISOS'),
  ('POLO VEICULOS'),
  ('PORTO RICO - 2B'),
  ('PRO MIX'),
  ('PUBLICOLOR'),
  ('R&R MERCADINHO'),
  ('RHOME'),
  ('RIBEIRO LOPES'),
  ('SENAC'),
  ('SICOOB'),
  ('SOLIVE'),
  ('SOW'),
  ('TODESCHINE'),
  ('TOTEM 2B'),
  ('UNIÃO CENTER'),
  ('VEREDAS'),
  ('VITAR'),
  ('VITE ARQUITETURA')
)
insert into public.clients (name, active)
select sc.name, true
from source_clients sc
where not exists (
  select 1 from public.clients c
  where lower(trim(c.name)) = lower(trim(sc.name))
);

-- Materiais e referências técnicas.
with source_rows(client_name, source_row, category, item_name, brand, code, catalog_page, finish, application, quantity, unit, led_temperature, led_distribution, notes, raw_source, source_key) as (
values
  ('GLIA (VISUAL)', 3, 'tinta', 'VERDE CLARCK', null, null, null, null, null, null, null, null, '[]'::jsonb, null, 'VERDE CLARCK', 'TINTAS-R3-1'),
  ('GLIA (VISUAL)', 3, 'tinta', 'AZUL MBB 507', null, 'MBB 507', null, null, null, null, null, null, '[]'::jsonb, null, 'AZUL MBB 507', 'TINTAS-R3-2'),
  ('GLIA (VISUAL)', 3, 'tinta', 'MARRON ASTECA', null, null, null, null, null, null, null, null, '[]'::jsonb, null, 'MARRON ASTECA', 'TINTAS-R3-3'),
  ('GLIA (VISUAL)', 3, 'tinta', 'AMARELO HYSTER', null, null, null, null, null, null, null, null, '[]'::jsonb, null, 'AMARELO HYSTER', 'TINTAS-R3-4'),
  ('GLIA (VISUAL)', 3, 'tinta', 'LARANJA JACTO', null, null, null, null, null, null, null, null, '[]'::jsonb, null, 'LARANJA JACTO', 'TINTAS-R3-5'),
  ('SOW', 4, 'tinta', 'CINZA NIQUEL', null, null, null, null, null, null, null, null, '[]'::jsonb, null, 'CINZA NIQUEL', 'TINTAS-R4-1'),
  ('SOW', 4, 'tinta', 'AZUL GP', null, null, null, null, null, null, null, null, '[]'::jsonb, null, 'AZUL GP', 'TINTAS-R4-2'),
  ('SENAC', 5, 'tinta', 'AMOR', null, null, '42', null, null, null, null, null, '[]'::jsonb, null, 'AMOR - PAG. 42', 'TINTAS-R5-1'),
  ('CAROL COXINHA', 6, 'tinta', 'AMOR', null, null, '42', null, null, null, null, null, '[]'::jsonb, null, 'AMOR - PAG. 42', 'TINTAS-R6-1'),
  ('CAROL COXINHA', 6, 'tinta', 'DELICIA DE VERÃO', null, null, null, null, null, null, null, null, '[]'::jsonb, null, 'DELICIA DE VERÃO', 'TINTAS-R6-2'),
  ('JORGE BICHOFF', 7, 'tinta', 'BEGE SAARA FIAT ACS', null, null, null, null, null, null, null, null, '[]'::jsonb, null, 'BEGE SAARA FIAT ACS', 'TINTAS-R7-1'),
  ('PATINHAS', 8, 'tinta', 'VERDE PATINHAS', null, null, null, null, null, null, null, null, '[]'::jsonb, null, 'VERDE PATINHAS', 'TINTAS-R8-1'),
  ('PATINHAS', 8, 'tinta', 'BEGE CHAPAGNE', null, null, null, null, null, null, null, null, '[]'::jsonb, null, 'BEGE CHAPAGNE', 'TINTAS-R8-2'),
  ('BELTEZ', 9, 'tinta', 'BEGE CHAMPAGNE', null, null, null, null, null, null, null, null, '[]'::jsonb, null, 'BEGE CHAMPAGNE', 'TINTAS-R9-1'),
  ('BELTEZ', 9, 'tinta', 'VERMELHO TRIBAL SÃO RAIMUNDO TORO ESP', null, '00600942', null, null, null, null, null, null, '[]'::jsonb, 'Referência: GENERAL FLEET COLOR 00800044', 'VERMELHO TRIBAL SÃO RAIMUNDO TORO ESP 00600942 / REFERENCIA - GENERAL FLEET COLOR 00800044', 'TINTAS-R9-2'),
  ('PORTO RICO - 2B', 10, 'tinta', 'VERMELHO COBALT', null, null, null, null, null, null, null, null, '[]'::jsonb, null, 'VERMELHO COBALT', 'TINTAS-R10-1'),
  ('PORTO RICO - 2B', 10, 'tinta', 'CINZA', null, null, null, null, null, null, null, null, '[]'::jsonb, null, 'CINZA', 'TINTAS-R10-2'),
  ('PATIO DOS CARROS', 11, 'tinta', 'CINZA CHUMBO', null, null, null, null, null, null, null, null, '[]'::jsonb, null, 'CINZA CHUMBO', 'TINTAS-R11-1'),
  ('PATIO DOS CARROS', 11, 'tinta', 'VERMELHO FLEX', null, null, null, null, null, null, null, null, '[]'::jsonb, null, 'VERMELHO FLEX', 'TINTAS-R11-2'),
  ('PATIO DOS CARROS', 11, 'tinta', 'BRANCO', null, null, null, null, null, null, null, null, '[]'::jsonb, null, 'BRANCO', 'TINTAS-R11-3'),
  ('DELLANO', 12, 'tinta', 'CINZA PANTONE', null, null, null, null, null, null, null, null, '[]'::jsonb, null, 'CINZA PANTONE', 'TINTAS-R12-1'),
  ('DELLANO', 12, 'verniz_acabamento', 'VERNIZ FOSCO', null, null, null, 'Fosco', null, null, null, null, '[]'::jsonb, null, 'VERNIZ FOSCO', 'TINTAS-R12-2'),
  ('TODESCHINE', 13, 'tinta', 'CINZA PANTONE', null, null, null, null, null, null, null, null, '[]'::jsonb, null, 'CINZA PANTONE', 'TINTAS-R13-1'),
  ('TODESCHINE', 13, 'verniz_acabamento', 'VERNIZ FOSCO', null, null, null, 'Fosco', null, null, null, null, '[]'::jsonb, null, 'VERNIZ FOSCO', 'TINTAS-R13-2'),
  ('TODESCHINE', 13, 'tinta', 'VERMELHO FLEX', null, null, null, null, null, null, null, null, '[]'::jsonb, null, 'VERMELHO FLEX', 'TINTAS-R13-3'),
  ('DONNA', 14, 'tinta', 'CINZA PANTONE', null, null, null, 'Brilho', null, null, null, null, '[]'::jsonb, null, 'CINZA PANTONE BRILHO', 'TINTAS-R14-1'),
  ('JAMILY BRAGA - 2B', 15, 'tinta', 'DOURADO PALHA', null, null, null, null, null, null, null, null, '[]'::jsonb, null, 'DOURADO PALHA', 'TINTAS-R15-1'),
  ('JAMILY BRAGA - 2B', 15, 'tinta', 'OLYMPIC WHITE', null, null, null, null, null, null, null, null, '[]'::jsonb, null, 'OLYMPIC WHITE', 'TINTAS-R15-2'),
  ('DAM EMPORIO', 16, 'tinta', 'LAPIS DE COR', null, null, null, null, null, null, null, null, '[]'::jsonb, null, 'LAPIS DE COR', 'TINTAS-R16-1'),
  ('DAM EMPORIO', 16, 'tinta', 'VERMELHO ENCANTO', null, null, null, null, null, null, null, null, '[]'::jsonb, null, 'VERMELHO ENCANTO', 'TINTAS-R16-2'),
  ('PISOS', 17, 'tinta', 'LARANJA SCANIA', null, null, null, null, null, null, null, null, '[]'::jsonb, null, 'LARANJA SCANIA', 'TINTAS-R17-1'),
  ('PISOS', 17, 'tinta', 'PRETO FOSCO', null, null, null, 'Fosco', null, null, null, null, '[]'::jsonb, null, 'PRETO FOSCO', 'TINTAS-R17-2'),
  ('BKIT', 18, 'tinta', 'VERMELHO INTENSO', null, null, null, null, null, null, null, null, '[]'::jsonb, null, 'VERMELHO INTENSO', 'TINTAS-R18-1'),
  ('TOTEM 2B', 20, 'tinta', 'LARANJA CALIFORNIA FORD', null, null, null, null, null, null, null, null, '[]'::jsonb, null, 'LARANJA CALIFORNIA FORD', 'TINTAS-R20-1'),
  ('RIBEIRO LOPES', 21, 'tinta', 'COSTA OCEANICA', null, null, '168', null, null, null, null, null, '[]'::jsonb, null, 'COSTA OCEANICA PAG.168', 'TINTAS-R21-1')
)
insert into public.client_materials (
  client_id, source_row, category, item_name, brand, code, catalog_page, finish,
  application, quantity, unit, led_temperature, led_distribution, notes,
  raw_source, source_key
)
select
  c.id, s.source_row::integer, s.category, s.item_name, s.brand, s.code, s.catalog_page, s.finish,
  s.application, s.quantity::numeric, s.unit, s.led_temperature, s.led_distribution::jsonb, s.notes,
  s.raw_source, s.source_key
from source_rows s
join lateral (
  select id
  from public.clients c0
  where lower(trim(c0.name)) = lower(trim(s.client_name))
  order by c0.created_at, c0.id
  limit 1
) c on true
on conflict (source_key) where source_key is not null
do update set
  client_id = excluded.client_id,
  source_row = excluded.source_row,
  category = excluded.category,
  item_name = excluded.item_name,
  brand = excluded.brand,
  code = excluded.code,
  catalog_page = excluded.catalog_page,
  finish = excluded.finish,
  application = excluded.application,
  quantity = excluded.quantity,
  unit = excluded.unit,
  led_temperature = excluded.led_temperature,
  led_distribution = excluded.led_distribution,
  notes = excluded.notes,
  raw_source = excluded.raw_source,
  active = true,
  updated_at = now();

with source_rows(client_name, source_row, category, item_name, brand, code, catalog_page, finish, application, quantity, unit, led_temperature, led_distribution, notes, raw_source, source_key) as (
values
  ('RIBEIRO LOPES', 21, 'tinta', 'TOPO DA TORRE', null, null, '292', null, null, null, null, null, '[]'::jsonb, null, 'TOPO DA TORRE PAG.292', 'TINTAS-R21-2'),
  ('RIBEIRO LOPES', 21, 'tinta', 'PEDAÇO DO OCEANO', null, null, '169', null, null, null, null, null, '[]'::jsonb, null, 'PEDAÇO DO OCEANO - PAG. 169', 'TINTAS-R21-3'),
  ('OGROS', 22, 'tinta', 'BELVEDERES', '2B', null, null, null, null, null, null, null, '[]'::jsonb, null, 'BELVEDERES (2B)', 'TINTAS-R22-1'),
  ('OGROS', 22, 'tinta', 'PRETO CADILAC', null, null, null, null, null, null, null, null, '[]'::jsonb, null, 'PRETO CADILAC', 'TINTAS-R22-2'),
  ('OGROS', 22, 'outro', 'LOGOS NO ADESIVO', null, null, null, null, null, null, null, null, '[]'::jsonb, 'Observação da planilha: LOGOS NO ADESIVO', 'LOGOS NO ADESIVO', 'TINTAS-R22-3'),
  ('LINDA D''MAIS', 23, 'tinta', 'BRONZE', null, null, null, null, null, null, null, null, '[]'::jsonb, null, 'BRONZE', 'TINTAS-R23-1'),
  ('LINDA D''MAIS', 23, 'tinta', 'BRANCO FOSCO', null, null, null, 'Fosco', null, null, null, null, '[]'::jsonb, null, 'BRANCO FOSCO', 'TINTAS-R23-2'),
  ('CHÁCARA PORTO SEGURO', 24, 'tinta', 'MARRON SAVEIRO', null, null, null, null, null, null, null, null, '[]'::jsonb, null, 'MARRON SAVEIRO', 'TINTAS-R24-1'),
  ('UNIÃO CENTER', 25, 'tinta', 'MERGULHO DE VERÃO', null, null, '145', null, null, null, null, null, '[]'::jsonb, null, 'MERGULHO DE VERÃO PAG. 145', 'TINTAS-R25-1'),
  ('UNIÃO CENTER', 25, 'tinta', 'VERDE LUDICO PRADOS', null, null, '115', null, null, null, null, null, '[]'::jsonb, null, 'VERDE LUDICO PRADOS PAG. 115', 'TINTAS-R25-2'),
  ('AROMA DE LUXO', 26, 'tinta', 'SUZUKI VENUS GOLD (DOURADO)', 'Visual', '06494', null, null, null, null, null, null, '[]'::jsonb, null, 'SUZUKI VENUS GOLD (DOURADO) / COD. 06494 (VISUAL)', 'TINTAS-R26-1'),
  ('CONSTANCE', 27, 'tinta', 'MARROM MERCEDES BENZ 0865 1989 METÁLICO', 'Lazzuril', '0865', null, 'Metálico', null, null, null, null, '[]'::jsonb, 'Base poliéster', 'MARROM MERCEDES BENZ 0865 1989 METÁLICO BASE POLIÉSTER, LAZZURIL', 'TINTAS-R27-1'),
  ('CONSTANCE', 27, 'verniz_acabamento', 'VERNIZ SHERWI POLIURETANO 6100 FOSCO', 'Sherwin', '6100', null, 'Fosco', null, null, null, null, '[]'::jsonb, null, 'VERNIZ SHERWI POLIURETANO 6100 FOSCO', 'TINTAS-R27-2'),
  ('NASSAU', 28, 'tinta', 'AMARELO CROMO SINTETICO', null, null, null, null, null, null, null, null, '[]'::jsonb, null, 'AMARELO CROMO SINTETICO', 'TINTAS-R28-1'),
  ('NASSAU', 28, 'tinta', 'VERMELHO FLASH', null, null, null, null, null, null, null, null, '[]'::jsonb, null, 'VERMELHO FLASH', 'TINTAS-R28-2'),
  ('HEMISSUL', 29, 'tinta', 'BRANCO', null, null, null, null, null, null, null, null, '[]'::jsonb, null, 'BRANCO', 'TINTAS-R29-1'),
  ('HEMISSUL', 29, 'acm', 'ACM AZUL', null, null, null, null, null, null, null, null, '[]'::jsonb, null, 'ACM AZUL', 'TINTAS-R29-2'),
  ('NORTER', 30, 'tinta', 'BRANCO - AZUL BRASFERRO', null, null, null, null, null, null, null, null, '[]'::jsonb, null, 'BRANCO - AZUL BRASFERRO', 'TINTAS-R30-1'),
  ('NORTER', 30, 'tinta', 'VERMELHO FLEX', null, null, null, null, null, null, null, null, '[]'::jsonb, null, 'VERMELHO FLEX', 'TINTAS-R30-2'),
  ('DANI STYNLING', 31, 'tinta', 'SUZUKI VENUS GOLD (DOURADO)', 'Visual', '06494', null, null, null, null, null, null, '[]'::jsonb, null, 'SUZUKI VENUS GOLD (DOURADO) COD. 06494 (VISUAL)', 'TINTAS-R31-1'),
  ('DANI STYNLING', 31, 'tinta', 'BEGE CHAPAGNE', null, null, null, null, 'Estrelas', null, null, null, '[]'::jsonb, null, 'ESTRELAS - BEGE CHAPAGNE', 'TINTAS-R31-2'),
  ('SICOOB', 32, 'tinta', 'VERDE MERCEDES 6158', null, '6158', null, null, null, null, null, null, '[]'::jsonb, null, 'VERDE MERCEDES 6158', 'TINTAS-R32-1'),
  ('SICOOB', 32, 'tinta', 'VERDE GREEN FOREST', null, null, null, null, null, null, null, null, '[]'::jsonb, null, 'VERDE GREEN FOREST', 'TINTAS-R32-2'),
  ('PUBLICOLOR', 33, 'tinta', 'AMARELO PUBLICOLOR', null, null, null, null, null, null, null, null, '[]'::jsonb, null, 'AMARELO PUBLICOLOR', 'TINTAS-R33-1'),
  ('PUBLICOLOR', 33, 'tinta', 'ROXO VIOLETA FD RAVELO (PUBLICOLOR)', null, null, null, null, null, null, null, null, '[]'::jsonb, null, 'ROXO VIOLETA FD RAVELO (PUBLICOLOR)', 'TINTAS-R33-2'),
  ('PERFIL', 34, 'tinta', 'ANEL ESMERALDA', null, null, '144', null, null, null, null, null, '[]'::jsonb, null, 'ANEL ESMERALDA – (PAG 144)', 'TINTAS-R34-1'),
  ('VITAR', 35, 'tinta', 'MUNDO VERDE SINTETICO SUVINIL', 'Suvinil', null, null, null, null, null, null, null, '[]'::jsonb, null, 'MUNDO VERDE SINTETICO SUVINIL', 'TINTAS-R35-1'),
  ('ATACADAO BOA SORTE', 36, 'tinta', 'AMARELO CROMO SINTETICO', null, null, null, null, null, null, null, null, '[]'::jsonb, null, 'AMARELO CROMO SINTETICO', 'TINTAS-R36-1'),
  ('ATACADAO BOA SORTE', 36, 'tinta', 'VERMELHO FLEH', null, null, null, null, null, null, null, null, '[]'::jsonb, null, 'VERMELHO FLEH', 'TINTAS-R36-2'),
  ('ATACADAO BOA SORTE', 36, 'tinta', 'AZUL INTENSO', null, null, null, null, null, null, null, null, '[]'::jsonb, null, 'AZUL INTENSO', 'TINTAS-R36-3'),
  ('LILICA E TIGOR', 37, 'tinta', 'PAPEL PICADO TOQUE DE SECA SUVINIL', 'Suvinil', null, null, null, null, null, null, null, '[]'::jsonb, null, 'PAPEL PICADO TOQUE DE SECA SUVINIL', 'TINTAS-R37-1'),
  ('DETALHE PERFEITO', 38, 'tinta', 'MARRON FLORENCE', 'Visual', null, null, null, null, null, null, null, '[]'::jsonb, null, 'MARRON FLORENCE (VISUAL)', 'TINTAS-R38-1'),
  ('HP', 39, 'tinta', 'VERMELHO FLEX', null, null, null, null, null, null, null, null, '[]'::jsonb, null, 'VERMELHO FLEX', 'TINTAS-R39-1'),
  ('HP', 39, 'tinta', 'PRETO CADILAC', null, null, null, null, null, null, null, null, '[]'::jsonb, null, 'PRETO CADILAC', 'TINTAS-R39-2'),
  ('AVATIM', 40, 'tinta', 'VERDE', 'Visual', null, null, null, null, null, null, null, '[]'::jsonb, null, 'VERDE (VISUAL)', 'TINTAS-R40-1')
)
insert into public.client_materials (
  client_id, source_row, category, item_name, brand, code, catalog_page, finish,
  application, quantity, unit, led_temperature, led_distribution, notes,
  raw_source, source_key
)
select
  c.id, s.source_row::integer, s.category, s.item_name, s.brand, s.code, s.catalog_page, s.finish,
  s.application, s.quantity::numeric, s.unit, s.led_temperature, s.led_distribution::jsonb, s.notes,
  s.raw_source, s.source_key
from source_rows s
join lateral (
  select id
  from public.clients c0
  where lower(trim(c0.name)) = lower(trim(s.client_name))
  order by c0.created_at, c0.id
  limit 1
) c on true
on conflict (source_key) where source_key is not null
do update set
  client_id = excluded.client_id,
  source_row = excluded.source_row,
  category = excluded.category,
  item_name = excluded.item_name,
  brand = excluded.brand,
  code = excluded.code,
  catalog_page = excluded.catalog_page,
  finish = excluded.finish,
  application = excluded.application,
  quantity = excluded.quantity,
  unit = excluded.unit,
  led_temperature = excluded.led_temperature,
  led_distribution = excluded.led_distribution,
  notes = excluded.notes,
  raw_source = excluded.raw_source,
  active = true,
  updated_at = now();

with source_rows(client_name, source_row, category, item_name, brand, code, catalog_page, finish, application, quantity, unit, led_temperature, led_distribution, notes, raw_source, source_key) as (
values
  ('BODYUP', 41, 'tinta', 'CINZA CHASSIS VOLVO CUNZOLO', 'Visual', null, null, null, null, null, null, null, '[]'::jsonb, null, 'CINZA CHASSIS VOLVO CUNZOLO (VISUAL)', 'TINTAS-R41-1'),
  ('CONSTANT OFFIC', 42, 'tinta', 'NIQUEL (CINZA)', null, null, null, 'Fosco', null, null, null, null, '[]'::jsonb, null, 'NIQUEL (CINZA)- FOSCO', 'TINTAS-R42-1'),
  ('CONSTANT OFFIC', 42, 'tinta', 'PRETO INTENSO', null, null, null, 'Fosco', null, null, null, null, '[]'::jsonb, null, 'PRETO INTENSO (FOSCO)', 'TINTAS-R42-2'),
  ('DELÍCIAS D''ANA', 43, 'tinta', 'FLOR DE PRIMAVERA', 'Coral / referência Visual', null, '215', null, null, null, null, null, '[]'::jsonb, 'Consultor conversou com a cliente e mudou a tinta ROSA PASTEL para FLOR DE PRIMAVERA.', 'FLOR DE PRIMAVERA (VISUAL) - CORAL - PAG 215', 'TINTAS-R43-1'),
  ('FARMA LIDER', 44, 'tinta', 'AZUL GP', null, null, null, null, null, null, null, null, '[]'::jsonb, null, 'AZUL GP', 'TINTAS-R44-1'),
  ('FARMA LIDER', 44, 'tinta', 'VERMELHO FLASH', null, null, null, null, null, null, null, null, '[]'::jsonb, null, 'VERMELHO FLASH', 'TINTAS-R44-2'),
  ('POLO VEICULOS', 45, 'tinta', 'AZUL RAL', '2B', null, null, null, null, null, null, null, '[]'::jsonb, null, 'AZUL RAL (2B)', 'TINTAS-R45-1'),
  ('VEREDAS', 46, 'tinta', 'LARANJA VEREDAS', null, null, null, null, null, null, null, null, '[]'::jsonb, null, 'LARANJA VEREDAS', 'TINTAS-R46-1'),
  ('RHOME', 47, 'tinta', 'LARANJA SCANIA', null, null, null, null, 'Laranja Rhome', null, null, null, '[]'::jsonb, null, 'LARANJA RHOME - LARANJA SCANIA', 'TINTAS-R47-1'),
  ('RHOME', 47, 'tinta', 'PRETO CADILAC', null, null, null, null, 'ACM na cor preto', null, null, null, '[]'::jsonb, null, 'PRETO CADILAC - ACM NA COR PRETO', 'TINTAS-R47-2'),
  ('PRO MIX', 48, 'tinta', 'LARANJA SCANIA', null, null, null, null, null, null, null, null, '[]'::jsonb, null, 'LARANJA SCANIA', 'TINTAS-R48-1'),
  ('BETEL', 49, 'tinta', 'MOLHO DE MOSTARDA', 'Coral / referência Visual Tintas', null, null, null, null, null, null, null, '[]'::jsonb, null, 'MOLHO DE MOSTARDA - CORAL - VISUAL TINTAS', 'TINTAS-R49-1'),
  ('BETEL', 49, 'tinta', 'PRETO BRILHO', null, null, null, 'Brilho', null, null, null, null, '[]'::jsonb, null, 'PRETO BRILHO', 'TINTAS-R49-2'),
  ('CORREGEDORIA TJ', 50, 'tinta', 'OURO REAL', null, null, null, null, null, null, null, null, '[]'::jsonb, null, 'OURO REAL', 'TINTAS-R50-1'),
  ('CORREGEDORIA TJ', 50, 'tinta', 'BRANCO FOSCO', null, null, null, 'Fosco', null, null, null, null, '[]'::jsonb, null, 'BRANCO FOSCO', 'TINTAS-R50-2'),
  ('VITE ARQUITETURA', 51, 'tinta', 'VERDE VITE', 'Visual Tintas', null, null, null, null, null, null, null, '[]'::jsonb, null, 'VERDE VITE (VISUAL TINTAS)', 'TINTAS-R51-1'),
  ('VITE ARQUITETURA', 51, 'tinta', 'AMARELO VITE', 'Visual Tintas', null, null, null, null, null, null, null, '[]'::jsonb, null, 'AMARELO VITE (VISUAL TINTAS)', 'TINTAS-R51-2'),
  ('FIER', 52, 'tinta', 'AZUL FIER', null, null, null, null, null, null, null, null, '[]'::jsonb, null, 'AZUL FIER', 'TINTAS-R52-1'),
  ('FIER', 52, 'tinta', 'OLHAR ENCANTADOR', null, null, '149', null, null, null, null, null, '[]'::jsonb, null, 'OLHAR ENCANTADOR PAG 149', 'TINTAS-R52-2'),
  ('AMADEIRADO (NETO LOUREIRO)', 54, 'tinta', 'MARRON TUNDRA', null, null, null, null, null, null, null, null, '[]'::jsonb, null, 'MARRON TUNDRA', 'TINTAS-R54-1'),
  ('CLINICA PERFIL', 55, 'tinta', 'ENFEITE', 'Coral', null, '113', null, null, null, null, null, '[]'::jsonb, null, 'ENFEITE - PAG 113 - CORAL', 'TINTAS-R55-1'),
  ('CLINICA PERFIL', 55, 'tinta', 'VERDE CLASSICO', 'Coral', null, '139', null, null, null, null, null, '[]'::jsonb, null, 'VERDE CLASSICO - PAG 139 - CORAL', 'TINTAS-R55-2'),
  ('CENTRO RAD', 57, 'tinta', 'AZUL ESCURO CENTRO RAD', 'Visual', null, null, null, null, null, null, null, '[]'::jsonb, null, 'AZUL ESCURO CENTRO RAD - VISUAL', 'TINTAS-R57-1'),
  ('CENTRO RAD', 57, 'tinta', 'AZUL CLARO', 'Visual', null, null, null, null, null, null, null, '[]'::jsonb, null, 'AZUL CLARO - VISUAL', 'TINTAS-R57-2'),
  ('CENTRO RAD', 57, 'led', 'LED BRANCO FRIO 8K', null, null, null, null, null, null, 'módulo', 'Branco frio 8K', '[]'::jsonb, null, 'LED BRANCO FRIO 8K', 'TINTAS-R57-3'),
  ('CENTRO RAD', 57, 'adesivo', 'ADESIVO TRANSPARENTE', null, null, null, null, null, null, null, null, '[]'::jsonb, 'Impressão em 24 passos', 'ADESIVO TRANSPARENTE - IMPRESSÃO 24 PASSOS', 'TINTAS-R57-4'),
  ('MASCOTE', 58, 'tinta', 'AMARELO CLUB PET', null, '00800040', null, null, null, null, null, null, '[]'::jsonb, null, 'AMARELO CLUB PET 00800040', 'TINTAS-R58-1'),
  ('MASCOTE', 58, 'tinta', 'ROSA CLUB PET', null, '00800041', null, null, null, null, null, null, '[]'::jsonb, null, 'ROSA CLUB PET00800041', 'TINTAS-R58-2'),
  ('MASCOTE', 58, 'tinta', 'ROXO CLUB PET', null, '00800042', null, null, null, null, null, null, '[]'::jsonb, null, 'ROXO CLUB PET 00800042', 'TINTAS-R58-3'),
  ('A ROMANA', 59, 'tinta', 'ROMANA ANTICO', null, '00800878', null, null, null, null, null, null, '[]'::jsonb, null, 'ROMANA ANTICO 00800878', 'TINTAS-R59-1'),
  ('A ROMANA', 59, 'led', 'LED QUENTE', null, null, null, null, null, 164, 'módulos', 'Quente', '[{"group": "A ROMANA", "position": "A1", "letter": "A", "quantity": 22}, {"group": "A ROMANA", "position": "R", "letter": "R", "quantity": 22}, {"group": "A ROMANA", "position": "O", "letter": "O", "quantity": 20}, {"group": "A ROMANA", "position": "M", "letter": "M", "quantity": 32}, {"group": "A ROMANA", "position": "A2", "letter": "A", "quantity": 25}, {"group": "A ROMANA", "position": "N", "letter": "N", "quantity": 20}, {"group": "A ROMANA", "position": "A3", "letter": "A", "quantity": 23}]'::jsonb, null, 'LED''S - QUENTE - TOTAL - 164 / A1-22, R-22, O-20, M-32, A2-25, N-20, A3-23', 'TINTAS-R59-2'),
  ('A ROMANA', 59, 'fonte', 'FONTE NÃO INFORMADA', null, null, null, null, null, null, null, null, '[]'::jsonb, 'Potência da fonte não informada na planilha.', 'FONTE -', 'TINTAS-R59-3'),
  ('MOVA PACE FITNESS', 60, 'tinta', 'AMARELO MOVA PACE', null, '008000876', null, null, 'MOVA', null, null, null, '[]'::jsonb, null, 'AMARELO MOVA PACE 008000876 - MOVA', 'TINTAS-R60-1'),
  ('MOVA PACE FITNESS', 60, 'tinta', 'VERDE AQUA MOVA PACE', null, '00800877', null, null, 'PACE', null, null, null, '[]'::jsonb, null, 'VERDE AQUA MOVA PACE 00800877 - PACE', 'TINTAS-R60-2'),
  ('MOVA PACE FITNESS', 60, 'tinta', 'BRANCO GEADA', null, null, null, null, 'FITNESS', null, null, null, '[]'::jsonb, null, 'BRANCO GEADA - FITNESS', 'TINTAS-R60-3')
)
insert into public.client_materials (
  client_id, source_row, category, item_name, brand, code, catalog_page, finish,
  application, quantity, unit, led_temperature, led_distribution, notes,
  raw_source, source_key
)
select
  c.id, s.source_row::integer, s.category, s.item_name, s.brand, s.code, s.catalog_page, s.finish,
  s.application, s.quantity::numeric, s.unit, s.led_temperature, s.led_distribution::jsonb, s.notes,
  s.raw_source, s.source_key
from source_rows s
join lateral (
  select id
  from public.clients c0
  where lower(trim(c0.name)) = lower(trim(s.client_name))
  order by c0.created_at, c0.id
  limit 1
) c on true
on conflict (source_key) where source_key is not null
do update set
  client_id = excluded.client_id,
  source_row = excluded.source_row,
  category = excluded.category,
  item_name = excluded.item_name,
  brand = excluded.brand,
  code = excluded.code,
  catalog_page = excluded.catalog_page,
  finish = excluded.finish,
  application = excluded.application,
  quantity = excluded.quantity,
  unit = excluded.unit,
  led_temperature = excluded.led_temperature,
  led_distribution = excluded.led_distribution,
  notes = excluded.notes,
  raw_source = excluded.raw_source,
  active = true,
  updated_at = now();

with source_rows(client_name, source_row, category, item_name, brand, code, catalog_page, finish, application, quantity, unit, led_temperature, led_distribution, notes, raw_source, source_key) as (
values
  ('MOVA PACE FITNESS', 60, 'led', 'LED FRIO 8K', null, null, null, null, null, 151, 'módulos', 'Frio 8K', '[{"group": "MOVA", "position": "M", "letter": "M", "quantity": 19}, {"group": "MOVA", "position": "O", "letter": "O", "quantity": 18}, {"group": "MOVA", "position": "V", "letter": "V", "quantity": 11}, {"group": "MOVA", "position": "A", "letter": "A", "quantity": 11}, {"group": "PACE", "position": "P", "letter": "P", "quantity": 17}, {"group": "PACE", "position": "A", "letter": "A", "quantity": 11}, {"group": "PACE", "position": "C", "letter": "C", "quantity": 13}, {"group": "PACE", "position": "E", "letter": "E", "quantity": 20}, {"group": "FITNESS", "position": "F", "letter": "F", "quantity": 4}, {"group": "FITNESS", "position": "I", "letter": "I", "quantity": 2}, {"group": "FITNESS", "position": "T", "letter": "T", "quantity": 3}, {"group": "FITNESS", "position": "N", "letter": "N", "quantity": 6}, {"group": "FITNESS", "position": "E", "letter": "E", "quantity": 4}, {"group": "FITNESS", "position": "S1", "letter": "S", "quantity": 6}, {"group": "FITNESS", "position": "S2", "letter": "S", "quantity": 6}]'::jsonb, null, 'LED''S FRIO 8K - TOTAL - 151 / distribuição por letra de MOVA PACE FITNESS', 'TINTAS-R60-4'),
  ('MOVA PACE FITNESS', 60, 'fonte', 'FONTES 150W + 200W', null, null, null, null, null, null, null, null, '[]'::jsonb, 'Uma fonte de 150 W e uma fonte de 200 W, conforme planilha.', 'FONTE - 150 + 200', 'TINTAS-R60-5'),
  ('A F MOTO (ALVARO FIORETTI)', 61, 'tinta', 'PRATA SIRIUS', null, null, null, null, null, null, null, null, '[]'::jsonb, null, 'PRATA SIRIUS', 'TINTAS-R61-1'),
  ('A F MOTO (ALVARO FIORETTI)', 61, 'tinta', 'SOL DOURADO', 'Coral', null, '86', null, null, null, null, null, '[]'::jsonb, null, 'SOL DOURADO - PAG 86 - CORAL', 'TINTAS-R61-2'),
  ('A F MOTO (ALVARO FIORETTI)', 61, 'adesivo', 'ADESIVO TRANSPARENTE', null, null, null, null, 'Cor preta', null, null, null, '[]'::jsonb, 'Impressão em 12 passos', 'ADESIVO TRANSPARENTE (COR PRETO 12 PASSOS)', 'TINTAS-R61-3'),
  ('AMAZONIA IMOVEIS', 62, 'tinta', 'PRATA SIRIUS', null, null, null, null, 'Placa grande e logo', null, null, null, '[]'::jsonb, null, 'PLACA GRANDE E LOGO - (PRATA SIRIUS)', 'TINTAS-R62-1'),
  ('AMAZONIA IMOVEIS', 62, 'tinta', 'SOL DOURADO', 'Coral', null, '86', null, 'Imobiliária Santa Cecília / CRECI', null, null, null, '[]'::jsonb, null, 'IMOBILIARIA SANTA CECILIA CRECI (SOL DOURADO CATALOGO CORAL PAG. 86)', 'TINTAS-R62-2'),
  ('AMAZONIA IMOVEIS', 62, 'tinta', 'VERDE JONH DEERE', null, null, null, null, 'Colunas e parede', null, null, null, '[]'::jsonb, null, 'COLUNAS E PAREDE - (VERDE JONH DEERE)', 'TINTAS-R62-3'),
  ('AMAZONIA IMOVEIS', 62, 'tinta', 'BRANCO GEADA', null, null, null, null, 'Amazonias Imóveis / CRECI', null, null, null, '[]'::jsonb, null, 'AMAZONIAS IMOVEIS CRECI - (BRANCO GEADA)', 'TINTAS-R62-4'),
  ('DELUX', 63, 'tinta', 'TRUASSARDI BAMBINI', null, null, null, null, null, null, null, null, '[]'::jsonb, null, 'TRUASSARDI BAMBINI', 'TINTAS-R63-1'),
  ('DELUX', 63, 'acrilico', 'ACRILICO PRETO', null, null, null, null, 'Letras e letreiro', null, null, null, '[]'::jsonb, null, 'LETRAS ACRILICO PRETO E LETREIRO ACRILICO PRETO', 'TINTAS-R63-2'),
  ('R&R MERCADINHO', 64, 'tinta', 'AZUL PURO', null, null, '184', null, null, null, null, null, '[]'::jsonb, null, 'R&R MERCADINHO - PAG 184 / AZUL PURO 184', 'TINTAS-R64-1'),
  ('R&R MERCADINHO', 64, 'tinta', 'UNIÃO DOS OCEANOS', null, null, '182', null, null, null, null, null, '[]'::jsonb, null, 'UNIÃO DOS OCEANOS PAG 182', 'TINTAS-R64-2'),
  ('SOLIVE', 65, 'tinta', 'AZUL MARINHO', null, null, '187', null, null, null, null, null, '[]'::jsonb, null, 'AZUL MARINHO - PAG 187', 'TINTAS-R65-1'),
  ('CLINICA TAVARES', 66, 'tinta', 'FOGO VIOLETA', null, null, '205', null, null, null, null, null, '[]'::jsonb, null, 'FOGO VIOLETA - PAG 205', 'TINTAS-R66-1'),
  ('DUDA RAMOS', 67, 'tinta', 'BRANCO GEADA', null, null, null, null, null, null, null, null, '[]'::jsonb, null, 'BRANCO GEADA', 'TINTAS-R67-1'),
  ('DUDA RAMOS', 67, 'tinta', 'UNIÃO DOS OCENANOS', 'Coral', null, '182', null, null, null, null, null, '[]'::jsonb, null, 'UNIÃO DOS OCENANOS - PAG 182 - CORAL', 'TINTAS-R67-2'),
  ('VEREDAS', 68, 'tinta', 'AZUL MARINHO', null, null, '187', null, 'Letreiro PVC – Centro de Produção, Reservação e Distribuição de Água Veredas', null, null, null, '[]'::jsonb, null, 'LETREIRO PVC - CENTRO DE PRODUÇÃO, RESERVAÇÃO E DISTRIBUIÇÃO DE ÁGUA VEREDAS / AZUL MARINHO - PAG 187', 'TINTAS-R68-1'),
  ('MORO LASER CLINIC', 69, 'tinta', 'MARRON AÇAI', null, null, '226', null, null, null, null, null, '[]'::jsonb, null, 'MARRON AÇAI - PAG. 226', 'TINTAS-R69-1'),
  ('MORO LASER CLINIC', 69, 'tinta', 'DOURADO VENUS', null, null, null, null, null, null, null, null, '[]'::jsonb, null, 'DOURADO VENUS', 'TINTAS-R69-2'),
  ('CASA DA ESCOVA', 70, 'acm', 'ACM', null, null, null, null, null, null, null, null, '[]'::jsonb, 'Cor/especificação não informada na planilha.', 'ACM -', 'TINTAS-R70-1'),
  ('ENERGY CAR', 71, 'tinta', 'AZUL GP', null, null, null, null, null, null, null, null, '[]'::jsonb, null, 'AZUL GP', 'TINTAS-R71-1'),
  ('ENERGY CAR', 71, 'tinta', 'LARANJA CARLIFORNIA FORD', null, null, null, null, null, null, null, null, '[]'::jsonb, null, 'LARANJA CARLIFORNIA FORD', 'TINTAS-R71-2'),
  ('GOIANA EXPRESSO', 91, 'tinta', 'BRANCO FOSCO', null, null, null, 'Fosco', 'GOIANA', null, null, null, '[]'::jsonb, null, 'GOIANA: BRANCO FOSCO', 'TINTAS-R91-1'),
  ('GOIANA EXPRESSO', 92, 'tinta', 'BRANCO FOSCO', null, null, null, 'Fosco', 'PÃES BOLOS E TORTAS', null, null, null, '[]'::jsonb, null, 'PÃES BOLOS E TORTAS: BRANCO FOSCO', 'TINTAS-R92-1'),
  ('GOIANA EXPRESSO', 93, 'tinta', 'BRANCO FOSCO', null, null, null, 'Fosco', 'AÇOGUE', null, null, null, '[]'::jsonb, null, 'AÇOGUE: BRANCO FOSCO', 'TINTAS-R93-1'),
  ('GOIANA EXPRESSO', 94, 'tinta', 'BRANCO FOSCO', null, null, null, 'Fosco', 'CARNE EMBALADAS', null, null, null, '[]'::jsonb, null, 'CARNE EMBALADAS: BRANCO FOSCO', 'TINTAS-R94-1'),
  ('GOIANA EXPRESSO', 95, 'tinta', 'BRANCO FOSCO', null, null, null, 'Fosco', 'BEBIDAS GELADAS', null, null, null, '[]'::jsonb, null, 'BEBIDAS GELADAS: BRANCO FOSCO', 'TINTAS-R95-1'),
  ('GOIANA EXPRESSO', 96, 'tinta', 'AMOR FATAL', null, 'P576', null, null, 'CARNES E AVES', null, null, null, '[]'::jsonb, null, 'CARNES E AVES: AMOR FATAL COD P576', 'TINTAS-R96-1'),
  ('GOIANA EXPRESSO', 97, 'tinta', 'CASTANHO', null, 'P263', null, null, 'MERCEARIA', null, null, null, '[]'::jsonb, null, 'MERCEARIA: CASTANHO COD P263', 'TINTAS-R97-1'),
  ('GOIANA EXPRESSO', 98, 'tinta', 'CANARIO', null, 'P039', null, null, 'NASCEMOS PARA FAZER DIFERENTE', null, null, null, '[]'::jsonb, null, 'NASCEMOS PARA FAZER DIFERENTE: CANARIO COD P039', 'TINTAS-R98-1'),
  ('GOIANA EXPRESSO', 99, 'tinta', 'CANARIO', null, 'P039', null, null, 'É SEMPRE MUITO ESPECIAL TER VOCÊ AQUI!', null, null, null, '[]'::jsonb, null, 'É SEMPRE MUITO ESPECIAL TER VOCÊ AQUI!: CANARIO COD P039', 'TINTAS-R99-1'),
  ('GOIANA EXPRESSO', 100, 'tinta', 'DOCE DE CAJÁ', null, 'R609', null, null, 'EXPRESSO', null, null, null, '[]'::jsonb, null, 'EXPRESSO: DOCE DE CAJÁ COD R609', 'TINTAS-R100-1'),
  ('GOIANA EXPRESSO', 101, 'tinta', 'CAPIM DOURADO', null, null, null, null, 'PADARIA/PAES ESPECIAIS', null, null, null, '[]'::jsonb, null, 'PADARIA/PAES ESPECIAIS: CAPIM DOURADO', 'TINTAS-R101-1'),
  ('GOIANA EXPRESSO', 102, 'tinta', 'CAPIM DOURADO', null, null, null, null, 'ADEGAS VINHOS E DESTILADOS', null, null, null, '[]'::jsonb, null, 'ADEGAS VINHOS E DESTILADOS: CAPIM DOURADO', 'TINTAS-R102-1')
)
insert into public.client_materials (
  client_id, source_row, category, item_name, brand, code, catalog_page, finish,
  application, quantity, unit, led_temperature, led_distribution, notes,
  raw_source, source_key
)
select
  c.id, s.source_row::integer, s.category, s.item_name, s.brand, s.code, s.catalog_page, s.finish,
  s.application, s.quantity::numeric, s.unit, s.led_temperature, s.led_distribution::jsonb, s.notes,
  s.raw_source, s.source_key
from source_rows s
join lateral (
  select id
  from public.clients c0
  where lower(trim(c0.name)) = lower(trim(s.client_name))
  order by c0.created_at, c0.id
  limit 1
) c on true
on conflict (source_key) where source_key is not null
do update set
  client_id = excluded.client_id,
  source_row = excluded.source_row,
  category = excluded.category,
  item_name = excluded.item_name,
  brand = excluded.brand,
  code = excluded.code,
  catalog_page = excluded.catalog_page,
  finish = excluded.finish,
  application = excluded.application,
  quantity = excluded.quantity,
  unit = excluded.unit,
  led_temperature = excluded.led_temperature,
  led_distribution = excluded.led_distribution,
  notes = excluded.notes,
  raw_source = excluded.raw_source,
  active = true,
  updated_at = now();

with source_rows(client_name, source_row, category, item_name, brand, code, catalog_page, finish, application, quantity, unit, led_temperature, led_distribution, notes, raw_source, source_key) as (
values
  ('GOIANA EXPRESSO', 103, 'tinta', 'GRAMA MOLHADA', null, 'P628', null, null, 'HORTIFRUTI', null, null, null, '[]'::jsonb, null, 'HORTIFRUTI: GRAMA MOLHADA COD P628', 'TINTAS-R103-1'),
  ('GOIANA EXPRESSO', 104, 'tinta', 'POR DO SOL', null, 'R266', null, null, 'FRUTAS, LEGUMES E VERDURAS', null, null, null, '[]'::jsonb, null, 'FRUTAS, LEGUMES E VERDURAS: POR DO SOL COD R266', 'TINTAS-R104-1'),
  ('GOIANA EXPRESSO', 105, 'tinta', 'NANQUIM', null, 'E161', null, null, 'BEBIDAS', null, null, null, '[]'::jsonb, null, 'BEBIDAS: NANQUIM COD E161', 'TINTAS-R105-1'),
  ('GOIANA EXPRESSO', 106, 'tinta', 'MAPA MUNDI', null, 'R067', null, null, 'TEM SEMPRE UMA OPÇÃO REFRESCANTE', null, null, null, '[]'::jsonb, null, 'TEM SEMPRE UMA OPÇÃO REFRESCANTE: MAPA MUNDI COD R067', 'TINTAS-R106-1'),
  ('GOIANA EXPRESSO', 107, 'tinta', 'AZUL ROYAL', 'Visual', null, null, null, 'ESTRUTURAS (CONGELADOS)', null, null, null, '[]'::jsonb, null, 'ESTRUTURAS (CONGELADOS): AZUL ROYAL (Visual)', 'TINTAS-R107-1'),
  ('GOIANA EXPRESSO', 108, 'tinta', 'ACAMPAMENTO NA SELVA', null, null, null, null, 'ESTRUTURAS (FRUTAS E VERDURAS)', null, null, null, '[]'::jsonb, null, 'ESTRUTURAS (FRUTAS E VERDURAS): ACAMPAMENTO NA SELVA', 'TINTAS-R108-1'),
  ('GOIANA EXPRESSO', 109, 'tinta', 'AZUL ROYAL', 'Visual', 'E339', null, null, 'ESTRUTURA CAIXA', null, null, null, '[]'::jsonb, null, 'ESTRUTURA CAIXA: AZUL ROYAL COD E339 (Visual)', 'TINTAS-R109-1'),
  ('GOIANA EXPRESSO', 109, 'tinta', 'GIZ DE CERA', 'Visual', 'R664', null, null, 'ESTRUTURA CAIXA', null, null, null, '[]'::jsonb, null, 'ESTRUTURA CAIXA: GIZ DE CERA COD R664 (Visual)', 'TINTAS-R109-2'),
  ('GAVIÃO', 114, 'tinta', 'VESTIDO DE CETIM', null, null, '297', null, 'EMBUTIDOS DEFUMADOS; ADEGA SELEÇÃO; LINGUIÇAS CASEIRAS; CARNES EMBALADAS; AÇOUGUE; PADARIA; HORTIFRUTI', null, null, null, '[]'::jsonb, null, 'VESTIDO DE CETIM - PAG 297', 'TINTAS-R114-1'),
  ('GAVIÃO', 115, 'tinta', 'VINHO CLASSICO', null, null, '36', null, 'LATICINIOS; BEBIDAS GELADAS', null, null, null, '[]'::jsonb, null, 'VINHO CLASSICO - PAG 36', 'TINTAS-R115-1'),
  ('GAVIÃO', 116, 'tinta', 'ORQUIDIA RUBI', null, null, '35', null, 'PEIXARIA E CONGELADOS', null, null, null, '[]'::jsonb, 'Na planilha consta ''PEXARIA''.', 'ORQUIDIA RUBI - PAG 35', 'TINTAS-R116-1')
)
insert into public.client_materials (
  client_id, source_row, category, item_name, brand, code, catalog_page, finish,
  application, quantity, unit, led_temperature, led_distribution, notes,
  raw_source, source_key
)
select
  c.id, s.source_row::integer, s.category, s.item_name, s.brand, s.code, s.catalog_page, s.finish,
  s.application, s.quantity::numeric, s.unit, s.led_temperature, s.led_distribution::jsonb, s.notes,
  s.raw_source, s.source_key
from source_rows s
join lateral (
  select id
  from public.clients c0
  where lower(trim(c0.name)) = lower(trim(s.client_name))
  order by c0.created_at, c0.id
  limit 1
) c on true
on conflict (source_key) where source_key is not null
do update set
  client_id = excluded.client_id,
  source_row = excluded.source_row,
  category = excluded.category,
  item_name = excluded.item_name,
  brand = excluded.brand,
  code = excluded.code,
  catalog_page = excluded.catalog_page,
  finish = excluded.finish,
  application = excluded.application,
  quantity = excluded.quantity,
  unit = excluded.unit,
  led_temperature = excluded.led_temperature,
  led_distribution = excluded.led_distribution,
  notes = excluded.notes,
  raw_source = excluded.raw_source,
  active = true,
  updated_at = now();

-- Linhas sem cliente identificável.
insert into public.client_material_import_issues
  (source, source_row, raw_source, issue_type, resolution_status, resolution_notes)
values
  ('Planilha MATERIAIS / TINTAS', 87, 'ESMERALDA BRILHO 00800042',
   'cliente_nao_identificado', 'pending',
   'Linha sem cliente na aba TINTAS. Não foi vinculada automaticamente.'),
  ('Planilha MATERIAIS / TINTAS', 88, 'GENERAL FLEET COLOR 00800044',
   'cliente_nao_identificado', 'pending',
   'Linha sem cliente na aba TINTAS. A referência também aparece no cadastro BELTEZ, mas esta linha isolada foi preservada para conferência.')
on conflict (source, source_row, raw_source)
do update set
  issue_type = excluded.issue_type,
  resolution_status = excluded.resolution_status,
  resolution_notes = excluded.resolution_notes,
  updated_at = now();
