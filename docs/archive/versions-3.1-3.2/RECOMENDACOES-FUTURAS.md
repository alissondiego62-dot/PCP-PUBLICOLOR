# Próximas recomendações após o Publicolor PCP 3.1.0

## Itens concluídos nesta versão

- movimento de pedidos adaptado ao toque;
- divisão das principais telas em `features/`;
- CSS responsivo consolidado;
- testes Playwright nas seis resoluções definidas;
- Supabase Realtime incremental;
- miniaturas WebP com original preservado no Google Drive;
- painel de diagnóstico das integrações;
- PWA com leitura offline controlada;
- versão e commit visíveis;
- observabilidade central;
- modelos para produção e homologação separadas.

## Prioridade alta seguinte

### 1. Virtualização dos cartões

Quando o volume por setor crescer, renderizar apenas os cartões visíveis. Isso reduz memória e tempo de montagem do Kanban.

### 2. Separar os modais e comandos restantes de `app/page.tsx`

A divisão principal foi feita, mas autenticação, detalhes da OS e comandos de escrita ainda estão no orquestrador. A próxima etapa deve criar:

```text
features/auth/
features/order-details/
features/installations/
hooks/usePcpData.ts
services/orders.ts
services/clients.ts
```

### 3. Fila de processamento para lotes grandes

Uploads extensos de ZIP e geração em massa de miniaturas devem usar uma fila no servidor, com retomada, progresso persistente e reprocessamento de falhas.

### 4. Alertas de observabilidade

Definir limites para notificação: falhas repetidas no Drive, erros de miniatura, Realtime desconectado por longo período e aumento de erros em 24 horas.

## Prioridade média

### 5. Política de retenção

Remover automaticamente eventos de observabilidade antigos e WebPs órfãos, mantendo um período acordado com a administração.

### 6. Tipos do banco gerados automaticamente

Gerar os tipos TypeScript do Supabase no CI e impedir merge quando os tipos estiverem desatualizados em relação às migrations.

### 7. Testes visuais com baseline

Além dos testes funcionais, armazenar capturas aprovadas e detectar alterações inesperadas em Dashboard, Kanban, agenda, OS e Configurações.

### 8. Homologação com dados fictícios representativos

Manter um conjunto de pedidos, subpedidos, arquivos e instalações sem dados reais de clientes para os testes automatizados.
