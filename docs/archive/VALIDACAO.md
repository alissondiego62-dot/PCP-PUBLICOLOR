# Validação

Antes do deploy:

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm build
```

Depois do deploy:

1. abra Dashboard e confirme que não existem botões de criação/importação;
2. abra Produção · Kanban e confirme a mesma regra;
3. abra Pedidos e teste `Importar PDF` e `Novo pedido`;
4. abra Configurações e execute `Verificar pendências` em miniaturas;
5. valide Dashboard, Produção e Pedidos em 1440 px, 1024 px, 768 px, 430 px e 360 px;
6. execute o SQL e confira os três totais exibidos no final.
