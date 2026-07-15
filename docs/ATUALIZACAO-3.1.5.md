# Publicolor PCP 3.1.5

## Objetivo

Reduzir a altura e a poluição visual da aba Atividades, acelerar o lançamento de várias tarefas e eliminar o botão manual de salvamento de preços.

## Atividades compactas

- Atividade principal com título, progresso, prazo, total, status e ações na mesma faixa sempre que a largura permitir.
- Subatividades de compra com produto, quantidade, unidade, preço, subtotal, status e ações em uma linha no desktop.
- Layout adaptativo em duas ou mais faixas no tablet e celular, sem cortar campos.
- Descrições longas aparecem resumidas e continuam disponíveis no título do elemento.
- Ações de copiar, adicionar, editar, excluir e identificar itens gerenciados pela OS usam ícones com descrições acessíveis.

## Cópia de produtos

O botão da atividade principal copia somente uma linha por produto:

```text
Tinta União dos Oceanos — 1 L
Tinta Azul Esplendoroso — 60 ml
```

Não são incluídos cliente, OP, nome da atividade, status, prazo ou preços.

Cada subatividade também possui um botão próprio, que copia somente aquele produto e sua quantidade.

## Salvamento automático de preços

Quantidade, unidade e preço unitário são persistidos automaticamente:

- 850 ms após o usuário parar de digitar;
- ao sair do campo;
- ao pressionar Enter.

O subtotal e o total da atividade principal são atualizados imediatamente enquanto o usuário digita. Um indicador discreto mostra estado neutro, salvando, salvo ou erro.

A tecla Enter navega da quantidade para a unidade, da unidade para o preço e do preço para o próximo produto.

## Cadastro contínuo

Ao criar atividade ou subatividade:

1. digite o título;
2. pressione Enter;
3. o item é salvo;
4. o título e a descrição são limpos;
5. o cursor retorna ao título para cadastrar o próximo item.

Grupo, tipo, prazo, prioridade, status e responsável permanecem preenchidos durante a sequência. O botão **Salvar e fechar** encerra o cadastro.

## Banco de dados

Não há alteração de tabelas, políticas, funções, gatilhos ou migrations nesta versão. A versão 3.1.4 deve estar instalada no banco.
