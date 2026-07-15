# Correção do Supabase Preview — Publicolor 3.0.3

## Causa

O banco já possui o tipo `public.user_role`, mas o histórico remoto não registra todas as migrations que formaram o schema. A Preview tenta executar novamente a migration inicial e recebe SQLSTATE 42710.

## O que foi corrigido no projeto

0. O reparador do histórico usa somente as colunas comuns `version`, `statements` e `name`. Isso evita o erro `column created_by does not exist` em bancos e Preview Branches com formato antigo da tabela de migrations.
1. `0001_initial.sql` foi substituída por `20260712190000_initial.sql`, usando timestamp válido.
2. A migration inicial agora é transacional e repetível (`IF NOT EXISTS`, remoção controlada de triggers/policies e `ON CONFLICT`).
3. Foram adicionados os três arquivos históricos que já constam no projeto remoto, evitando divergência entre local e remoto.
4. O estado temporário `supabase/.temp` foi removido do Git e adicionado ao `.gitignore`.
5. A migration `20260729010000_publicolor_3_performance_and_thumbnail_views.sql` continua pendente para ser aplicada normalmente depois da reparação.

## Procedimento obrigatório — uma vez

1. Faça backup do banco.
2. No SQL Editor do projeto **Publicolor PCP**, execute `SQL-REPARAR-HISTORICO-SUPABASE.sql`.
3. Confirme que o script termina sem erro e lista as versões registradas.
4. Substitua o repositório pelo conteúdo deste ZIP e envie o commit.
5. No Supabase, exclua a Preview Branch que falhou, caso ela continue registrada.
6. Reexecute o check ou faça um novo commit vazio para criar uma Preview limpa.

## Alternativa via CLI

Use `scripts/repair-supabase-migration-history.ps1`. O comando oficial `migration repair` altera somente a tabela de histórico; não executa o SQL antigo.

## Não fazer

- Não remover o tipo `user_role`.
- Não executar novamente todas as migrations antigas no banco de produção.
- Não marcar `20260729010000` como aplicada antes de ela ser realmente executada.
