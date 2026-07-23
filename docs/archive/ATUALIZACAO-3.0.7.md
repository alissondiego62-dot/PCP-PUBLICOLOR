# Publicolor 3.0.7 — Kanban móvel e instalação na tela inicial

## Kanban em celular e tablet

O Kanban deixa de empilhar todos os setores verticalmente em telas menores. Até 1100 px, os setores ficam em uma faixa horizontal com:

- uma coluna de setor por vez no celular;
- prévia parcial do próximo setor em tablets;
- rolagem lateral com encaixe automático em cada setor;
- setas de setor anterior e próximo;
- nome do setor atual e posição no fluxo;
- indicadores clicáveis para acessar qualquer setor;
- manutenção da rolagem vertical normal da página e dos cartões.

A navegação foi implementada em `app/page.tsx` e consolidada em `app/kanban-mobile.css`, carregado por último para neutralizar regras antigas de acordeão e empilhamento.

## Aplicativo na tela inicial

O sistema agora possui estrutura de Progressive Web App:

- `public/manifest.webmanifest`;
- ícones 192 px, 512 px, maskable e Apple Touch Icon;
- `public/service-worker.js`;
- página de indisponibilidade de conexão;
- aviso de instalação em celular e tablet;
- instrução específica para Safari no iPhone e iPad;
- modo standalone e suporte às áreas seguras do aparelho.

O PCP continua dependendo de conexão para dados do Supabase e arquivos do Google Drive. A camada offline serve apenas uma página informativa; não grava alterações localmente.

## Banco de dados

Esta atualização não altera tabelas, migrations, funções, políticas ou dados do Supabase. Nenhum SQL precisa ser executado.
