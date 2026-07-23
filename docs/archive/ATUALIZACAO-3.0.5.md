# Publicolor 3.0.5 — miniatura oficial da página do PDF

## Regra aplicada

O PNG criado de cada página durante a importação do PDF da ordem de serviço é a miniatura oficial do respectivo pedido ou subpedido.

Exemplos reconhecidos:

- `776_pagina_02.png`
- `776-pagina-02.png`
- arquivo com a observação `Página da ordem de serviço importada em PDF e usada como miniatura...`

## Comportamento

1. O arquivo continua registrado na aba **Arquivos**, categoria **Documento**.
2. O servidor grava automaticamente `orders.main_image_path` como `gdrive-pdf:<ID_DO_ARQUIVO>`.
3. A sincronização permanente das Configurações prioriza esse PNG acima de qualquer outro documento.
4. A migration corrige os pedidos/subpedidos já migrados.

## Banco

Migration adicionada:

`supabase/migrations/20260729020000_pdf_imported_page_as_thumbnail.sql`

Não cria tabelas nem colunas. Apenas atualiza a view de candidatos e corrige `main_image_path` dos pedidos que já possuem a página PNG importada.
