# Arquitetura do PCP Publicolor 3.0

## Aplicação

```text
app/
├── api/                         Rotas administrativas e Google Drive
├── page.tsx                    Orquestração das telas e regras operacionais
├── layout.tsx                  Metadados e carregamento das folhas de estilo
└── *.css                       Estilos por módulo e camada responsiva final

components/
├── ActivitiesView.tsx
├── ClientsView.tsx
├── CompletedOrdersView.tsx
├── DataImportExportSettings.tsx
├── GoogleDriveSettings.tsx
├── OrderBatchForm.tsx
├── OrderDriveUpload.tsx
├── PdfOrderImporter.tsx
└── PlatformAdministrationSettings.tsx

lib/
├── async.ts                    Controle de concorrência no navegador
├── order-number.ts             Regras de numeração
├── order-thumbnail.ts          Formato único de miniatura do Drive
├── pcp-config.ts               Menu, funções e rótulos do domínio
├── pcp-formatters.ts           Datas e apresentação
├── pcp-types.ts                Tipos do domínio
├── pdf-order-import.ts         Leitura e normalização de PDF
├── supabase.ts                 Cliente do navegador
└── server/                     Credenciais e serviços exclusivos do servidor
```

## Banco de dados

O Supabase é a fonte única de dados. As migrations ficam em `supabase/migrations`.

As novas views reduzem transferência e processamento:

- `order_comment_counts`: contagem agregada de comentários;
- `order_thumbnail_candidates`: melhor PNG disponível por pedido/subpedido.

## Miniaturas

O campo `orders.main_image_path` aceita:

- caminho do Supabase Storage;
- URL HTTP/HTTPS;
- `gdrive-pdf:<drive_file_id>` para PNG armazenado no Google Drive.

A sincronização permanente usa os registros de `order_files`, priorizando a categoria `document`.

## Decisões de limpeza

Foram removidos:

- cópias integrais em `examples/`, `worker/` e dentro de `tests/`;
- estrutura Drizzle/D1 não utilizada;
- dependências Cloudflare, Tailwind e Drizzle sem uso no deploy Vercel;
- documentação histórica duplicada;
- segundo lockfile do npm.

O projeto mantém somente o lockfile do pnpm.
