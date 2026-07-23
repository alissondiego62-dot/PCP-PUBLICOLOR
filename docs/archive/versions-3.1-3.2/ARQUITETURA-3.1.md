# Arquitetura do Publicolor PCP 3.1

```text
app/page.tsx                 Orquestra autenticação, dados e modais principais
features/dashboard/          Dashboard operacional
features/kanban/             Kanban e movimento adaptado ao toque
features/orders/             Lista agrupada de OPs e subpedidos
features/reports/            Relatórios
features/users/              Gestão de usuários
features/settings/           Configurações e integrações
hooks/                       Online/offline, Realtime e observabilidade
services/                    Miniaturas e telemetria do navegador
lib/server/                  Integrações e credenciais somente no servidor
app/api/                     APIs autenticadas
supabase/migrations/         Evolução versionada do banco
```

## Fluxos principais

### Dados em tempo real

As alterações em pedidos, comentários, clientes, setores e perfis chegam pelo Supabase Realtime. O frontend altera somente o registro afetado, sem recarregar toda a base.

### Modo offline controlado

O IndexedDB mantém por até sete dias uma cópia por usuário de pedidos, setores, clientes e perfis. As miniaturas já vistas permanecem no Cache Storage. No modo offline, as ações de alteração ficam bloqueadas.

### Miniaturas

O PNG original permanece no Google Drive. A API autenticada gera WebP de até 520 × 420 px, armazena em `order-thumbnails/optimized` e remove versões WebP antigas da mesma OP.

### Observabilidade

Erros do frontend, falhas de API e eventos de integrações são gravados em `system_observability_events`. Tokens, senhas, chaves e cabeçalhos de autorização são filtrados antes do registro.

### Responsividade

A camada de breakpoints está consolidada em `app/responsive.css`. Regras específicas permanecem próximas de cada recurso em `features/*/*.css`.
