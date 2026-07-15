# Publicolor PCP 3.4.1

Sistema operacional de PCP para pedidos, produção, agenda, atividades, compras, clientes, usuários, arquivos e integrações da Publicolor.

## Correções da versão 3.4.1

- aba Materiais sem linhas ou ações cortadas;
- cartões adaptativos em notebook, tablet e celular;
- edição completa de todos os dados do material pela OS;
- o mesmo editor completo disponível em Atividades e Compras;
- sincronização do material com a atividade vinculada;
- ações compactas por ícones;
- Agenda sem altura máxima ocultando pedidos;
- indicadores, controles, calendário e cartões responsivos;
- mensagens claras quando o banco ainda não recebeu a migration cumulativa;
- cache PWA atualizado para 3.4.1.

## Páginas

- Dashboard — página inicial
- Produção — Kanban responsivo
- Pedidos
- Concluídos
- Agenda
- Atividades e Compras
- Clientes
- Usuários
- Configurações

## Banco de dados

O banco conectado auditado ainda apresenta a estrutura anterior de Materiais e Atividades. Para usar disponibilidade, preços, compra, recebimento e edição completa, execute:

- `SQL-ATUALIZACAO-PUBLICOLOR-3.4.1.sql`
- `SQL-VALIDAR-PUBLICOLOR-3.4.1.sql`

O SQL é cumulativo. Não execute depois dele os SQLs antigos separadamente.

## Documentação

- `COMO-ATUALIZAR-PUBLICOLOR-3.4.1.txt`
- `docs/ATUALIZACAO-3.4.1.md`
- `docs/REVISAO-E-SUGESTOES-3.4.1.md`
- `docs/AUDITORIA-FINAL-3.4.0.md`

## Validação

```powershell
corepack enable
pnpm install --frozen-lockfile
pnpm validate
```

O projeto exige Node.js 24.x e pnpm 11.12.0.
