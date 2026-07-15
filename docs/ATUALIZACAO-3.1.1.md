# Publicolor PCP 3.1.1 — desempenho das miniaturas

## Problema corrigido

A versão anterior carregava todas as miniaturas de todos os pedidos logo após abrir ou atualizar a página. Cada imagem fazia uma requisição autenticada à Vercel, consultava o pedido e baixava o WebP do Supabase. Quando o WebP ainda não existia, também era necessário baixar o PNG do Google Drive e convertê-lo.

## Alterações

- carregamento somente dos cartões visíveis ou próximos da área visível;
- máximo de quatro downloads simultâneos;
- cache local consultado antes da rede;
- cache separado por usuário do sistema;
- URL de cache versionada pelo vínculo da miniatura, evitando imagem antiga após substituição;
- servidor redireciona o navegador para o CDN do Supabase em vez de retransmitir o arquivo pela Vercel;
- WebP com qualidade e esforço de conversão ajustados;
- miniaturas anteriores são mantidas enquanto os dados do pedido não mudarem;
- alteração em tempo real invalida somente a miniatura do pedido afetado;
- novo painel em Configurações para pré-gerar todos os WebPs e limpar o cache local.

## Uso recomendado após o deploy

1. Entre como administrador.
2. Abra **Configurações**.
3. No cartão **Otimizar carregamento das miniaturas**, clique em **Otimizar todas**.
4. Mantenha a página aberta até concluir.
5. Acesse o Kanban. Somente o setor visível e os cartões próximos serão carregados.

## Banco de dados

Nenhuma migration ou SQL é necessário nesta atualização.
