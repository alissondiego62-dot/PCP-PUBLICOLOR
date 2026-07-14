# Arquitetura — PCP Publicolor

## Visão geral

Aplicação web React/TypeScript executada com Vinext/Vite, hospedada na Vercel e integrada ao Supabase.

## Organização principal

```text
app/
  page.tsx                 Orquestra estado, autenticação e telas principais
  layout.tsx               Metadados e carregamento global de estilos
  *.css                    Camadas visuais existentes
components/
  CompletedOrdersView.tsx  Tela isolada de pedidos concluídos
lib/
  supabase.ts              Cliente Supabase
  pcp-types.ts             Tipos de domínio
  pcp-config.ts            Rótulos, menus e mapeamentos
  pcp-formatters.ts        Datas, status e formatação
supabase/
  migrations/              Evolução versionada do banco
public/                     Marca e recursos estáticos
```

## Fluxo de dados

1. O usuário autentica pelo Supabase Auth.
2. `app/page.tsx` carrega setores, pedidos, comentários e perfis.
3. As alterações são persistidas no Supabase e confirmadas pela resposta do banco.
4. O canal Realtime atualiza pedidos, comentários e perfis.
5. Arquivos operacionais são referenciados por links do Google Drive; miniaturas permanecem no Storage.

## Regras estruturais adotadas

- Tipos do domínio ficam em `lib/pcp-types.ts`.
- Configurações estáticas ficam em `lib/pcp-config.ts`.
- Formatação de data/status fica em `lib/pcp-formatters.ts`.
- Telas novas devem ser criadas em `components/`, evitando aumentar `app/page.tsx`.
- Toda alteração de banco deve possuir migration SQL.
- `.env.local`, builds e dependências não entram no Git/ZIP.

## Próximas extrações recomendadas

1. `InstallationAgendaView`
2. `KanbanBoard`
3. `OrderWorkspaceModal`
4. `DashboardView`
5. hooks: `useOrders`, `useProfiles`, `useRealtimeSync`

A extração deve ser gradual para não alterar as regras de negócio em produção.
