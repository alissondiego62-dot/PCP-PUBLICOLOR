# Atividades — grupos, atividades e subatividades

## Nome escolhido

A página recebeu o nome **Atividades** por abranger tarefas operacionais, lembretes com prazo e rotinas da equipe sem limitar o módulo a um único uso.

## Estrutura

- Grupo de atividades
  - Atividade principal
    - Subatividade

O sistema permite um nível de subatividade para manter a visualização simples.

## Conclusão

- Cada atividade e subatividade possui checkbox.
- Ao concluir, o item fica oculto dentro do grupo.
- O botão **Mostrar concluídas** restaura temporariamente a visualização.
- Itens concluídos podem ser reabertos.

## Campos

- Título
- Descrição
- Prazo
- Prioridade
- Responsável
- Grupo
- Atividade principal, quando for subatividade

## Acesso

- Todos os usuários autenticados podem visualizar.
- Administradores e operadores podem criar, editar, concluir, reabrir e excluir.

## Implantação

Execute a migração:

`20260726010000_activity_management.sql`

Depois publique o projeto atualizado.
