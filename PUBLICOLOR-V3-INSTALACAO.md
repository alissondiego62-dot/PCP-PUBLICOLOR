# Publicolor PCP — Versões 3.0, 3.1 e 3.2

## Conteúdo da entrega

### 3.0 — Identidade e operação
- Identidade visual baseada na marca Publicolor (roxo e amarelo).
- Logo oficial na sidebar, login e favicon.
- Dashboard executivo com indicadores, distribuição por setor e próximas instalações.
- Sidebar e cabeçalho renovados.
- Kanban redesenhado, mantendo drag and drop, filtros e rolagem superior/inferior.
- Cards com acabamento visual renovado.

### 3.1 — Ordem de Serviço
- Modal ampliado e responsivo.
- Abas: Resumo, Produção, Instalação, Histórico e Comentários.
- Materiais, especificações e observações gerais.
- Controle rápido de início/pausa/finalização.
- Dados completos de instalação vinculados à OS.

### 3.2 — Agenda profissional de instalação
- Data e hora.
- Endereço.
- Equipe.
- Veículo.
- Status da instalação.
- Orientações de campo.
- Integração direta com a OS.

## Instalação obrigatória do banco

Antes de abrir a nova versão, execute no Supabase SQL Editor:

`supabase/migrations/20260713010000_publicolor_v3_order_and_installation.sql`

Sem essa migração, a consulta da tabela `orders` retornará erro por falta das novas colunas.

## Aplicação local

1. Faça backup da pasta atual.
2. Copie os arquivos desta entrega para o projeto.
3. Preserve o seu `.env.local`.
4. Execute:

```powershell
pnpm install
pnpm dev
```

## Publicação

Após testar:

1. Commit no GitHub Desktop.
2. Push origin.
3. A Vercel fará o deploy automaticamente.

## Arquivos principais alterados

- `app/page.tsx`
- `app/pcp-v2.css`
- `app/layout.tsx`
- `public/publicolor-logo.png`
- `supabase/migrations/20260713010000_publicolor_v3_order_and_installation.sql`
