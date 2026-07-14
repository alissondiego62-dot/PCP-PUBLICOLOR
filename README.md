# Publicolor 2.0 — Materiais dos clientes | modelo atualizado

Pacote reconstruído para a versão de produção mais recente localizada em
**14/07/2026**, commit **5136fc8**.

## O que mudou em relação ao pacote anterior

O pacote anterior considerava um cadastro de cliente em modal. A versão atual
usa uma página completa com as classes `client-detail-view`,
`client-detail-header`, `client-profile-grid` e `client-orders-group`.

Esta revisão:

- adiciona a aba **Materiais** no modelo atual;
- preserva os dados e os pedidos existentes;
- reutiliza a identidade roxa e amarela publicada;
- diferencia materiais permanentes do cliente dos materiais de cada OS;
- não duplica a importação da página TINTAS;
- funciona em desktop e celular;
- mantém o cadastro, edição, busca, filtro e remoção lógica;
- mantém a quantidade de LEDs por palavra, posição e letra.

## Estado do banco verificado

- 151 materiais da página TINTAS;
- 67 clientes com materiais;
- 151 registros ativos;
- A ROMANA, MOVA PACE FITNESS, GOIANA EXPRESSO, GAVIÃO e VEREDAS conferidos;
- tabelas `client_materials` e `client_material_import_issues` preservadas.

## Uso recomendado

1. Copie os arquivos de `src`.
2. Siga `docs/INTEGRACAO_MODELO_ATUAL.md`.
3. Não execute novamente a importação no banco de produção.
4. Mantenha o SQL no repositório para instalações novas ou recuperação.
5. Rode o build e teste os clientes A ROMANA e MOVA PACE FITNESS.
6. Publique no Vercel.

## Banco novo ou ambiente de teste

Para uma instalação sem essas tabelas, execute:

```text
supabase/migrations/20260714223000_client_materials_tintas.sql
```

O SQL é idempotente e utiliza `source_key` para impedir duplicação.

## Limitação de publicação direta

A implantação atual está ligada a um repositório GitHub privado. O conector
disponível nesta sessão não recebeu acesso ao conteúdo do repositório, portanto
o pacote foi preparado contra os arquivos publicados e o esquema real do
Supabase, sem efetuar commit ou deploy automático.
