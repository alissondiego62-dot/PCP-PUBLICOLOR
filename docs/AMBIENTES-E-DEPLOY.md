# Ambientes do Publicolor PCP

## Produção

- Aplicação: `https://pcp-publicolor.vercel.app`
- Variável: `NEXT_PUBLIC_APP_ENV=production`
- Projeto Supabase exclusivo de produção.
- Branch Git vinculada: `main`.

## Homologação

- Projeto Vercel separado, por exemplo `pcp-publicolor-homolog`.
- Projeto Supabase separado, sem reutilizar as chaves de produção.
- Variável: `NEXT_PUBLIC_APP_ENV=homologation`.
- Branch Git sugerida: `develop`.

## Regras

1. Nunca usar `SUPABASE_SERVICE_ROLE_KEY` de produção em Preview ou homologação.
2. Executar migrations primeiro na homologação.
3. Rodar `pnpm validate`, `pnpm test:e2e` e verificar miniaturas/Drive antes de promover para `main`.
4. Configurar no GitHub os segredos `E2E_EMAIL`, `E2E_PASSWORD`, `E2E_SUPABASE_URL`, `E2E_SUPABASE_PUBLISHABLE_KEY` e `E2E_SUPABASE_SERVICE_ROLE_KEY` apontando somente para homologação.
5. Rodar `pnpm validate:environment` em cada ambiente para detectar URL ou banco incorreto.

## Vercel

Crie dois projetos Vercel apontando para o mesmo repositório:

- `pcp-publicolor`: branch `main`, domínio oficial, variáveis de produção.
- `pcp-publicolor-homolog`: branch `develop`, domínio de homologação, variáveis do Supabase de homologação.

A versão, o ambiente, a branch e o commit publicados aparecem em Configurações.
