# Responsividade — Agenda e Concluídos

## Agenda de instalação

- Cards passam para uma coluna em notebooks e tablets.
- Em telas largas, dois cards são exibidos por linha.
- Formulário de agendamento passa para baixo do conteúdo quando falta largura.
- Em celular, data, informações e formulário ficam empilhados sem corte.
- Indicadores superiores viram uma faixa horizontal rolável no celular.
- Botões de agendamento e remoção ocupam a largura disponível.

## Pedidos concluídos

- A tabela permanece tabular em desktop largo.
- Em tablets e notebooks estreitos, cada pedido vira um card estruturado.
- Em celular, informações e ações ficam empilhadas.
- Rótulos OP, setor final e entrega são exibidos no modo card.
- Os botões Ver Histórico e Reabrir Produção mantêm largura e enquadramento consistentes.

## Validação

Executado:

```bash
tsc --noEmit
```

Resultado: sem erros TypeScript.
