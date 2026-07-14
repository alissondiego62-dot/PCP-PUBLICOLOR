# Consultor selecionável

O campo **Consultor responsável** agora é um seletor nas seguintes telas:

- Novo pedido;
- Resumo da Ordem de Serviço;
- Produção da Ordem de Serviço.

A lista contém os consultores históricos e também incorpora automaticamente qualquer consultor já salvo em pedidos existentes.

As alterações continuam sendo registradas em `order_change_history` pelo trigger da migration de auditoria.
