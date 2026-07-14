# Cadastro conjunto de OP, subpedidos e edição de clientes

## Cadastro de pedido ou OP

O botão **Novo pedido** abre um formulário com dois modos:

- **Pedido único**: cria uma única OP.
- **OP com subpedidos**: cria vários registros independentes em uma única operação.

No modo com subpedidos, o número principal é informado uma vez e cada item recebe um sufixo numérico. Exemplo:

- OP principal: `959`
- Itens: `1`, `2`, `3`
- Registros criados: `959-1`, `959-2`, `959-3`

Também são aceitas OPs compostas, como `LEG-2028`, gerando `LEG-2028-0287`, desde que o número do item seja informado como `0287`.

## Dados gerais reaproveitados

Os seguintes dados podem ser informados uma vez e são copiados para os itens que ainda não foram personalizados:

- cliente;
- data da instalação ou entrega;
- responsável/consultor;
- endereço da instalação ou entrega;
- prioridade;
- setor inicial.

Cada subpedido continua editável separadamente. Alterar um dado geral não sobrescreve um item que já tenha recebido um valor diferente.

Cada item também possui serviço, materiais, observações e miniatura próprios. É possível adicionar, duplicar e remover subpedidos antes de salvar.

## Datas

Para cada item, a data informada é gravada como data da instalação ou entrega. O prazo de produção é calculado automaticamente para o dia útil anterior.

## Gravação

Todos os subpedidos são enviados ao Supabase em uma única inserção. Se houver número de OP repetido ou algum erro de validação, o lote não é criado parcialmente.

As miniaturas são enviadas após a criação dos registros. Uma falha em uma miniatura não apaga os pedidos já cadastrados e é informada ao usuário.

## Clientes

O cadastro de cliente pode ser criado ou editado:

- dentro do formulário de novo pedido;
- dentro de cada subpedido;
- diretamente nos cartões da página **Clientes**;
- na tela detalhada do cliente.

Ao alterar o nome ou nome fantasia, o nome exibido nos pedidos vinculados também é sincronizado. CPF/CNPJ, telefones, WhatsApp, e-mail, contato, endereço, bairro, cidade, estado, observações e situação ativa podem ser atualizados.

## Banco de dados

Esta atualização utiliza as tabelas e colunas já existentes. Não exige nova migração SQL.
