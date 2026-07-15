# Publicolor PCP 3.1.3

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

A versão **3.1.3 exige SQL**. Execute primeiro em homologação e, após validar, em produção:

```text
SQL-ATUALIZACAO-PUBLICOLOR-3.1.3.sql
```

A mesma alteração está versionada em:

```text
supabase/migrations/20260731010000_simplified_materials_and_purchase_workflow.sql
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

- `COMO-ATUALIZAR-PUBLICOLOR-3.1.3.txt`
- `COMO-ATUALIZAR-PUBLICOLOR-3.1.2.txt` — referência da versão anterior
- `COMO-ATUALIZAR-PUBLICOLOR-3.1.1.txt` — referência da versão anterior
- `COMO-ATUALIZAR-PUBLICOLOR-3.1.0.txt` — somente referência da versão anterior
- `docs/AMBIENTES-E-DEPLOY.md`
- `docs/ARQUITETURA-3.1.md`
- `docs/RELATORIO-IMPLEMENTACAO-3.1.0.md`

## Publicolor PCP 3.1.1

O carregamento das miniaturas foi alterado para modo progressivo: somente cartões visíveis ou próximos da tela solicitam imagens. O sistema usa cache local por usuário, limita downloads simultâneos e entrega os WebPs diretamente pelo CDN do Supabase. Em **Configurações**, o administrador pode pré-gerar todas as miniaturas otimizadas.

Consulte `docs/ATUALIZACAO-3.1.1.md` e `COMO-ATUALIZAR-PUBLICOLOR-3.1.1.txt`.


## Publicolor PCP 3.1.2

Depois de priorizar as miniaturas visíveis e próximas, o Kanban passa a preparar automaticamente as demais em segundo plano, com duas vagas de baixa prioridade e capacidade reservada para solicitações do usuário. Os indicadores superiores foram reorganizados, tornados clicáveis e adaptados para desktop, tablet e celular.

Consulte `docs/ATUALIZACAO-3.1.2.md` e `COMO-ATUALIZAR-PUBLICOLOR-3.1.2.txt`.


## Publicolor PCP 3.1.3

A área de materiais da OS foi simplificada para nome, disponibilidade e observação. Materiais não disponíveis criam automaticamente uma atividade no grupo Compras, atribuída ao usuário que realizou a ação e com prazo de 24 horas. A atividade possui os status Pendente, Aguardando orçamento, Aguardando separação, Aguardando entrega e Finalizada. Ao finalizar, o material passa automaticamente para Disponível na OS.

Consulte `docs/ATUALIZACAO-3.1.3.md` e `COMO-ATUALIZAR-PUBLICOLOR-3.1.3.txt`.
