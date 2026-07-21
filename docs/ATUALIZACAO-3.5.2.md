# Publicolor PCP 3.5.2

## Importador de PDF com páginas complementares

Cada página do PDF agora pode ser configurada como:

- **Novo pedido**: cria um pedido ou subpedido independente, mantendo o comportamento anterior.
- **Complemento de outro pedido**: não cria um novo pedido; a página é enviada para a pasta Documentos do pedido selecionado.

### Regras

- Deve existir pelo menos uma página definida como novo pedido.
- Uma página complementar precisa indicar qual página/pedido receberá o documento.
- A página principal continua sendo utilizada como miniatura do pedido.
- Todas as páginas complementares ficam preservadas no Google Drive e vinculadas à mesma OP.
- O rodapé do importador informa separadamente quantos pedidos e complementos serão importados.

## Banco de dados

Esta versão não altera tabelas, políticas ou funções. O SQL da versão 3.5.0 Revisado continua válido.
