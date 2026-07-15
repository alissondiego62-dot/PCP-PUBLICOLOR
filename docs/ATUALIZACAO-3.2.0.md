# Publicolor PCP 3.2.0

## Dashboard

O Dashboard continua sendo a página inicial e foi reformulado para concentrar o que antes ficava disperso em indicadores e relatórios:

- pedidos ativos;
- em produção;
- aguardando materiais;
- atrasados;
- produção com prazo hoje;
- instalações do dia;
- bloqueados e pausados;
- fila de atenção;
- compras por status;
- total estimado e itens sem preço;
- carga por setor;
- próximas instalações;
- movimentações recentes.

Os cartões principais direcionam para o Kanban, Agenda ou Atividades e Compras já no fluxo operacional correto.

## Navegação independente

Cada módulo possui URL própria. O navegador passa a preservar a página após atualização, permite copiar links internos e respeita voltar/avançar.

O código continua usando um shell compartilhado para autenticação, menu e modal de OS, mas os conteúdos já estavam separados em componentes por recurso e agora recebem rotas persistentes.

## Atividades e Compras

- Novo nome no menu e cabeçalho.
- Abas Atividades, Compras e Finalizadas.
- Nome do material editável na linha da subatividade.
- Salvamento automático após pausa, ao sair do campo ou pressionar Enter.
- Alteração sincronizada com `order_materials.material_name` e com a OS.
- Botão de olho para abrir a OS vinculada diretamente na aba Materiais.
- Atividade principal abre a OS no Resumo.

## Banco e desempenho

A migration 3.2.0 adiciona índices parciais e compostos para as consultas mais frequentes de:

- pedidos ativos por setor/status/prazo;
- agenda de instalação;
- atividades abertas e hierarquia;
- compras por OP/status;
- histórico recente;
- arquivos ativos da OS.

Também cria a função `rename_linked_order_material(uuid,text)` como `SECURITY INVOKER`, preservando as políticas RLS existentes.

## PWA

- `start_url` alterado para `/dashboard`.
- caches do Service Worker atualizados para 3.2.0.
- navegações independentes ficam disponíveis no cache depois do primeiro acesso online.
