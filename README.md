# Publicolor PCP 3.5.6

Sistema operacional de PCP da Publicolor para pedidos, produção, agenda, compras, clientes, usuários e integrações.

## Alterações da versão 3.5.6

- Cada página de PDF é convertida em PNG dentro de uma folha A4 em paisagem, centralizada e sem recorte.
- O importador sempre anexa o PDF original ao Google Drive de cada pedido criado.
- Páginas complementares podem ser escolhidas como miniatura principal do pedido.
- A página originalmente principal é preservada na galeria quando outra página é escolhida como miniatura.
- O cadastro manual de pedido ganhou um campo para anexar o PDF original diretamente ao Google Drive.



## Alterações da versão 3.5.5

- Visualização ampliada com enquadramento integral da imagem, sem cortar topo, rodapé ou laterais.
- Impressão A4 recalculada para manter a imagem inteira dentro da área física da folha.
- Todas as páginas complementares continuam sendo impressas, uma por folha.
- Zoom inicial fixado em 100%, com rolagem apenas quando houver ampliação.

## Alterações da versão 3.5.4

- Miniaturas completas, sem corte, em todos os cartões do Kanban.
- Botão para imprimir a imagem principal e todas as páginas complementares.
- Impressão de pilhas reúne as imagens de todos os subpedidos selecionados.

## Correções da versão 3.5.3

- Renovação automática e reconexão orientada do Google Drive quando o token for expirado ou revogado.
- Miniaturas em PNG na resolução original, sem geração de WebP reduzido.
- Galeria lateral na imagem ampliada para páginas complementares do mesmo pedido.

## Fluxo principal desta versão

`Produção → Produção concluída → Agendamento obrigatório → Instalação`

- Configuração dos setores em **Configurações → Kanban**.
- Criação, edição, reordenação, ativação, inativação e exclusão segura de setores.
- **Produção concluída** e **Instalação** sem faixas de status.
- Painel **Pendentes de agendamento** na Agenda.
- Data e hora obrigatórias antes da entrada em Instalação.
- Sincronização entre Kanban, Agenda e histórico.
- Agendamento individual ou coletivo de pilhas.
- Cancelamento devolve o pedido para Produção concluída.

## Banco de dados

Aplique em homologação:

1. `SQL-ATUALIZACAO-PUBLICOLOR-3.5.0-REVISADO.sql`
2. `SQL-VALIDAR-PUBLICOLOR-3.5.0-REVISADO.sql`

O SQL cumulativo inclui as correções anteriores necessárias. Consulte `COMO-ATUALIZAR-PUBLICOLOR-3.5.0-REVISADO.txt`.

## Validação local

```powershell
corepack enable
pnpm install --frozen-lockfile
pnpm validate
```

Requisitos: Node.js 24.x e pnpm 11.12.0.
