# Publicolor PCP 3.5.3

## Google Drive

- O sistema continua renovando automaticamente o `access_token` pelo `refresh_token`.
- Quando o Google informa que o token foi expirado ou revogado, as credenciais inválidas são retiradas do estado conectado.
- A mensagem técnica em inglês foi substituída por uma orientação para reconectar a conta.
- Administradores podem iniciar a reconexão diretamente na aba Arquivos da OS.
- A nova autorização mantém o `refresh_token` anterior quando o Google não envia outro, evitando perda acidental da renovação automática.
- A autorização OAuth continua solicitando acesso offline, consentimento e escopos já concedidos.

## Miniaturas PNG e páginas complementares

- As miniaturas deixam de ser geradas em WebP reduzido.
- O servidor prepara PNG em resolução original, preservando as dimensões da fonte.
- O cache anterior de WebP é invalidado automaticamente.
- Ao ampliar uma miniatura, o sistema procura a página principal e as páginas complementares importadas do mesmo PDF.
- A visualização permite trocar de página pelas setas da tela, teclas esquerda/direita, indicadores numéricos e gesto lateral no celular.
- Nenhuma alteração de banco de dados é necessária para esta versão.
