# Arquivos das ordens no Google Drive

O módulo agora possui duas formas de vincular arquivos:

1. **Upload automático:** o sistema cria as pastas e envia os arquivos diretamente ao Google Drive conectado.
2. **Vínculo manual:** mantém a possibilidade de colar um link já existente do Drive ou Google Docs.

A configuração completa está documentada em:

```text
GOOGLE-DRIVE-INTEGRACAO-OAUTH.md
```

## Organização automática

```text
PUBLICOLOR - SISTEMA PCP
└── CLIENTES
    └── Nome do cliente
        └── OP 0000
            ├── 01 - ARTE
            ├── 02 - APROVAÇÃO
            ├── 03 - PRODUÇÃO
            ├── 04 - DOCUMENTOS
            ├── 05 - FOTOS
            ├── 06 - INSTALAÇÃO
            └── 07 - OUTROS
```

Para subpedidos, o sistema cria uma pasta intermediária com o número completo do subpedido.

## Banco de dados

Execute a migração:

```text
supabase/migrations/20260718010000_google_drive_oauth_integration.sql
```

A migração anterior `20260715010000_google_drive_links.sql` continua necessária porque contém as colunas do Drive na tabela `order_files`.
