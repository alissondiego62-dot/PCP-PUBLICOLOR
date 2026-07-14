# Agrupamento de OP e subpedidos

A tela **Todos os pedidos** agora agrupa automaticamente pedidos pelo padrão do número da OP.

## Regra

- `959-1`, `959-2`, `959-3` e `959-4` aparecem como uma única OP pai `959`.
- A seta ao lado da OP pai expande ou recolhe os subpedidos.
- Cada subpedido continua sendo um registro independente no banco e no Kanban.
- Ao abrir um subpedido, o sistema mantém histórico, comentários, materiais, arquivos, setor e prazo próprios.
- Uma OP sem sufixo numérico, como `960`, continua aparecendo como pedido individual.

## Padrão obrigatório

Para o agrupamento automático, usar:

```text
NUMERO-ITEM
```

Exemplo:

```text
959-1
959-2
959-3
959-4
```

Não foi necessária alteração no Supabase. O agrupamento é calculado na interface a partir do número da OP.
