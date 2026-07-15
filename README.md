# Publicolor PCP 3.1.0

Sistema web de planejamento e controle de produção da Publicolor, com Dashboard, Kanban, Pedidos, agenda de instalação/entrega, clientes, atividades, arquivos, histórico e integrações com Supabase e Google Drive.

## Requisitos

- Node.js 24.x
- pnpm 11.12.0
- dois ambientes separados para produção e homologação
- Supabase configurado em cada ambiente
- Vercel configurada em cada ambiente
- Google Drive OAuth configurado para os arquivos das OPs

## Instalação local

```bash
corepack enable
pnpm install --frozen-lockfile
cp .env.example .env.local
pnpm dev
```

## Validação

```bash
pnpm validate
```

Os testes responsivos usam Playwright Python e as credenciais do banco de homologação:

```bash
python -m pip install -r requirements-e2e.txt
python -m playwright install chromium
pnpm test:e2e
```

## Atualização do banco

Execute primeiro em homologação e depois em produção:

```text
SQL-ATUALIZACAO-PUBLICOLOR-3.1.0.sql
```

A mesma alteração está versionada em:

```text
supabase/migrations/20260730010000_observability_and_thumbnail_cache.sql
```

## Entregas da versão 3.1.0

- botão **Mover** nos cartões em celular e tablet;
- navegação horizontal setor por setor no Kanban;
- módulos separados para Dashboard, Kanban, Pedidos, Relatórios, Usuários e Configurações;
- CSS responsivo consolidado;
- testes Playwright em seis resoluções;
- atualizações incrementais com Supabase Realtime;
- PNG original no Drive e WebP otimizado no Kanban;
- diagnóstico de integrações e observabilidade;
- PWA com cópia offline somente leitura por usuário;
- versão, commit, branch e ambiente visíveis em Configurações;
- modelos e procedimento para produção e homologação separadas.

## Regras de interface

- **Dashboard:** consulta e indicadores.
- **Produção · Kanban:** acompanhamento e movimentação; sem criação ou importação.
- **Pedidos:** local exclusivo para `Importar PDF` e `Nova ordem`.
- **Configurações:** integrações, importação de miniaturas por ZIP, diagnóstico e versão publicada.

Leia antes de publicar:

- `COMO-ATUALIZAR-PUBLICOLOR-3.1.0.txt`
- `docs/AMBIENTES-E-DEPLOY.md`
- `docs/ARQUITETURA-3.1.md`
- `docs/RELATORIO-IMPLEMENTACAO-3.1.0.md`
