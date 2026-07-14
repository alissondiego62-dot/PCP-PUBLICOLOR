# Miniaturas de PDF no Google Drive

- Cada página importada é enviada para a pasta `04 - DOCUMENTOS` do pedido correspondente.
- O mesmo arquivo PNG é exibido como miniatura no Kanban e no detalhe da OS.
- O arquivo binário não é salvo no Supabase Storage; o banco mantém somente o identificador do arquivo no Drive.
- A miniatura do Kanban ocupa toda a largura superior do cartão.
- Não é necessária migração SQL para esta versão.
