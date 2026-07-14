# Sincronização integral dos arquivos da OS

O botão **Atualizar arquivos** passa a refletir os arquivos que existem atualmente nas pastas do Google Drive vinculadas à ordem.

## Regra

- Arquivo existente no Drive e ainda não vinculado: cria o vínculo na OS.
- Arquivo existente e alterado: atualiza os metadados na OS.
- Arquivo removido somente da OS, mas ainda existente no Drive: restaura o vínculo e volta a exibi-lo.
- Arquivo excluído do Google Drive: não pode ser restaurado pela sincronização.

A restauração registra no histórico o usuário do Publicolor que executou a sincronização, data, hora e nome do arquivo.
