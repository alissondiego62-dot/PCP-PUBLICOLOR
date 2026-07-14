# Correção de pastas duplicadas no Google Drive

## Regra localizar antes de criar

A criação de pastas do Google Drive agora consulta todos os filhos do mesmo pai e compara os nomes de forma normalizada, desconsiderando diferenças de maiúsculas/minúsculas, acentos, espaços e separadores.

A regra é aplicada em todos os níveis:

- pasta principal;
- CLIENTES;
- cliente;
- OP;
- subpedido;
- Arte, Aprovação, Produção, Documentos, Fotos, Instalação e Outros.

## Proteção contra importações simultâneas

O importador de PDF envia as páginas ao Drive em sequência. No servidor, requisições concorrentes com a mesma pasta usam uma trava local e uma verificação posterior à criação.

Caso duas pastas iguais ainda sejam criadas por duas instâncias simultâneas da Vercel, o sistema identifica as duas, escolhe uma pasta canônica, move o conteúdo para ela e envia a duplicada para a lixeira.

## Consolidação das duplicatas existentes

Ao enviar um arquivo ou clicar em **Atualizar arquivos** em uma OS, o sistema:

1. localiza todas as pastas equivalentes do cliente;
2. escolhe a pasta que possui mais conteúdo como principal;
3. move OPs, subpedidos, categorias e arquivos das pastas duplicadas;
4. mescla subpastas de mesmo nome recursivamente;
5. envia apenas as pastas vazias duplicadas para a lixeira;
6. continua a sincronização usando a pasta principal.

Nenhum arquivo é apagado durante a consolidação. Pastas duplicadas são enviadas para a lixeira somente depois da transferência do conteúdo.

## Banco de dados

Nenhuma migração SQL é necessária para esta correção.
