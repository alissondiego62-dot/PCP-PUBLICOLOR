# Sincronização total da pasta da OP

## Regra

O botão **Atualizar arquivos** percorre recursivamente a pasta da OP ou do subpedido no Google Drive e vincula todos os arquivos encontrados à ordem.

- Não filtra por extensão ou tipo MIME.
- Inclui arquivos na raiz da OP e em qualquer nível de subpasta.
- Inclui documentos Google, PDFs, imagens, vídeos, ZIP, arquivos Adobe/Corel, atalhos e demais formatos apresentados pela API do Drive.
- Arquivos removidos apenas da OS voltam a aparecer se continuarem no Drive.
- Arquivos excluídos do Drive não retornam.
- Pastas não são exibidas como arquivos; o conteúdo interno delas é sincronizado.

## Correções técnicas

- Removido o limite anterior de profundidade da árvore de pastas.
- A raiz da OP é recuperada a partir das pastas de categoria já vinculadas, mesmo quando cliente, OP ou pasta foram renomeados.
- A rota devolve a lista final sincronizada e a interface usa essa resposta imediatamente, evitando contagem visual desatualizada.
- Links de tipos nativos do Google são normalizados para uma URL genérica do Drive quando necessário.
