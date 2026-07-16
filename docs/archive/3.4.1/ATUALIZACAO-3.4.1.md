# Publicolor PCP 3.4.1 — Materiais editáveis e Agenda responsiva

## Objetivo

Esta versão corrige a exibição cortada na aba **Materiais** da ordem de serviço e na **Agenda**, além de unificar a edição dos materiais entre a OS e a página **Atividades e Compras**.

## Materiais da OS

A listagem deixou de depender de uma tabela larga fixa. O comportamento agora é:

- desktop: linha organizada por material, disponibilidade, compra e ações;
- notebook e tablet: cada material vira um cartão em duas colunas;
- celular: cartão em uma única coluna, sem rolagem horizontal obrigatória;
- textos longos, observações e medidas quebram linha sem ocultar conteúdo;
- ações usam ícones de compra, edição e exclusão.

O botão de edição abre um editor completo com:

- nome do material;
- quantidade;
- unidade;
- largura ou medida opcional;
- situação de uso: planejado, reservado ou consumido;
- disponibilidade;
- status da compra;
- observação do material;
- preço unitário estimado;
- preço unitário efetivo;
- quantidade comprada;
- quantidade recebida;
- número e data do pedido;
- número da nota fiscal;
- links de comprovante e nota fiscal;
- observação do recebimento.

## Sincronização entre OS e Atividades e Compras

`order_materials` permanece como fonte principal. Portanto, uma alteração realizada no editor completo:

1. atualiza o material da OS;
2. atualiza a atividade vinculada quando o status da compra for alterado;
3. atualiza as telas por Realtime;
4. preserva o histórico gerado pelos gatilhos do banco.

Na página **Atividades e Compras**, o ícone de edição do item de compra abre o mesmo editor usado na OS. O antigo modal parcial de recebimento foi removido.

## Agenda

Foram corrigidas regras conflitantes que aplicavam `overflow: hidden` e restringiam a altura da lista diária.

A Agenda agora possui:

- quatro indicadores sem compressão;
- controles adaptativos para equipe, veículo, visualização e cópia do roteiro;
- calendário e painel do dia em duas colunas apenas quando há espaço real;
- empilhamento automático em notebooks menores e tablets;
- lista diária sem altura máxima que esconda pedidos;
- cartões com textos, horários, equipes e veículos quebrando linha;
- formulário de reagendamento em uma coluna no celular;
- semana e fila de programação com rolagem horizontal controlada.

## Banco conectado auditado

A leitura do banco conectado durante a preparação desta versão encontrou apenas as colunas antigas de `order_materials` e `activities`. As estruturas de disponibilidade, compra, preços, recebimento e exclusão lógica ainda não estavam presentes.

Por isso, o arquivo `SQL-ATUALIZACAO-PUBLICOLOR-3.4.1.sql` é cumulativo e obrigatório para usar o editor completo.

## Banco de dados

A versão 3.4.1 não cria uma estrutura diferente da 3.4.0. O SQL 3.4.1 repete o pacote cumulativo porque o banco conectado ainda não havia recebido essa atualização.

Execute primeiro em homologação e depois em produção.
