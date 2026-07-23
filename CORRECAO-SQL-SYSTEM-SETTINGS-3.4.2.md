# Correção SQL — Publicolor PCP 3.4.2

## Erro corrigido

`ERROR: 42P01: relation public.system_settings does not exist`

A etapa final da atualização tentava registrar `database_release` antes de criar a tabela `public.system_settings`.

## Procedimento

1. Não execute somente a linha que falhou.
2. Execute novamente o arquivo cumulativo corrigido `SQL-ATUALIZACAO-PUBLICOLOR-3.4.2.sql`.
3. Depois execute `SQL-VALIDAR-PUBLICOLOR-3.4.2.sql`.

As etapas anteriores já confirmadas por `COMMIT` permanecem aplicadas. A etapa 3.4.2 que apresentou o erro foi revertida automaticamente pelo PostgreSQL e será reaplicada de forma idempotente pelo arquivo corrigido.
