# Publicolor PCP 3.5.0 Revisado

Esta versão foi refeita a partir da base estável 3.4.6. O fluxo anterior da versão 3.5.0 não foi usado como base automática.

## Fluxo operacional

`Produção → Produção concluída → Agendamento obrigatório → Instalação`

- **Produção concluída** fica imediatamente antes de **Instalação** na migração inicial.
- Os dois setores não exibem faixas de status no Kanban.
- O banco mantém tecnicamente o status `waiting` para preservar compatibilidade com pedidos e relatórios antigos.
- Todo pedido ativo que estava em Instalação é transferido para Produção concluída durante a migração.
- Datas antigas são preservadas apenas como referência, mas o horário precisa ser confirmado novamente na Agenda.

## Configurações do Kanban

Em `Configurações → Kanban`, usuários com permissão operacional podem:

- criar setores comuns;
- editar nome, cor, limite WIP e propriedades;
- ativar ou inativar setores;
- reorganizar a posição;
- excluir setores sem qualquer pedido vinculado;
- definir se o setor utiliza status;
- definir exigência de agendamento e movimentação manual.

Setores com pedidos ativos não podem ser inativados. Setores especiais não podem ser excluídos nem perder seu tipo interno.

## Agenda

A página da Agenda possui o painel **Pendentes de agendamento**. Ele exibe todos os pedidos ativos em Produção concluída.

Ao confirmar data e hora:

1. o agendamento é salvo;
2. o horário é marcado como confirmado;
3. o pedido é movido para Instalação;
4. o evento aparece no calendário;
5. o histórico registra a operação.

O mesmo formulário é aberto ao arrastar, mover individualmente ou mover uma pilha para Instalação. Em pilhas, a mesma data e hora pode ser aplicada aos itens selecionados.

## Cancelamento

Cancelar um agendamento devolve o pedido para Produção concluída e o recoloca em Pendentes de agendamento. Não é permitido manter pedido ativo em Instalação sem data e hora confirmadas.

## Banco de dados

O arquivo `SQL-ATUALIZACAO-PUBLICOLOR-3.5.0-REVISADO.sql` é cumulativo e inclui a base corrigida 3.4.2 e a migração desta versão.

A migração cria:

- propriedades de configuração nos setores;
- identificação interna dos setores especiais;
- políticas RLS para gerenciamento de setores;
- trigger de integridade do fluxo;
- RPC atômica para agendar um pedido ou uma pilha;
- RPC administrativa para reordenar setores.

Nenhuma credencial de serviço é exposta no navegador. Alterações administrativas de setores passam por rota de servidor e auditoria.
