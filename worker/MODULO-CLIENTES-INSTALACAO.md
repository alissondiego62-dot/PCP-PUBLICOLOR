# Módulo de Clientes

## O que foi adicionado

- Cadastro estruturado de clientes.
- Busca por nome, CPF/CNPJ, telefone ou WhatsApp ao criar um pedido.
- Cadastro rápido de cliente dentro da tela de novo pedido.
- Seleção automática do cliente recém-cadastrado.
- Página de Clientes com cards pesquisáveis.
- Detalhes do cliente com pedidos ativos e concluídos.
- Botão para criar novo pedido diretamente a partir do cliente.
- Relacionamento `orders.client_id`.
- Migração automática dos nomes já existentes em pedidos para a tabela `clients`.

## Aplicação

1. Faça backup do projeto atual.
2. Extraia o ZIP e copie seu `.env.local`.
3. No Supabase, abra o SQL Editor.
4. Execute:
   `supabase/migrations/20260716010000_clients_module.sql`
5. Reinicie o projeto:

```powershell
pnpm install
pnpm dev
```

## Testes

- Abra Clientes e selecione um cadastro.
- Confira pedidos ativos e concluídos.
- Abra Novo pedido.
- Pesquise um cliente existente.
- Cadastre um novo cliente pelo próprio formulário.
- Crie o pedido e confirme o vínculo.
