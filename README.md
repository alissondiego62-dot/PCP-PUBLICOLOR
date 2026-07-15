# Publicolor PCP 3.2.0

Sistema de planejamento e controle de produção da Publicolor.

## Destaques da versão

- Dashboard operacional reformulado e mantido como página inicial.
- URLs independentes para Dashboard, Kanban, Pedidos, Concluídos, Agenda, Atividades e Compras, Clientes, Usuários e Configurações.
- Atualizar o navegador mantém a página atual.
- Página **Relatórios** removida do menu; os principais indicadores foram incorporados ao Dashboard.
- Página **Atividades** renomeada para **Atividades e Compras**.
- Abas internas: Atividades, Compras e Finalizadas.
- Nome do material editável diretamente na atividade de compra, com sincronização para a OS.
- Botão rápido para abrir a OS vinculada pela atividade.
- Otimização de índices e consultas do Supabase.
- PWA iniciando no Dashboard e cache de navegação atualizado para a versão 3.2.0.

## Rotas

```text
/dashboard
/producao
/pedidos
/concluidos
/agenda
/atividades-compras
/clientes
/usuarios
/configuracoes
```

## Atualização do banco

Execute primeiro em homologação:

```text
SQL-ATUALIZACAO-PUBLICOLOR-3.2.0.sql
```

Depois valide:

```text
SQL-VALIDAR-PUBLICOLOR-3.2.0.sql
```

O SQL é cumulativo: inclui as estruturas de materiais, compras, hierarquia e preços das versões 3.1.3/3.1.4, além das otimizações da versão 3.2.0.

## Publicação

Preserve somente `.git` e `.env.local`, substitua os demais arquivos pelo conteúdo do ZIP e execute:

```powershell
corepack enable
pnpm install --frozen-lockfile
pnpm validate

git add -A
git commit -m "Publicolor 3.2.0: dashboard, rotas e otimizacoes"
git push
```

Consulte `COMO-ATUALIZAR-PUBLICOLOR-3.2.0.txt` e `docs/ATUALIZACAO-3.2.0.md`.
