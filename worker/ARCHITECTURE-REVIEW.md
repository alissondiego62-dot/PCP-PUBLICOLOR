# Revisão de arquitetura — PCP Publicolor

## Escopo desta revisão

A revisão foi feita sobre a versão atual enviada pelo usuário, preservando:

- autenticação Supabase;
- Kanban e drag and drop;
- agenda de instalação;
- Ordem de Serviço;
- materiais, checklist e links do Google Drive;
- histórico, comentários e reabertura de pedidos;
- identidade visual Publicolor;
- deploy Vercel/Nitro.

## Melhorias aplicadas

### 1. Domínio separado da interface

Os tipos, rótulos e funções de formatação deixaram de ficar dentro de `app/page.tsx`.

```text
app/domain/
├── constants.ts
├── formatters.ts
└── types.ts
```

Benefícios:

- tipos reutilizáveis;
- menos duplicação;
- menor risco ao alterar telas;
- regras de apresentação centralizadas.

### 2. Telas operacionais transformadas em componentes

Foram extraídos:

```text
app/components/
├── CompletedOrdersView.tsx
└── InstallationAgendaView.tsx
```

A tela de concluídos mantém os novos botões:

- `Ver Histórico` em cinza;
- `Reabrir Produção` em roxo Publicolor.

A agenda continua exibindo setor atual, equipe, data e horário.

### 3. Rolagem sincronizada isolada em hook

```text
app/hooks/useSynchronizedKanbanScroll.ts
```

A lógica da barra superior e inferior do Kanban não fica mais misturada ao componente principal.

### 4. Validação padronizada

Foram adicionados:

```text
pnpm typecheck
pnpm check
```

O arquivo `tsconfig.web.json` valida somente a aplicação web, sem misturar tipos de Deno, Cloudflare Worker e Edge Functions.

### 5. Gerenciador de pacotes definido

O projeto agora declara:

```json
"packageManager": "pnpm@11.12.0"
```

Isso reduz diferenças entre ambiente local e Vercel.

### 6. Pacote final higienizado

Foram removidos do ZIP final:

- `.env.local`;
- `node_modules`;
- `.vercel`;
- arquivos de build;
- `package-lock.json`;
- `tsconfig.tsbuildinfo`;
- arquivos temporários de validação.

## Validações executadas

- TypeScript da aplicação web: aprovado.
- ESLint: sem erros; restaram apenas avisos sobre uso de `<img>`.
- Compatibilidade dos novos componentes com os tipos atuais: aprovada.

## Pontos que ainda merecem evolução

### `app/page.tsx` continua grande

O arquivo foi reduzido e organizado, mas ainda concentra autenticação, carregamento, mutações e vários modais. A próxima refatoração recomendada é separar:

```text
app/components/auth/
app/components/kanban/
app/components/orders/
app/components/users/
app/services/
app/hooks/
```

### CSS possui camadas históricas

`globals.css`, `kanban-cards.css` e `pcp-v2.css` têm regras acumuladas de versões anteriores. O visual funciona, mas o próximo passo deve separar o CSS por módulo e remover sobreposições antigas.

### Acesso ao Supabase ainda está dentro da página

Consultas e mutações devem futuramente migrar para serviços como:

```text
app/services/orders.ts
app/services/installations.ts
app/services/users.ts
```

### Drizzle está instalado, mas pouco utilizado

O banco é controlado pelas migrations do Supabase. Deve-se decidir entre:

1. adotar Drizzle de forma completa; ou
2. remover Drizzle para reduzir dependências e complexidade.

### Testes funcionais

Ainda faltam testes para:

- reabrir pedido concluído;
- salvar instalação;
- movimentar pedido;
- aplicar filtros;
- permissões por função.

## Estrutura atual recomendada

```text
app/
├── components/
│   ├── CompletedOrdersView.tsx
│   └── InstallationAgendaView.tsx
├── domain/
│   ├── constants.ts
│   ├── formatters.ts
│   └── types.ts
├── hooks/
│   └── useSynchronizedKanbanScroll.ts
├── page.tsx
├── layout.tsx
└── *.css
```

Esta revisão priorizou uma refatoração segura, sem reescrever as regras de negócio nem alterar o banco de dados.
