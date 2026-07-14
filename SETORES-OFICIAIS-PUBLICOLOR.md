# Setores oficiais da produção

A estrutura do Kanban e dos relatórios passa a usar estes setores, nesta ordem:

1. LASER
2. PLASMA
3. ROUTER
4. PINTURA
5. ADESIVAGEM
6. IMPRESSÃO
7. MONTAGEM LETRAS
8. SERRALHERIA
9. ELETRICA
10. MONTAGEM ACM
11. MANUTENÇÃO
12. INSTALAÇÃO

## Aplicação no banco

Execute no Supabase SQL Editor:

`supabase/migrations/20260713100000_official_production_sectors.sql`

A migration:

- cria ou ativa os setores oficiais;
- reorganiza as posições do Kanban;
- move cada pedido importado conforme `Setor original` salvo nas observações;
- mantém pedidos com setor original `ENTREGUE` como concluídos;
- converte aliases antigos, como `Router CNC`, `Impressão Digital` e `Instalação Externa`;
- desativa os setores antigos sem apagar o histórico.

O Kanban e os relatórios já leem a tabela `sectors`, portanto serão atualizados automaticamente após a migration.
