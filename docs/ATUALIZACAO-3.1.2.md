# Publicolor PCP 3.1.2

## Objetivo

Esta versão reúne duas melhorias na tela **Produção · Kanban**:

1. carregar primeiro as miniaturas visíveis e próximas e, quando essa prioridade terminar, preparar automaticamente todas as demais em segundo plano;
2. transformar os indicadores superiores em controles operacionais mais claros, responsivos e clicáveis.

## Miniaturas progressivas

A fila agora possui duas prioridades:

- **Foreground:** miniaturas visíveis, próximas da área visível ou abertas no modal;
- **Background:** demais miniaturas do Kanban.

Regras aplicadas:

- até quatro requisições simultâneas no total;
- no máximo duas requisições de segundo plano;
- sempre reserva capacidade para uma miniatura solicitada pelo usuário;
- aguarda a fila visível permanecer ociosa antes de iniciar o restante;
- usa o cache por usuário antes de solicitar a imagem novamente;
- prioriza, no segundo plano, os setores mais próximos do setor atual;
- interrompe a fila antiga ao sair do Kanban, trocar de usuário ou receber uma nova base de pedidos;
- mostra o andamento discretamente na barra de busca e filtros.

## Indicadores operacionais

A linha principal agora apresenta:

- Pedidos ativos;
- Em produção;
- Aguardando ação;
- Atrasados;
- Produção hoje;
- Instalações hoje;
- Bloqueados/pausados.

Os cartões são clicáveis. O clique aplica um filtro rápido ao Kanban. O indicador de instalações abre a agenda do dia.

A faixa complementar mostra:

- subpedidos ativos;
- pedidos sem responsável;
- pedidos sem prazo;
- instalações futuras;
- estado da atualização em tempo real.

## Responsividade

- Desktop: sete indicadores compactos em uma linha quando houver espaço.
- Notebook e tablet: rolagem lateral com encaixe.
- Celular: cartões largos, fáceis de tocar, com aproximadamente um cartão e parte do próximo visíveis.

## Banco de dados

Nenhuma migration ou alteração de schema é necessária nesta versão.
