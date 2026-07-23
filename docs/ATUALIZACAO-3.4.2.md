# Publicolor PCP 3.4.2 — Correções consolidadas

A versão 3.4.2 reúne as correções solicitadas depois da 3.4.1, preservando Dashboard, Kanban móvel, Agenda, Materiais, Compras, PWA, Google Drive e Supabase.

## Materiais da OS

- formulário de inclusão responsivo, sem botão ou campos ultrapassando o modal;
- ações separadas em um rodapé próprio;
- edição completa do material pela OS e por Atividades e Compras;
- nome, quantidade, unidade, medida, uso, disponibilidade, observação, status da compra, preços, quantidades compradas e recebidas, pedido, nota fiscal, links e recebimento;
- sincronização do mesmo registro entre a OS e a atividade vinculada;
- proteção para não apagar valores de compra quando o nível do usuário não possui permissão para editá-los.

## Atividades e Compras

Todo item pertencente ao grupo `Compras` passa a seguir o padrão de compra, inclusive atividades manuais e registros antigos:

- atividade principal consolidada;
- produtos como subatividades;
- quantidade, unidade, preço unitário e subtotal;
- total ou total parcial na atividade principal;
- salvamento automático;
- cópia da lista e cópia de item individual;
- subatividades recolhíveis;
- confirmação para propagar status;
- edição completa do material vinculado;
- cadastro contínuo pelo Enter.

## Produção

- removido o botão `Salvar produção`;
- setor e status são atualizados assim que forem selecionados;
- indicador `Salvando`, `Atualizado` ou erro;
- restauração do valor anterior em caso de falha;
- finalização continua separada e exige confirmação.

## Cliente no Resumo

- o cliente é selecionado pelo `client_id` do pedido;
- pedidos antigos são conciliados por nome somente quando existe correspondência única;
- `Cliente sem cadastro` aparece apenas quando não existe vínculo válido;
- `client_id` e `client_name` permanecem sincronizados.

## Kanban

Os cartões agora possuem ações compactas por ícones:

- histórico;
- comentários com contador;
- mover setor;
- alterar status;
- finalizar.

No celular, os seletores de setor e status abrem como painel inferior. As mudanças são salvas automaticamente e registradas no histórico.

## Pedidos

O filtro rápido `Bloqueados` foi substituído por `Pausados`. O filtro usa exclusivamente `orders.status = 'paused'`, inclusive para pedidos principais e subpedidos.

## Usuários e acessos

- layout responsivo em desktop, tablet e celular;
- edição de nome, cargo exibido, nível, situação e observação administrativa;
- último acesso real;
- histórico de acessos com início, última atividade, encerramento, dispositivo, navegador e duração aproximada;
- convite, reenvio, cancelamento, ativação e inativação;
- proteção do último administrador ativo;
- impedimento de alteração do próprio nível, situação ou permissões individuais.

## Permissões de usuários

Nova aba em Configurações para Administrador, Gerente, Operador e Visualizador.

A matriz cobre Dashboard, Produção, Pedidos, Materiais, Atividades e Compras, Agenda, Clientes, Usuários e Configurações. Também existem exceções individuais por usuário.

As regras são aplicadas em três camadas:

1. navegação e ações da interface;
2. APIs administrativas;
3. políticas RLS e validações do banco.

O Administrador mantém acesso total e somente administradores podem alterar a matriz ou exceções individuais.

## Banco de dados

O SQL 3.4.2 é cumulativo e inclui todas as estruturas anteriores necessárias. Ele acrescenta:

- cargo e observação administrativa no perfil;
- quantidade, unidade e preço para compras manuais;
- padronização automática do grupo Compras;
- catálogo e matriz de permissões;
- exceções individuais;
- histórico de acesso;
- suporte ao nível Gerente;
- RLS restritiva para operações configuráveis;
- funções de acesso com implementação privilegiada em schema privado;
- reparo seguro de clientes antigos com correspondência única.

Execute primeiro em homologação e somente depois em produção.
