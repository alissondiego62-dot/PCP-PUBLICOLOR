# Correção de build 3.0.1

## Erro corrigido

A Vercel encontrava um arquivo antigo `postcss.config.mjs` que carregava
`@tailwindcss/postcss`, apesar de o projeto não utilizar Tailwind e de o pacote
não estar mais listado no `package.json`.

## Ajuste aplicado

O arquivo foi mantido com uma configuração PostCSS neutra:

```js
export default { plugins: {} };
```

O projeto continua usando os arquivos CSS nativos importados em `app/layout.tsx`.
Não existe alteração no banco de dados nem necessidade de executar um novo SQL
para esta correção.
