# Correção da exclusão de pedidos

A exclusão agora é executada pela função `delete_order_permanently`, disponível
somente para administradores. As tabelas vinculadas à ordem usam `ON DELETE
CASCADE`, evitando bloqueios causados por histórico, comentários, arquivos,
materiais, checklist, sessões de upload ou registro de pastas do Drive.

Aplicar primeiro:

`supabase/migrations/20260725010000_fix_order_delete_cascade.sql`
