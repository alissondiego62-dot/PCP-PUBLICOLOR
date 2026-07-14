# Controle de Pedidos Kanban

Sistema web para acompanhar ordens de produção por setor e status, com dados centralizados no Supabase.

## Recursos principais

- Login com e-mail e senha e recuperação de senha;
- Kanban por setor, com colunas **Aguardando** e **Em andamento**;
- Movimentação de pedidos por arrastar e soltar;
- Histórico automático de movimentações;
- Comentários por pedido;
- Pesquisa, filtros e ordenação;
- Telas de pedidos, concluídos, clientes e relatórios;
- Menu lateral adaptado para computador, tablet e celular;
- Controle de acesso com políticas RLS no Supabase.

## Requisitos

- Node.js 22.13 ou superior;
- Uma conta e um projeto no Supabase;
- pnpm.

## Configuração local

1. Instale as dependências:

   ```bash
   pnpm install
   ```

2. Crie o arquivo `.env.local` a partir de `.env.example` e informe os dados públicos do seu projeto Supabase:

   ```env
   NEXT_PUBLIC_SUPABASE_URL=https://SEU-PROJETO.supabase.co
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=SUA_CHAVE_PUBLICA
   ```

3. No painel SQL do Supabase, execute o arquivo:

   ```text
   supabase/migrations/0001_initial.sql
   ```

4. Inicie o sistema:

   ```bash
   pnpm dev
   ```

5. Abra `http://localhost:3000` no navegador.

## Validação para publicação

```bash
pnpm build
```

O arquivo `.env.local` não é enviado ao GitHub. Em cada ambiente de hospedagem, configure as variáveis do Supabase diretamente no painel do serviço.
