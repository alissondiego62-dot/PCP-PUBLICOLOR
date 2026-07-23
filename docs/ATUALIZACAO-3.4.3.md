# Publicolor PCP 3.4.3 — Pilhas de subpedidos no Kanban

## Agrupamento

O Kanban agrupa pedidos da mesma OP quando todos os critérios abaixo são iguais:

- número-base da OP, como `1052` para `1052-1`, `1052-2` e `1052-3`;
- setor atual;
- faixa de status do Kanban.

Pedidos da mesma OP em setores ou status diferentes permanecem separados nas respectivas colunas e faixas.

## Pilha recolhida

A pilha mostra:

- OP principal;
- quantidade de itens;
- cliente ou quantidade de clientes;
- prazo de produção mais próximo;
- quantidade de pedidos atrasados;
- quantidade de pedidos pausados ou bloqueados;
- responsável ou quantidade de responsáveis;
- total de comentários da família.

## Pilha expandida

Ao abrir a pilha, os subpedidos aparecem ordenados pelo sufixo numérico. Cada item mantém as ações individuais já existentes:

- abrir OS;
- histórico;
- comentários;
- mover setor;
- alterar status;
- finalizar;
- excluir, para administrador.

## Regra após recarregar

As pilhas sempre iniciam recolhidas em uma nova carga da página. O estado aberto ou fechado não é gravado em `localStorage`, Supabase ou outro armazenamento.

Atualizações em tempo real não fecham uma pilha que já esteja aberta durante a sessão atual.

## Banco de dados

A versão 3.4.3 não altera tabelas, colunas, políticas, funções ou migrations. O SQL cumulativo corrigido da versão 3.4.2 continua sendo a estrutura de banco necessária.
