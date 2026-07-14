# Correção do botão Atualizar arquivos

## Alterações

- O botão exibe estado de consulta, sucesso ou erro dentro da própria aba Arquivos.
- A resposta da API é lida mesmo quando a Vercel retorna texto em vez de JSON.
- A sincronização usa os IDs das pastas já registrados nos arquivos da ordem e nas sessões de upload.
- A consulta continua funcional quando o cliente, a OP ou o nome da pasta foi alterado depois da criação no Drive.
- Arquivos encontrados são vinculados ou atualizados e a lista da OS é recarregada sem atualizar a página inteira.
- Erros de permissão orientam a reconexão da conta Google.
- Cabeçalho, botões e campos de upload foram reorganizados para desktop, tablet e celular.

## Implantação

Não exige migração SQL. Publique o projeto e faça uma atualização forçada do navegador.
