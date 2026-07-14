# Remover da OS ou excluir do Google Drive

A aba Arquivos dos pedidos possui duas ações administrativas distintas:

- **Remover da OS:** oculta o arquivo somente naquele pedido. O conteúdo permanece intacto no Google Drive. O vínculo é mantido internamente como removido para impedir que o botão **Atualizar arquivos** faça o arquivo reaparecer.
- **Excluir do Drive:** exclui definitivamente o arquivo pela Google Drive API e, em seguida, remove o vínculo da ordem.

As duas ações registram no histórico da ordem o usuário do Publicolor, a data e a hora. A exclusão definitiva exige confirmação explícita e fica disponível somente quando o registro possui `drive_file_id`.

## Implantação

Execute `20260721010000_order_file_remove_delete_modes.sql` no Supabase antes de publicar o código atualizado.
