# Auditoria técnica — Publicolor PCP 3.2.0

## Banco conectado analisado

A inspeção do projeto Supabase conectado mostrou:

- 51 pedidos;
- 51 arquivos vinculados;
- 64 registros de histórico;
- 2 grupos de atividades;
- 2 atividades;
- 0 materiais cadastrados no projeto inspecionado;
- RLS habilitado nas tabelas operacionais verificadas.

O histórico de migrations do projeto inspecionado estava atrás das migrations presentes no repositório e não continha as colunas de compras, preços e vínculos das versões 3.1.3/3.1.4. Por isso, a versão 3.2.0 inclui um SQL cumulativo.

> O site publicado pode estar apontando para outro ambiente Supabase. Antes da produção, confirme que as variáveis da Vercel apontam para o projeto correto.

## Melhorias aplicadas

- consultas do Dashboard separadas do carregamento das telas de produção;
- assinaturas Realtime do Dashboard removidas ao sair da página;
- rotas persistentes para evitar retorno ao Dashboard após atualização;
- índices focados em filtros ativos e registros não concluídos;
- edição de material por vínculo UUID, sem busca pelo texto;
- atualização sincronizada do título da atividade por trigger;
- nenhuma credencial ou token incluído no projeto.

## Recomendações posteriores

1. Confirmar e documentar os projetos de homologação e produção usados pela Vercel.
2. Migrar gradualmente o shell principal para providers e repositories por módulo.
3. Substituir Postgres Changes por Broadcast quando o volume de usuários e eventos crescer.
4. Criar testes de integração com banco de homologação para materiais, compras e reabertura.
5. Adicionar paginação server-side em concluídos, clientes e históricos acima de 500 registros.
6. Monitorar índices com `pg_stat_user_indexes` antes de remover índices antigos ou semelhantes.
7. Criar um painel de pendências do Google Drive com sessões interrompidas e arquivos órfãos.
