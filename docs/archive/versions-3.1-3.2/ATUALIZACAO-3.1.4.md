# Publicolor PCP 3.1.4

## Atividades e compras consolidadas

Esta versão reorganiza o grupo **Compras** para trabalhar com uma atividade principal por OP e uma subatividade para cada material indisponível.

### Estrutura

```text
Comprar materiais — OP 1095-2
├── ACM preto 3 mm
├── Metalom 20 × 20
└── Tinta automotiva azul
```

A migração converte as atividades automáticas já existentes sem perder o vínculo com a OS, o material, o responsável, o prazo ou o status.

## Subatividades recolhíveis

Atividades principais com subatividades passam a ter um controle para expandir ou recolher os itens. O resumo permanece visível com:

- quantidade total de subatividades;
- quantidade concluída;
- progresso do grupo;
- total estimado da compra, quando aplicável.

## Propagação de status

Ao alterar o status de uma atividade principal que possui subatividades, o sistema pergunta se a alteração deve ser aplicada:

- somente à atividade principal;
- à atividade principal e a todas as subatividades;
- ou cancelada.

Ao finalizar a última subatividade, o sistema pergunta se a atividade principal também deve ser finalizada. Ao reabrir uma subatividade de compra, a atividade principal é reaberta automaticamente.

## Lista de compra copiável

A atividade principal de compra possui o botão **Copiar lista**, que copia para a área de transferência:

```text
PEDIDO DE COMPRA — OP 1095-2
Cliente: Cely

1. ACM preto 3 mm — 2 chapas
2. Metalom 20 × 20 — 6 barras
3. Tinta automotiva azul — 3 litros
```

## Quantidade, unidade e preço

Cada subatividade de compra permite editar:

- quantidade;
- unidade;
- preço unitário;
- subtotal calculado automaticamente.

A atividade principal mostra:

- total de produtos;
- quantidade de itens com preço;
- total estimado ou total parcial;
- quantidade de itens ainda sem preço.

O valor total é calculado por:

```text
quantidade × preço unitário
```

## Materiais da OS

O cadastro simplificado de materiais passa a solicitar:

- material;
- quantidade;
- unidade;
- disponibilidade;
- observação opcional.

O preço continua sendo informado na atividade de Compras.

## Histórico

Alterações de material são registradas no histórico da OS:

- nome;
- quantidade;
- unidade;
- preço unitário;
- disponibilidade;
- status da compra.

## Banco de dados

A versão exige a execução de:

```text
SQL-ATUALIZACAO-PUBLICOLOR-3.1.4.sql
```

O arquivo da raiz é cumulativo e também instala a base 3.1.3 quando ela ainda não foi aplicada. No histórico de migrations, a etapa específica da versão está em:

```text
supabase/migrations/20260801010000_purchase_activity_hierarchy_and_pricing.sql
```

A atualização adiciona `order_materials.unit_price`, o tipo de atividade `purchase_order`, os vínculos hierárquicos das compras e os gatilhos de sincronização e histórico.
