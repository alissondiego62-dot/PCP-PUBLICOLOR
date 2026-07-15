# PCP Publicolor 3.0

Sistema web de PCP para controle de pedidos, produção, agenda de instalação/entrega, clientes, atividades, arquivos e histórico.

## Requisitos

- Node.js 22.13 ou superior
- pnpm 11.12
- Projeto Supabase configurado
- Projeto Vercel configurado
- Google Drive OAuth configurado para o módulo de arquivos

## Instalação local

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

## Validação antes de publicar

```bash
pnpm validate
```

## Publicação

O projeto está preparado para Vercel. O diretório raiz da Vercel deve apontar para a raiz deste repositório.

## Atualização do banco

Execute no SQL Editor do Supabase:

```text
SQL-ATUALIZACAO-PUBLICOLOR-3.0.sql
```

O mesmo SQL está registrado como migration em:

```text
supabase/migrations/20260729010000_publicolor_3_performance_and_thumbnail_views.sql
```

## Regras de interface

- **Dashboard:** somente consulta e indicadores.
- **Produção · Kanban:** movimentação e acompanhamento dos pedidos, sem criação ou importação.
- **Pedidos:** local exclusivo para `Importar PDF` e `Novo pedido`.
- **Configurações:** inclui sincronização permanente das miniaturas da aba Arquivos.

Consulte `docs/ARQUITETURA.md` e `docs/ATUALIZACAO-3.0.md`.


## Publicolor 3.0.3

Correção da cadeia de migrations e do Supabase Preview. Consulte `CORRECAO-SUPABASE-PREVIEW.md` antes do próximo deploy.

## Publicolor 3.0.5

O PNG gerado de cada página importada do PDF da OS passa a ser automaticamente a miniatura oficial do pedido ou subpedido. Consulte `docs/ATUALIZACAO-3.0.5.md`.
