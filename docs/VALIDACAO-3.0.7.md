# Validação técnica — Publicolor 3.0.7

## Verificações executadas

- Sintaxe de todos os arquivos TypeScript e TSX por transpilação do compilador TypeScript.
- Sintaxe do service worker com `node --check`.
- Leitura e validação de `package.json` e `manifest.webmanifest`.
- Conferência do equilíbrio de chaves em todos os arquivos CSS.
- Conferência dos imports locais e aliases `@/`.
- Conferência das dimensões dos ícones PWA: 180, 192 e 512 px.
- Conferência da ordem dos CSS: `kanban-mobile.css` e `pwa.css` são carregados depois das camadas responsivas antigas.
- Conferência de que não houve alteração nas migrations ou no schema do Supabase.

## Matriz de comportamento prevista

| Faixa | Kanban |
|---|---|
| Acima de 1100 px | Mantém múltiplos setores visíveis e barras de rolagem do desktop |
| 701 a 1100 px | Setores em faixa horizontal, largura máxima de 520 px, prévia do próximo setor e navegação por setas |
| Até 700 px | Um setor ocupa a largura disponível, com encaixe obrigatório ao deslizar |
| Até 430 px | Cartões, miniaturas e títulos compactados para telas pequenas |

## Limitação da validação

O build integral com `pnpm validate` não foi executado neste ambiente porque o acesso ao registro npm não estava disponível. O ZIP preserva o lockfile e não adiciona dependências, portanto a Vercel deve utilizar a mesma instalação do projeto 3.0.6.
