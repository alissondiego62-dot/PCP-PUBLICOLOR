# Publicolor PCP 3.4.3

Sistema operacional de PCP para pedidos, produção, agenda, atividades, compras, clientes, usuários, arquivos e integrações da Publicolor.


## Pilhas de subpedidos no Kanban — 3.4.3

- Subpedidos da mesma OP são agrupados quando estão no mesmo setor e na mesma faixa de status.
- A pilha mostra quantidade de itens, prazo mais próximo, atrasos, pausas, responsável e comentários consolidados.
- Ao abrir a pilha, cada subpedido mantém suas ações individuais de histórico, comentários, setor, status e finalização.
- As pilhas sempre iniciam recolhidas após atualizar ou reabrir a página. O estado de expansão não é salvo no navegador nem no banco.
- Nenhuma alteração de banco de dados é necessária nesta versão.

## Destaques da versão

- formulário de materiais responsivo, sem campos ou botões cortados;
- edição completa e sincronizada dos materiais pela OS e por Atividades e Compras;
- todas as atividades do grupo Compras usando o mesmo padrão operacional;
- setor e status da Produção com salvamento automático;
- correção do cliente selecionado no Resumo da OS;
- ações do Kanban por ícones: histórico, comentários, mover, status e finalizar;
- filtro rápido `Pausados` na página de Pedidos;
- usuários responsivos, editáveis e com histórico de acesso;
- matriz de permissões para Administrador, Gerente, Operador e Visualizador;
- exceções individuais de permissão;
- auditoria de mudanças administrativas;
- cache PWA atualizado para 3.4.2.

## Páginas

- Dashboard — página inicial;
- Produção — Kanban responsivo;
- Pedidos;
- Concluídos;
- Agenda;
- Atividades e Compras;
- Clientes;
- Usuários;
- Configurações.

## Banco de dados

Aplique primeiro em homologação:

1. `SQL-ATUALIZACAO-PUBLICOLOR-3.4.2.sql`
2. `SQL-VALIDAR-PUBLICOLOR-3.4.2.sql`

O SQL é cumulativo. Não execute posteriormente os SQLs antigos separadamente.

## Documentação

- `COMO-ATUALIZAR-PUBLICOLOR-3.4.2.txt`
- `VALIDACAO-PUBLICOLOR-3.4.2.txt`
- `docs/ATUALIZACAO-3.4.2.md`
- `docs/REVISAO-E-SUGESTOES-3.4.2.md`
- `docs/AUDITORIA-FINAL-3.4.0.md`

## Validação local

```powershell
corepack enable
pnpm install --frozen-lockfile
pnpm validate
```

Requisitos: Node.js 24.x e pnpm 11.12.0.
## Correção SQL 3.4.2

O pacote inclui a criação idempotente de `public.system_settings` antes do registro `database_release`, corrigindo o erro 42P01 da atualização cumulativa.
