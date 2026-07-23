# Revisão final e próximas sugestões — Publicolor PCP 3.4.2

## Verificações realizadas

- responsividade do formulário de materiais;
- edição completa e sincronização dos materiais;
- padronização do grupo Compras;
- salvamento automático da Produção;
- cliente vinculado no Resumo;
- ações rápidas do Kanban;
- filtro Pausados;
- usuários, acessos e permissões;
- imports, sintaxe TypeScript/TSX, JSON, CSS e estrutura do ZIP;
- consistência entre SQL cumulativo e migration 3.4.2.

## Recomendações para versões futuras

### 1. Testes visuais automatizados

Executar Playwright em 360, 390, 768, 1024, 1366 e 1920 px, comparando capturas de Materiais, Agenda, Kanban, Atividades e Usuários.

### 2. Catálogo simples de materiais

Padronizar nomes e unidades sem implantar um estoque quantitativo completo. Isso reduzirá variações como `Metalom 20x20`, `Metalon 20 × 20` e `METALOM 20/20`.

### 3. Sessões administrativas

Adicionar encerramento remoto das sessões de um usuário. A ação deve revogar sessões no Supabase Auth e registrar auditoria.

### 4. Permissões por operação atômica

A versão 3.4.2 já aplica RLS por módulo. Uma evolução posterior pode mover atualizações críticas de pedidos e materiais para RPCs específicas, limitando também as colunas alteráveis por operação.

### 5. Agenda com duração real

Adicionar horário inicial, duração prevista e tempo de deslocamento. Assim, conflitos de equipe e veículo deixam de depender apenas do horário de início.

### 6. Diagnóstico de migrations

Comparar automaticamente a versão do código com `system_settings.database_release` e bloquear recursos cuja migration ainda não foi aplicada.

### 7. Auditoria de acesso avançada

Manter apenas informações necessárias, definir prazo de retenção e permitir limpeza administrativa dos registros antigos.
