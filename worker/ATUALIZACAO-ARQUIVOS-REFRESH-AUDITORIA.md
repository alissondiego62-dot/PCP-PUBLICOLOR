# Atualização de arquivos por pedido e auditoria

## Funcionalidades

- Botão **↻ Atualizar arquivos** na aba Arquivos de cada pedido.
- A consulta é limitada à pasta da OP ou do subpedido aberto.
- Arquivos adicionados diretamente no Google Drive são vinculados ao pedido.
- Arquivos alterados no Drive têm nome, tamanho, tipo, data e autor da última alteração sincronizados.
- Cada cartão identifica:
  - usuário do Publicolor que enviou ou vinculou;
  - usuário do Publicolor que executou a última sincronização;
  - usuário Google que realizou a última alteração no Drive, quando informado pela API.
- Upload, vínculo, sincronização, alteração e remoção são registrados no Histórico da ordem.

## Implantação

1. Execute `supabase/migrations/20260720010000_order_file_refresh_audit.sql` no Supabase.
2. Publique o código atualizado.
3. No Google Cloud, adicione o escopo `https://www.googleapis.com/auth/drive` em Data Access.
4. No Publicolor, abra Configurações → Google Drive e desconecte/reconecte a conta.

A reconexão é necessária porque o token antigo, limitado a `drive.file`, não consegue consultar com segurança todos os arquivos adicionados manualmente às pastas.
