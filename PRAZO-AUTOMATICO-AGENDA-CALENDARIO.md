# Publicolor 2.0 — Prazo automático e agenda mensal

## Regra de datas

- No cadastro e na aba **Resumo**, o usuário informa somente a **data da instalação ou entrega**.
- O sistema calcula o **prazo interno de produção** como o dia útil imediatamente anterior.
- Sábados e domingos são ignorados no cálculo.
- Exemplo: instalação/entrega na segunda-feira → prazo de produção na sexta-feira anterior.
- Ao alterar ou reagendar a data, o prazo de produção é recalculado automaticamente.
- A aba **Produção** mantém somente **Setor atual** e **Status**. Prazo e prioridade ficam apenas no **Resumo**.

## Conversão dos pedidos existentes

A migração `20260717010000_automatic_deadline_and_month_calendar.sql` reorganiza os dados antigos:

1. A antiga data de prazo é preservada como data prevista da instalação/entrega.
2. O novo prazo de produção é calculado para o dia útil anterior.
3. Pedidos que já possuíam agendamento mantêm a data e têm o prazo sincronizado.
4. A regra também é aplicada no Supabase por trigger, evitando divergências em integrações ou versões antigas da interface.

## Agenda mensal

A página **Agenda de instalação/entrega** passou a ter:

- calendário completo do mês;
- marcação e quantidade de pedidos em cada dia;
- seleção de um dia para consultar as OPs;
- navegação para o mês anterior, próximo mês e mês atual;
- exibição de OP, cliente, serviço, prazo de produção, setor, responsável e equipe;
- definição ou alteração do horário diretamente no calendário;
- layout adaptável para desktop, tablet e celular.

## Implantação

1. Execute no SQL Editor do Supabase:
   `supabase/migrations/20260717010000_automatic_deadline_and_month_calendar.sql`
2. Somente depois publique o código atualizado.
3. Teste um pedido com instalação em uma segunda-feira e confirme que o prazo de produção foi definido para a sexta-feira anterior.

> O cálculo atual considera dias úteis de segunda a sexta-feira. Feriados não são descontados automaticamente enquanto não houver um calendário de feriados cadastrado no sistema.
