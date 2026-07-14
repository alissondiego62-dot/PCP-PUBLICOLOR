# Correção do upload do Google Drive

## Sintoma corrigido

O arquivo era salvo corretamente no Google Drive, mas o navegador mostrava a mensagem de envio interrompido e o vínculo não aparecia na ordem de serviço.

## Causa

A sessão retomável era criada no servidor e concluída diretamente pelo navegador. Em algumas respostas finais, o Google salvava o arquivo, mas o navegador não conseguia ler a confirmação por CORS. Como o ID do arquivo não chegava ao Publicolor, a linha correspondente não era criada em `order_files`.

## Alterações

- a origem do Publicolor é enviada ao criar a sessão retomável;
- cada upload recebe um identificador único em `appProperties`;
- se a resposta final for perdida, o servidor procura o arquivo já salvo e conclui o vínculo;
- foi adicionado o botão **Sincronizar arquivos** para recuperar arquivos enviados anteriormente e ainda não vinculados;
- o processo ficou idempotente, evitando registrar o mesmo arquivo duas vezes;
- qualquer usuário ativo e autenticado pode anexar e baixar arquivos;
- somente o administrador pode remover vínculos;
- o download pode ser feito pelo Publicolor sem compartilhar a pasta inteira do Drive.

## Instalação

1. Execute `supabase/migrations/20260719010000_drive_upload_recovery_and_file_access.sql` no SQL Editor do Supabase.
2. Publique o código atualizado.
3. Abra a ordem que apresentou o problema.
4. Na aba Arquivos, clique em **Sincronizar arquivos**.
5. O arquivo já existente no Drive deverá ser vinculado e exibido na ordem.
