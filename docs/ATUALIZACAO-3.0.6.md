# Publicolor 3.0.6 — Importação de miniaturas por ZIP

## Onde fica

Configurações → Administração técnica → Importar miniaturas por número da OP.

## Regras

- O arquivo deve ser ZIP.
- Dentro dele, use PNGs com o número da OP no nome.
- Exemplos: `776.png`, `776-02.png`, `OP 776-02 miniatura.png`.
- O sistema relaciona primeiro o número mais específico; portanto `776-02` não é confundido com `776`.
- Cada PNG é enviado para `04 - DOCUMENTOS` da OP ou subpedido.
- A imagem importada passa a ser a miniatura oficial.
- Se já houver uma miniatura do Google Drive, a anterior é excluída somente depois que a nova for concluída.
- Arquivos sem OP, duplicados ou maiores que 25 MB são informados e ignorados.

## Banco

Não há alteração estrutural no banco. O arquivo `SQL-VALIDAR-IMPORTACAO-MINIATURAS-ZIP.sql` apenas valida as tabelas e colunas necessárias.
