# Publicolor 2.0 — Controle de Produção

Sistema de PCP para ordens de serviço, produção, instalação, clientes e arquivos da Publicolor.

## Módulos principais

- Dashboard operacional;
- Kanban por setor e status;
- OP principal com múltiplos subpedidos;
- Pedidos ativos e concluídos;
- agenda mensal de instalação/entrega;
- cadastro e edição de clientes;
- responsáveis, prioridades e prazos automáticos;
- materiais, checklist, comentários e histórico;
- integração com Google Drive;
- importação e exportação em CSV/XML;
- usuários e permissões;
- configuração administrativa de ambiente e execução controlada de SQL.

## Requisitos

- Node.js 22.13 ou superior;
- pnpm 11;
- projeto Supabase;
- projeto Vercel;
- projeto Google Cloud com a Google Drive API ativada.

## Variáveis de ambiente

Crie `.env.local` a partir de `.env.example`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://SEU-PROJETO.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_EXEMPLO
SUPABASE_SERVICE_ROLE_KEY=sb_secret_EXEMPLO
NEXT_PUBLIC_APP_URL=https://seu-projeto.vercel.app
DRIVE_SETTINGS_ENCRYPTION_KEY=CHAVE_BASE64_DE_32_BYTES
```

`SUPABASE_SERVICE_ROLE_KEY` e `DRIVE_SETTINGS_ENCRYPTION_KEY` nunca devem usar o prefixo `NEXT_PUBLIC_`.

## Instalação local

```bash
pnpm install
pnpm dev
```

Abra `http://localhost:3000`.

## Banco de dados

Para uma instalação nova, execute as migrações de `supabase/migrations` em ordem cronológica.

Para atualizar uma instalação existente para esta revisão, execute primeiro:

```text
20260723010000_drive_order_folder_registry_and_sync.sql
```

Essa migração registra as pastas reais de cada OS, elimina vínculos duplicados do Drive e protege a unicidade de cada arquivo por pedido.

## Google Drive

A sincronização completa exige o escopo:

```text
https://www.googleapis.com/auth/drive
```

Depois de publicar esta versão, uma conta conectada anteriormente apenas com `drive.file` deve ser desconectada e conectada novamente em **Configurações → Integração com Google Drive**.

O botão **Atualizar arquivos**:

- localiza a raiz real da OP ou subpedido;
- consulta as sete categorias oficiais;
- percorre todas as subpastas recursivamente;
- aceita qualquer tipo de arquivo reconhecido pelo Google Drive;
- restaura na OS arquivos removidos apenas do sistema quando ainda existem no Drive;
- confere no final se todo arquivo localizado ficou visível no pedido.

## Validação antes da publicação

```bash
pnpm check
pnpm build
```

## Publicação

1. Execute a migração SQL mais recente.
2. Publique o código no GitHub/Vercel.
3. Faça um novo deployment de produção.
4. Atualize o navegador com `Ctrl + F5`.
5. Teste uma OP em computador, tablet e celular.

Consulte `REVISAO-GERAL-PUBLICOLOR-2.0.md` para o relatório desta versão.

## Módulo de Atividades

A página **Atividades** organiza grupos, atividades principais e subatividades. Itens marcados como concluídos ficam ocultos por padrão e podem ser exibidos novamente dentro do grupo. Para ativar o módulo, execute `20260726010000_activity_management.sql`.
