# Numeração automática de OS

Quando o número da OS estiver vazio ou contiver somente zeros, como `0000`, o sistema solicita ao Supabase um número base único.

A regra é aplicada em:

- pedido único;
- OP com subpedidos;
- importação de PDF;
- importação de pedidos por CSV/XML;
- edição do resumo de uma OS.

Em uma OP com subpedidos, o número gerado é usado como base. Exemplo:

- número gerado: `11600`;
- subpedidos: `11600-1`, `11600-2`, `11600-3`.

A migração `20260727010000_automatic_unique_order_number.sql` cria um contador central e a função protegida `generate_unique_order_number()`. O contador evita que dois usuários recebam o mesmo número ao mesmo tempo.
