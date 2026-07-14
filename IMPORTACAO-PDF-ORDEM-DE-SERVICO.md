# Importação de ordem de serviço por PDF

## Onde acessar

Nas páginas **Pedidos** e **Produção - Kanban**, use o botão **Importar PDF**, ao lado de **Novo pedido**.

## Fluxo

1. Selecione ou arraste um PDF para o importador.
2. O sistema lê todas as páginas e identifica os campos do modelo da Publicolor.
3. Cada página vira um pedido/subpedido editável.
4. Revise cliente, OP, data, responsável, setor, endereço e especificações.
5. Confirme a importação.
6. Cada página é convertida em PNG e armazenada como miniatura da respectiva OS.

## Campos identificados

- número da OP;
- número e total de páginas;
- cliente;
- data de entrada;
- prazo de entrega/instalação;
- período;
- telefone e contato, quando legíveis;
- título do serviço;
- endereço de instalação/entrega;
- descrição;
- materiais e especificações.

## Exemplo validado

No PDF `ORDEM DE SERVIÇO - LETREIROS INTERNOS E EXTERNOS NEOFIT.pdf`, o importador identifica:

- OP principal: `959`;
- cliente: `NEOFIT - JULIANO`;
- instalação/entrega: `29/07/2026`;
- endereço: `R. MARIA DOS ANJOS PIMENTAL GUERREIRO, 10 - ORQUÍDEAS, PACARAIMA`;
- quatro páginas, gerando quatro subpedidos;
- serviços de letreiros luminosos externos, letreiros sem iluminação internos e letreiro luminoso interno.

## Observações técnicas

- limite: 50 MB e 80 páginas por PDF;
- PDFs com camada de texto têm preenchimento automático mais preciso;
- PDFs digitalizados somente como imagem continuam gerando as miniaturas, mas os campos devem ser revisados manualmente;
- o prazo interno de produção continua sendo calculado automaticamente para um dia útil antes da instalação/entrega;
- nenhuma alteração de banco de dados é necessária.

## Limpeza do cabeçalho em materiais e especificações

Na importação das OSs da Publicolor, o campo **Materiais e especificações** começa na linha **Local de instalação** e segue até o bloco **Descrição**. O importador ignora automaticamente paginações como `01 - 04` / `01 - 01`, nomes e telefones do consultor que aparecem no cabeçalho da página. Esses telefones também não são replicados nas observações do pedido.
