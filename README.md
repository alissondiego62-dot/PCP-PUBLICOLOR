# Publicolor PCP 3.4.0

Sistema operacional de PCP para pedidos, produção, agenda, atividades, compras, clientes, usuários, arquivos e integrações da Publicolor.

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

Cada página possui rota própria e mantém a navegação após atualizar o navegador ou o PWA.

## Destaques da versão 3.4.0

- Dashboard operacional no lugar da página de Relatórios;
- consultas e Realtime limitados por página;
- páginas carregadas sob demanda;
- Kanban com capacidade, tempo no setor e modos compacto/detalhado;
- Pedidos com paginação, ações em lote e CSV;
- Concluídos paginados no banco;
- Agenda mensal, semanal e diária com conflitos e capacidade;
- Atividades e Compras compactas, com valores, recebimento parcial e OS vinculada;
- edição do material na atividade sincronizada com a OS;
- Clientes, Usuários e Configurações reformulados;
- busca global e central de pendências;
- OS com abas carregadas sob demanda;
- PWA versionado e atualização preservando a rota;
- auditoria, observabilidade e fila de integrações;
- SQL cumulativo para atualizar bancos que ainda não possuem Materiais e Compras.

## Escopo excluído

A versão 3.4.0 não inclui fornecedores ou cotações. O status legado **Aguardando orçamento** continua disponível apenas como etapa do fluxo.

## Atualização

Consulte:

- `COMO-ATUALIZAR-PUBLICOLOR-3.4.0.txt`
- `SQL-ATUALIZACAO-PUBLICOLOR-3.4.0.sql`
- `SQL-VALIDAR-PUBLICOLOR-3.4.0.sql`
- `docs/ATUALIZACAO-3.4.0.md`
- `docs/AUDITORIA-FINAL-3.4.0.md`

## Validação

```powershell
corepack enable
pnpm install --frozen-lockfile
pnpm validate
```

O projeto exige Node.js 24.x e pnpm 11.12.0.
