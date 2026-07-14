# Integração Google Drive — OAuth e upload automático

## O que foi implementado

- Configuração restrita ao administrador em **Configurações → Integração com Google Drive**.
- E-mail Google esperado editável. O valor inicial é `alissondiego62@gmail.com`.
- Client ID e Client Secret OAuth editáveis pelo administrador.
- Client Secret, access token e refresh token cifrados antes de serem gravados.
- Conectar, reconectar, testar e desconectar a conta Google.
- Criação automática da pasta principal e da estrutura por cliente, OP, subpedido e categoria.
- Envio de vários arquivos pela aba **Arquivos** do pedido.
- Upload retomável em blocos diretamente do navegador para o Google Drive.
- Vínculo manual de links mantido como alternativa.

## Estrutura criada no Drive

```text
PUBLICOLOR - SISTEMA PCP
└── CLIENTES
    └── Nome do cliente
        └── OP 1234
            ├── 01 - ARTE
            ├── 02 - APROVAÇÃO
            ├── 03 - PRODUÇÃO
            ├── 04 - DOCUMENTOS
            ├── 05 - FOTOS
            ├── 06 - INSTALAÇÃO
            └── 07 - OUTROS
```

Quando a OP possui subpedido:

```text
OP LEG-2028
└── SUBPEDIDO LEG-2028-0287
    └── 01 - ARTE
```

## 1. Banco de dados

Execute no SQL Editor do Supabase:

```text
supabase/migrations/20260718010000_google_drive_oauth_integration.sql
```

A migração cria tabelas privadas para:

- configuração cifrada da integração;
- estados temporários do OAuth;
- sessões temporárias de upload.

Essas tabelas não possuem políticas para `anon` ou `authenticated`. Apenas as rotas de servidor, usando `service_role`, conseguem acessá-las.

## 2. Variáveis da Vercel

Cadastre em **Vercel → Project Settings → Environment Variables**:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
SUPABASE_SERVICE_ROLE_KEY
NEXT_PUBLIC_APP_URL
DRIVE_SETTINGS_ENCRYPTION_KEY
```

Regras:

- `SUPABASE_SERVICE_ROLE_KEY` nunca pode ter o prefixo `NEXT_PUBLIC_`.
- `DRIVE_SETTINGS_ENCRYPTION_KEY` deve ser uma sequência aleatória longa.
- `NEXT_PUBLIC_APP_URL` deve ser a URL final do sistema, sem barra no final.

Existe um modelo no arquivo `.env.example`.

## 3. Google Cloud

1. Entre no Google Cloud com a conta que administrará o projeto.
2. Crie ou selecione um projeto.
3. Ative a **Google Drive API**.
4. Configure a tela de consentimento OAuth.
5. Durante os testes, inclua `alissondiego62@gmail.com` como usuário de teste.
6. Crie uma credencial **OAuth Client ID → Web application**.
7. Abra o sistema já publicado.
8. Acesse **Configurações → Integração com Google Drive**.
9. Copie a URI exibida em **URI de redirecionamento autorizada**.
10. Cadastre essa URI no cliente OAuth do Google Cloud.
11. Cole o Client ID e o Client Secret nas Configurações do sistema.
12. Salve e clique em **Conectar com Google**.

## 4. Uso

1. Abra um pedido.
2. Entre na aba **Arquivos**.
3. Selecione um ou vários arquivos.
4. Escolha a categoria.
5. Informe versão e observação quando necessário.
6. Clique em **Enviar ao Drive**.

O sistema cria as pastas necessárias, envia o arquivo e grava o vínculo na tabela `order_files`.

## Segurança

- A senha da conta Google nunca é solicitada nem armazenada.
- A autorização ocorre na página oficial do Google.
- O navegador não recebe Client Secret, access token ou refresh token.
- A URL temporária de upload é válida apenas para a sessão criada pelo Google.
- Trocar o e-mail, Client ID ou Client Secret nas Configurações desconecta a autorização anterior para evitar mistura de contas.

## Permissões dos arquivos

Os arquivos permanecem privados na conta conectada. Outros usuários do sistema poderão ver o registro, mas o Google poderá solicitar acesso ao abrir o link caso a conta deles não tenha permissão na pasta. O compartilhamento automático com outras contas não foi ativado nesta etapa.
