# Publicolor PCP 3.4.0 — Reforma completa

## Escopo

A versão 3.4.0 consolida em uma única entrega a reforma estrutural, visual e operacional do sistema. O Dashboard permanece como página inicial. Não foi criado módulo de fornecedores nem de cotações.

O status legado **Aguardando orçamento** foi mantido no fluxo de compras para compatibilidade com os registros existentes, mas não existem cadastro de fornecedor, comparação de propostas ou tabela de cotações nesta versão.

## Navegação e páginas independentes

Foram criadas rotas explícitas:

- `/dashboard`
- `/producao`
- `/pedidos`
- `/concluidos`
- `/agenda`
- `/atividades-compras`
- `/clientes`
- `/usuarios`
- `/configuracoes`

A atualização do navegador preserva a página atual. Busca e filtros de Pedidos e Produção são mantidos por página e refletidos na URL. O Dashboard continua sendo a rota padrão após o login.

Os módulos de página são carregados sob demanda com `React.lazy` e `Suspense`. O shell compartilhado mantém autenticação, menu, busca global, central de pendências e abertura da OS.

## Dashboard operacional

O Dashboard foi reformulado para substituir a antiga página de Relatórios. Inclui:

- pedidos ativos;
- produção em andamento;
- pedidos atrasados;
- produção prevista para o dia;
- OS aguardando materiais;
- compras abertas e vencidas;
- materiais sem preço;
- instalações e entregas do dia;
- pedidos bloqueados ou pausados;
- prioridades operacionais;
- capacidade por setor;
- fluxo dos últimos sete dias;
- próximas instalações;
- histórico operacional recente.

Os totais de compras e materiais são calculados por uma função resumida do banco, evitando transferir todas as linhas para o navegador.

## Produção e Kanban

- agrupamento de pedidos por setor e status calculado uma única vez;
- modo compacto e detalhado;
- limite de capacidade por setor;
- alerta de pedido parado;
- tempo no setor;
- seletor rápido de setor;
- navegação horizontal em celular e tablet;
- carregamento progressivo das miniaturas;
- comportamento de carregamento configurável para Wi-Fi, sempre ou somente itens visíveis.

## Pedidos e concluídos

### Pedidos ativos

- filtros rápidos;
- paginação;
- seleção múltipla;
- alteração em lote de responsável e prioridade;
- exportação CSV;
- filtros preservados na URL e na sessão da página.

### Pedidos concluídos

- consulta própria e paginada no banco;
- períodos de 90 dias, ano ou todos;
- filtros por responsável, setor e pesquisa;
- exportação CSV;
- atualização em tempo real para retirar pedidos reabertos da lista.

## Agenda

A Agenda agora possui visualizações mensal, semanal e diária, além de:

- fila de compromissos sem horário confirmado;
- filtros por equipe e veículo;
- capacidade diária configurável;
- aviso de conflito de equipe ou veículo;
- identificação de atraso;
- cópia do roteiro do dia;
- diferenciação operacional entre programação e conclusão.

## Atividades e Compras

A página foi consolidada como **Atividades e Compras**, com as abas:

- Atividades;
- Compras;
- Finalizadas.

Inclui:

- atividades e subatividades recolhíveis;
- linhas compactas;
- propagação opcional de status para as subatividades;
- salvamento automático de quantidade, unidade e valores;
- cópia da lista ou de um item;
- cadastro contínuo pelo Enter;
- edição do nome do material diretamente na atividade;
- sincronização do nome com o material dentro da OS;
- visualização rápida da OS vinculada;
- exclusão lógica;
- paginação das finalizadas;
- atualização incremental em tempo real;
- registro de preço estimado e preço efetivo;
- quantidade comprada e recebida;
- recebimento parcial;
- número e data do pedido de compra;
- número da nota fiscal;
- links de documento e nota;
- observação de recebimento.

Não existem fornecedores ou cotações.

## Clientes

- cálculo otimizado dos pedidos por cliente;
- paginação;
- filtros de ativos, inativos e todos;
- alerta de possível duplicidade;
- atalhos de WhatsApp, e-mail e mapa;
- resumo de pedidos ativos, atrasados e concluídos.

## Usuários

- pesquisa e filtros por função e situação;
- papéis padronizados: Administrador, Gerente, Produção e Visualizador;
- último acesso;
- situação do convite;
- reenviar ou cancelar convite;
- ativar ou inativar conta;
- alteração de função auditada;
- matriz visual de permissões.

## Configurações

A página foi dividida em abas carregadas somente quando abertas:

- Geral;
- Operação;
- Integrações;
- Dados;
- Diagnóstico;
- Infraestrutura.

Foram incluídas configurações para:

- prazo padrão de compras;
- responsável padrão de compras;
- capacidade diária da Agenda;
- capacidade por setor;
- estratégia de carregamento das miniaturas.

A Infraestrutura exige confirmação digitada antes de exibir ações avançadas. Também foram incluídos saúde do sistema, auditoria administrativa e diagnóstico das integrações.

## Ordem de serviço

As abas da OS são carregadas sob demanda. Abrir o Resumo não dispara consultas de histórico, comentários, arquivos, materiais e checklist ao mesmo tempo.

Atividades vinculadas possuem acesso rápido à OS. Subatividades de materiais abrem diretamente a aba Materiais.

## Banco de dados e segurança

O SQL cumulativo da versão 3.4.0 inclui as estruturas anteriores de Materiais e Compras e acrescenta:

- capacidade por setor;
- tempo de entrada no setor;
- presença e situação de convite dos usuários;
- exclusão lógica de atividades e materiais;
- campos operacionais de compra e recebimento;
- configurações operacionais;
- auditoria administrativa;
- fila de integrações;
- eventos resumidos do Dashboard;
- índices de paginação e consultas operacionais;
- funções atômicas para status e renomeação de material;
- políticas RLS;
- publicação Realtime somente das entidades necessárias.

As funções expostas foram limitadas aos papéis necessários. A atualização do próprio último acesso é feita por função específica, sem conceder edição direta de permissões.

## Integrações e observabilidade

- correlação de erros por operação;
- rota, tentativa, duração e OP vinculada;
- fila de reconciliação do Google Drive;
- trava contra reconciliações duplicadas da mesma OS;
- liberação de jobs interrompidos há mais de duas horas;
- diagnóstico de uploads, arquivos sem OP, jobs ativos e falhas;
- nova tentativa manual controlada;
- preservação do fluxo existente de pastas, arquivos e miniaturas.

## PWA

- cache versionado para 3.4.0;
- detecção de nova versão;
- botão para atualizar;
- retorno à mesma rota após a atualização;
- Dashboard como rota inicial;
- rotas principais incluídas no cache de navegação.

## Observação de implantação

O banco conectado auditado ainda não possuía integralmente as estruturas de Materiais e Compras. Por isso, o SQL 3.4.0 é cumulativo e deve ser aplicado antes do código, primeiro em homologação e depois em produção.
