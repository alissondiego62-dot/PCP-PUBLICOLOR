# Importação e exportação — CSV e XML

A área **Configurações > Importação e exportação** permite transferir clientes e pedidos sem alterar a estrutura do banco de dados.

## Exportação

- Clientes em CSV ou XML.
- Pedidos e subpedidos em CSV ou XML.
- Arquivos CSV em UTF-8, separados por ponto e vírgula e compatíveis com Excel e Google Planilhas.
- Exportação de modelo preenchido para orientar novas importações.

## Importação de clientes

Os clientes são localizados nesta ordem:

1. ID do cliente, quando pertencer à base atual;
2. CPF ou CNPJ normalizado;
3. nome ou razão social;
4. nome fantasia.

A opção **Atualizar registros existentes** controla se cadastros encontrados serão atualizados ou ignorados.

## Importação de pedidos

- Cada linha representa um pedido ou subpedido.
- Pedidos são localizados pelo número da OP.
- O cliente pode ser localizado por ID, CPF/CNPJ ou nome.
- É possível criar automaticamente um cadastro básico quando o cliente ainda não existe.
- O setor pode ser informado pelo ID ou pelo nome cadastrado no sistema.
- A data informada representa instalação ou entrega.
- O prazo de produção continua sendo calculado automaticamente para um dia útil antes.

## Validação

Antes de gravar os dados, o sistema apresenta:

- quantidade de registros reconhecidos;
- formato do arquivo;
- prévia de até cinco registros;
- opções de atualização;
- relatório final com criados, atualizados, ignorados e erros por linha.

Limites atuais:

- arquivo de até 10 MB;
- até 5.000 registros por importação;
- formatos `.csv` e `.xml`.

Não é necessária uma nova migração SQL para este módulo.
