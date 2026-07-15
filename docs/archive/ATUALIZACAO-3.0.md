# Atualização 3.0

## Interface

- removidos os botões `Importar PDF` e `Novo pedido` do Dashboard;
- removidos os mesmos botões da Produção · Kanban;
- removido o atalho de novo pedido da ficha do cliente;
- criação e importação centralizadas na aba Pedidos;
- camada responsiva final para desktop, notebook, tablet e celular;
- formulários, modais, configurações, tabelas, indicadores e Kanban protegidos contra estouro horizontal.

## Desempenho

- miniaturas do Drive são carregadas com concorrência limitada;
- URLs de miniaturas são reutilizadas quando o caminho não mudou;
- alterações em comentários atualizam somente as contagens;
- alterações em clientes atualizam somente a lista de clientes;
- view agregada evita baixar todos os comentários apenas para contá-los.

## Configurações

A sincronização de miniaturas permanece disponível para administradores. Ela:

1. analisa os PNGs já vinculados na aba Arquivos;
2. prioriza a categoria Documento;
3. atualiza `orders.main_image_path`;
4. registra o evento no histórico;
5. pode ser executada novamente sem duplicar dados.

## Banco

O SQL 3.0:

- normaliza valores vazios;
- cria índices para Kanban, Dashboard, Agenda, Pedidos e detalhes;
- cria as views de contagem de comentários e seleção de miniaturas;
- é idempotente e pode ser reaplicado.
