# Correção RLS do importador PDF

A política anterior de criação de pedidos exigia `installation_scheduled_at is null`.
Isso conflitava com a regra atual do sistema, em que a data informada no cadastro é
sempre a data de instalação/entrega e o prazo de produção é calculado automaticamente.

A migração `20260724010000_fix_orders_insert_rls_for_pdf_import.sql`:

- permite criar pedidos com data de instalação/entrega;
- mantém a criação restrita a administrador e operador;
- exige `created_by = auth.uid()`;
- impede criação direta como concluído ou bloqueado;
- recarrega o cache do PostgREST.

O código também envia explicitamente `created_by`, `blocked` e `completed_at` no
cadastro em lote, incluindo importações por PDF.
