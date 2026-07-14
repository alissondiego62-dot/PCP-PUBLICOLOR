# Importação PDF — cliente automático e setor PCP

## Cliente

Ao confirmar a importação de um PDF, o sistema procura o cliente pelo nome lido no documento. Se não encontrar, cria um cadastro mínimo contendo somente o nome e vincula todos os pedidos/subpedidos importados.

A criação usa a função `public.ensure_client_by_name`, que normaliza espaços e acentos e bloqueia criações simultâneas do mesmo cliente.

## Setor PCP

O setor `PCP` passa a ser o primeiro setor ativo do Kanban. Pedidos importados por PDF entram nele por padrão com status `Aguardando`.

Status exclusivos do PCP:

- Aguardando
- Em transporte
- Aguardando cliente

Os demais setores mantêm:

- Aguardando
- Em andamento

## Instalação

Execute a migração:

`supabase/migrations/20260728010000_pdf_client_and_pcp_workflow.sql`
