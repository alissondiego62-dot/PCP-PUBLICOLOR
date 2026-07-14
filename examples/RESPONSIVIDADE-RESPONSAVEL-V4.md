# Publicolor 2.0 — responsável e responsividade V4

## Alterações funcionais

- O responsável exibido nas telas é o **Consultor responsável** definido na aba **Resumo** da ordem.
- A tela **Todos os pedidos** passou a exibir a coluna Responsável na OP pai e em cada subpedido.
- O Kanban passou a exibir o responsável dentro de cada cartão.
- O filtro por responsável foi incluído no painel de filtros do Kanban.
- A tela Todos os pedidos recebeu filtro direto por responsável, incluindo a opção **Sem responsável**.
- Ao filtrar uma OP pai, a contagem e os subpedidos exibidos consideram somente os pedidos compatíveis com o filtro.

## Correções de layout

- Removida a listagem extensa de números de subpedidos no resumo da OP pai, evitando sobreposição.
- Colunas da tabela passaram a usar larguras fluidas, quebra segura e limite de linhas.
- Em notebooks e tablets, a tabela transforma cada OP em um cartão organizado.
- Em celulares, OP, cliente, setor, responsável, entrega e ação ficam empilhados e legíveis.
- Cartões do Kanban foram ajustados para desktop, tablet e celular.
- Formulários, modal da ordem, filtros, botões e áreas de ação receberam ajustes para toque e telas estreitas.

## Arquivos principais

- `app/page.tsx`
- `app/responsive-v4.css`
- `app/layout.tsx`
