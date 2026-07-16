# Publicolor PCP 3.4.4 — Pilhas visíveis e ações coletivas

## Objetivo

Melhorar a leitura dos cartões empilhados no Kanban e permitir ações coletivas mesmo quando a pilha estiver recolhida.

## Layout da pilha

- efeito visual de três cartões sobrepostos;
- selo `PILHA` no cartão principal;
- contador de itens, atrasos, pausas e comentários;
- prazo mais próximo e responsável consolidado;
- barra permanente com ícones de ações coletivas;
- comportamento responsivo em desktop, tablet e celular.

## Ações disponíveis na pilha recolhida

- expandir ou recolher;
- consultar históricos;
- consultar comentários;
- mover setor;
- alterar status;
- finalizar pedidos.

Histórico e comentários abrem uma lista dos subpedidos para que o usuário escolha a OS que deseja consultar.

## Alterações coletivas

Mover setor, alterar status e finalizar abrem um painel com todos os subpedidos selecionados por padrão. O usuário pode:

- manter todos selecionados;
- desmarcar itens específicos;
- selecionar todos novamente;
- limpar a seleção.

As alterações são aplicadas em uma única operação. Em caso de erro, os cartões retornam ao estado anterior.

## Permissões

- mover e alterar status exigem permissão de movimentação da produção;
- finalizar exige permissão específica de finalização;
- ações não autorizadas não são exibidas.

## Banco de dados

A versão 3.4.4 não altera tabelas, colunas, funções, políticas ou migrations. O SQL cumulativo corrigido da versão 3.4.2 continua válido.
