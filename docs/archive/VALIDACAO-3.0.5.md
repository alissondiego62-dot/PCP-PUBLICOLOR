# Validação Publicolor 3.0.5

- Sintaxe TypeScript/TSX validada com TypeScript 5.8.3 nos arquivos alterados.
- `package.json` e `tsconfig.json` validados como JSON.
- Migration e SQL de atualização incluídos e idempotentes.
- O build completo não foi executado neste ambiente porque o registro npm não estava acessível para instalar o pnpm 11.12.0.

Antes do envio definitivo, o ambiente da Vercel executará `pnpm install` e `vite build` com as dependências registradas no lockfile.
