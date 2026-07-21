# Publicolor PCP 3.5.1

Sistema operacional de PCP da Publicolor para pedidos, produção, agenda, compras, clientes, usuários e integrações.

## Fluxo principal desta versão

`Produção → Produção concluída → Agendamento obrigatório → Instalação`

- Configuração dos setores em **Configurações → Kanban**.
- Criação, edição, reordenação, ativação, inativação e exclusão segura de setores.
- **Produção concluída** e **Instalação** sem faixas de status.
- Painel **Pendentes de agendamento** na Agenda.
- Data e hora obrigatórias antes da entrada em Instalação.
- Sincronização entre Kanban, Agenda e histórico.
- Agendamento individual ou coletivo de pilhas.
- Cancelamento devolve o pedido para Produção concluída.

## Banco de dados

Aplique em homologação:

1. `SQL-ATUALIZACAO-PUBLICOLOR-3.5.0-REVISADO.sql`
2. `SQL-VALIDAR-PUBLICOLOR-3.5.0-REVISADO.sql`

O SQL cumulativo inclui as correções anteriores necessárias. Consulte `COMO-ATUALIZAR-PUBLICOLOR-3.5.0-REVISADO.txt`.

## Validação local

```powershell
corepack enable
pnpm install --frozen-lockfile
pnpm validate
```

Requisitos: Node.js 24.x e pnpm 11.12.0.
