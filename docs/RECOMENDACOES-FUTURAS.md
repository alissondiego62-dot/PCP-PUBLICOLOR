# Recomendações para as próximas atualizações do Publicolor PCP

## Prioridade alta

### 1. Movimento de pedidos adaptado ao toque

O arrastar e soltar nativo funciona melhor no computador do que no celular. Recomenda-se adicionar em cada cartão uma ação `Mover`, abrindo seletores de setor e status. O drag-and-drop pode continuar disponível no desktop.

### 2. Dividir `app/page.tsx`

A página principal concentra autenticação, consultas, Dashboard, Kanban, Pedidos, Clientes, Relatórios, Usuários, Configurações e modais. Recomenda-se separar por recursos:

```text
features/dashboard/
features/kanban/
features/orders/
features/clients/
features/settings/
hooks/
services/
```

Isso reduz o risco de regressão e facilita testes e manutenção.

### 3. Consolidar os arquivos CSS

Existem várias camadas responsivas que sobrescrevem as mesmas classes. Recomenda-se migrar gradualmente para um arquivo por módulo e uma única camada de breakpoints. A ordem atual funciona, mas aumenta a possibilidade de regras conflitantes.

### 4. Testes automáticos de responsividade

Adicionar Playwright com capturas e testes funcionais nas larguras:

- 360 × 800;
- 390 × 844;
- 768 × 1024;
- 1024 × 768;
- 1366 × 768;
- 1920 × 1080.

Os testes devem validar navegação entre setores, abertura de OS, filtros, miniaturas, agenda e configurações.

## Prioridade média

### 5. Desempenho do Kanban

Quando o volume aumentar, carregar todos os cartões simultaneamente poderá ficar lento. Recomenda-se paginação por setor, carregamento incremental e virtualização dos cartões.

### 6. Atualizações em tempo real

Usar Supabase Realtime para receber mudanças de pedidos sem recarregar toda a base. As consultas devem atualizar somente o pedido alterado.

### 7. Miniaturas otimizadas

Manter o PNG original no Google Drive e gerar uma versão WebP reduzida para o Kanban. Isso reduz consumo de internet em celulares e acelera a abertura dos setores.

### 8. Histórico e diagnóstico de integrações

Criar um painel com últimas sincronizações do Google Drive, falhas de upload, arquivos sem OP e tempo médio de processamento dos lotes.

## Evolução futura

### 9. PWA com leitura offline controlada

Uma versão posterior pode armazenar uma cópia somente leitura dos pedidos vistos recentemente. Alterações offline exigem fila de sincronização, resolução de conflitos e auditoria; não devem ser implementadas sem essas proteções.

### 10. Versionamento visível

Exibir a versão do sistema e o commit no rodapé das Configurações. Isso facilita identificar se a Vercel publicou o código mais recente.

### 11. Observabilidade

Adicionar registro central de erros do frontend e das APIs, com contexto da OP, rota, usuário e integração afetada, sem registrar tokens ou credenciais.

### 12. Ambientes separados

Manter produção e homologação com projetos Supabase e Vercel distintos. Toda migration deve ser validada na homologação antes de chegar ao banco principal.
