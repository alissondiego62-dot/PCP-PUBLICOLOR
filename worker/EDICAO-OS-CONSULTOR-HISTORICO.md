# Edição completa da OS

## Aplicação

1. Execute no Supabase SQL Editor, nesta ordem:
   - `supabase/migrations/20260713090000_editable_orders_consultant_history.sql`
   - `supabase/migrations/20260716020000_organized_order_history.sql`
2. Publique o projeto atualizado.

## Alterações

- Edição de OP, cliente, serviço, prazo, prioridade, consultor, materiais e observações.
- Edição de setor, status, prioridade e prazo pela aba Produção.
- A seleção do consultor fica somente no cadastro e na aba Resumo.
- O campo Responsável foi substituído por Consultor.
- Alterações feitas juntas aparecem agrupadas na mesma ocorrência do Histórico.
- Movimentações de setor/status e agendamentos usam `order_history`, sem duplicação visual.
- Demais alterações ficam registradas em `order_change_history`, incluindo materiais e dados completos da instalação.
