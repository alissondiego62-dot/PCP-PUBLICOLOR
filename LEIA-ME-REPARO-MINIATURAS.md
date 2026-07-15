# Reparo único das miniaturas após a migração

## O que foi identificado no projeto

O Kanban já entende miniaturas do Google Drive quando `orders.main_image_path` possui este formato:

```text
gdrive-pdf:ID_DO_ARQUIVO
```

Os PNGs que aparecem na aba **Arquivos** já estão vinculados na tabela `order_files`, com o respectivo `drive_file_id`. Portanto, não é necessário reenviar, copiar ou baixar os arquivos para o Supabase Storage.

A ferramenta temporária apenas:

1. lê os pedidos e subpedidos;
2. lê os PNGs visíveis da aba Arquivos;
3. escolhe o PNG marcado como miniatura ou o único PNG de Documentos;
4. atualiza `orders.main_image_path`;
5. registra a correção no histórico da OS.

Pedidos com vários PNGs sem identificação clara são separados para revisão e não são modificados automaticamente.

## Arquivos do pacote

```text
PCP-PUBLICOLOR/
├── app/api/admin/repair-drive-thumbnails/route.ts
└── components/PlatformAdministrationSettings.tsx
```

## Como instalar no GitHub

Copie a pasta `PCP-PUBLICOLOR` deste pacote sobre a raiz atual do projeto, mantendo os caminhos.

No GitHub, os arquivos finais devem ficar em:

```text
app/api/admin/repair-drive-thumbnails/route.ts
components/PlatformAdministrationSettings.tsx
```

Não altere `app/page.tsx`, `package.json`, o banco ou as configurações do Google Drive.

Depois faça o commit e aguarde o deployment da Vercel.

## Como executar

1. Entre no sistema com um usuário administrador.
2. Abra **Configurações**.
3. Localize **Restaurar miniaturas após a migração**.
4. Clique em **Analisar miniaturas**.
5. Confira os totais apresentados.
6. Clique em **Restaurar X miniatura(s)**.
7. Confirme a operação.
8. Após a mensagem de conclusão, pressione `Ctrl + F5`.

## Regras de seleção do PNG

A ordem de prioridade é:

1. PNG cuja observação informa que ele é uma miniatura ou página importada do PDF;
2. único PNG da categoria `document`;
3. PNG de Documentos com nome como miniatura, capa, página, OS ou OP;
4. único PNG existente no pedido.

Quando há mais de um candidato sem identificação segura, o pedido aparece em **Revisão manual** e não é alterado.

## Segurança

- A rota aceita apenas usuário com função `admin`.
- A execução exige a confirmação `REPARAR MINIATURAS` enviada pela tela.
- Nenhum arquivo é excluído ou reenviado.
- A atualização é repetível: pedidos já corrigidos não são atualizados novamente.
- Os PNGs continuam dentro da aba Arquivos e no Google Drive.

## Depois da execução

A ferramenta pode permanecer no projeto sem repetir alterações, pois é idempotente. Para remover completamente a função temporária:

1. exclua `app/api/admin/repair-drive-thumbnails/route.ts`;
2. restaure `components/PlatformAdministrationSettings.tsx` pela versão anterior no histórico do GitHub.
