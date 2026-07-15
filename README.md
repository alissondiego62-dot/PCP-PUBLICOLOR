# Publicolor PCP 3.1.5

Sistema web de planejamento e controle de produção da Publicolor, com Dashboard, Kanban, Pedidos, agenda de instalação/entrega, clientes, atividades, arquivos, histórico e integrações com Supabase e Google Drive.

## Requisitos

- Node.js 24.x
- pnpm 11.12.0
- dois ambientes separados para produção e homologação
- Supabase configurado em cada ambiente
- Vercel configurada em cada ambiente
- Google Drive OAuth configurado para os arquivos das OPs

## Instalação local

```bash
corepack enable
pnpm install --frozen-lockfile
cp .env.example .env.local
pnpm dev
```

## Validação

```bash
pnpm validate
```

Os testes responsivos usam Playwright Python e as credenciais do banco de homologação:

```bash
python -m pip install -r requirements-e2e.txt
python -m playwright install chromium
pnpm test:e2e
```

## Atualização do banco

A versão **3.1.5 não exige novo SQL**. Ela utiliza a estrutura de atividades, materiais e preços instalada pela versão 3.1.4.

Para uma instalação que ainda esteja na versão 3.1.2 ou anterior, execute primeiro o arquivo cumulativo:

```text
SQL-ATUALIZACAO-PUBLICOLOR-3.1.4.sql
```

Em bancos que já utilizam a versão 3.1.4, publique somente o código da versão 3.1.5.

## Entregas da versão 3.1.0

- botão **Mover** nos cartões em celular e tablet;
- navegação horizontal setor por setor no Kanban;
- módulos separados para Dashboard, Kanban, Pedidos, Relatórios, Usuários e Configurações;
- CSS responsivo consolidado;
- testes Playwright em seis resoluções;
- atualizações incrementais com Supabase Realtime;
- PNG original no Drive e WebP otimizado no Kanban;
- diagnóstico de integrações e observabilidade;
- PWA com cópia offline somente leitura por usuário;
- versão, commit, branch e ambiente visíveis em Configurações;
- modelos e procedimento para produção e homologação separadas.

## Regras de interface

- **Dashboard:** consulta e indicadores.
- **Produção · Kanban:** acompanhamento e movimentação; sem criação ou importação.
- **Pedidos:** local exclusivo para `Importar PDF` e `Nova ordem`.
- **Configurações:** integrações, importação de miniaturas por ZIP, diagnóstico e versão publicada.

Leia antes de publicar:

- `COMO-ATUALIZAR-PUBLICOLOR-3.1.5.txt`
- `COMO-ATUALIZAR-PUBLICOLOR-3.1.4.txt` — referência da versão anterior
- `COMO-ATUALIZAR-PUBLICOLOR-3.1.3.txt` — referência da versão anterior
- `COMO-ATUALIZAR-PUBLICOLOR-3.1.2.txt` — referência da versão anterior
- `COMO-ATUALIZAR-PUBLICOLOR-3.1.1.txt` — referência da versão anterior
- `COMO-ATUALIZAR-PUBLICOLOR-3.1.0.txt` — somente referência da versão anterior
- `docs/AMBIENTES-E-DEPLOY.md`
- `docs/ARQUITETURA-3.1.md`
- `docs/RELATORIO-IMPLEMENTACAO-3.1.0.md`

## Publicolor PCP 3.1.1

O carregamento das miniaturas foi alterado para modo progressivo: somente cartões visíveis ou próximos da tela solicitam imagens. O sistema usa cache local por usuário, limita downloads simultâneos e entrega os WebPs diretamente pelo CDN do Supabase. Em **Configurações**, o administrador pode pré-gerar todas as miniaturas otimizadas.

Consulte `docs/ATUALIZACAO-3.1.1.md` e `COMO-ATUALIZAR-PUBLICOLOR-3.1.1.txt`.


## Publicolor PCP 3.1.2

Depois de priorizar as miniaturas visíveis e próximas, o Kanban passa a preparar automaticamente as demais em segundo plano, com duas vagas de baixa prioridade e capacidade reservada para solicitações do usuário. Os indicadores superiores foram reorganizados, tornados clicáveis e adaptados para desktop, tablet e celular.

Consulte `docs/ATUALIZACAO-3.1.2.md` e `COMO-ATUALIZAR-PUBLICOLOR-3.1.2.txt`.


## Publicolor PCP 3.1.3

A área de materiais da OS foi simplificada e passou a criar atividades automáticas no grupo Compras para itens não disponíveis. A conclusão da compra atualiza o material como disponível na OS.

Consulte `docs/ATUALIZACAO-3.1.3.md` e `COMO-ATUALIZAR-PUBLICOLOR-3.1.3.txt`.

## Publicolor PCP 3.1.4

As compras agora são consolidadas em uma atividade principal por OP, com materiais organizados como subatividades recolhíveis. A atividade principal possui propagação opcional de status, botão para copiar a lista de produtos e total calculado a partir da quantidade e do preço unitário de cada item.

Consulte `docs/ATUALIZACAO-3.1.4.md` e `COMO-ATUALIZAR-PUBLICOLOR-3.1.4.txt`.


## Publicolor PCP 3.1.5

A aba Atividades recebeu linhas compactas para atividades principais e subatividades, ações por ícones, cópia individual ou em lote somente de produtos e quantidades, preços com salvamento automático e cadastro contínuo pelo Enter.

Consulte `docs/ATUALIZACAO-3.1.5.md` e `COMO-ATUALIZAR-PUBLICOLOR-3.1.5.txt`.
