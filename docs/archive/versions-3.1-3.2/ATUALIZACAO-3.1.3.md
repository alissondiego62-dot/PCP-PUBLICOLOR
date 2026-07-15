# Publicolor PCP 3.1.3

## Materiais simplificados

A aba **Materiais** da OS passa a trabalhar somente com:

- nome do material;
- disponibilidade: `Disponível` ou `Não disponível`;
- observação opcional.

Os campos antigos de quantidade, unidade, largura e consumo permanecem no banco apenas para compatibilidade histórica, mas não aparecem no novo formulário.

## Atividade automática de Compras

Ao cadastrar ou alterar um material para **Não disponível**, o banco:

1. localiza ou cria o grupo `Compras`;
2. cria ou reabre uma atividade vinculada ao material e à OS;
3. atribui a atividade ao usuário responsável pela ação;
4. define prazo de 24 horas;
5. inicia o status em `Pendente`.

## Ordem dos status

1. Pendente;
2. Aguardando orçamento;
3. Aguardando separação;
4. Aguardando entrega;
5. Finalizada.

Ao chegar a **Finalizada**, a atividade é marcada como concluída, fica oculta por padrão e o material passa automaticamente para **Disponível** na OS.

Ao reabrir a atividade ou alterar seu status para uma etapa anterior, o material volta para **Não disponível** e recebe novo prazo de 24 horas quando a reabertura parte de uma atividade finalizada.

## Proteções

- uma única atividade automática por material;
- edição do nome ou da observação atualiza a atividade vinculada;
- exclusão do material cancela a atividade vinculada após confirmação;
- atividades automáticas não podem ser excluídas diretamente na tela de Atividades;
- o grupo que contém compras automáticas não pode ser excluído enquanto houver vínculos;
- atualização em tempo real da lista de materiais da OS.

## Banco

Migration:

```text
supabase/migrations/20260731010000_simplified_materials_and_purchase_workflow.sql
```

SQL avulso:

```text
SQL-ATUALIZACAO-PUBLICOLOR-3.1.3.sql
```
