# Arquitetura — PCP Publicolor 2.0

## Visão geral

Aplicação React/TypeScript executada com Vinext/Vite, publicada na Vercel e integrada ao Supabase e ao Google Drive.

## Organização principal

```text
app/
  page.tsx                         Orquestra autenticação, estado e telas principais
  layout.tsx                       Metadados e camadas globais de CSS
  components/InstallationAgendaView.tsx
  api/                             Rotas protegidas de Drive e administração
components/
  OrderBatchForm.tsx               Pedido único e OP com subpedidos
  OrderDriveUpload.tsx             Upload, atualização e estado do Drive
  GoogleDriveSettings.tsx          Configuração OAuth administrativa
  ClientsView.tsx                  Clientes
  CompletedOrdersView.tsx          Pedidos concluídos
  DataImportExportSettings.tsx     CSV e XML
  PlatformAdministrationSettings.tsx
lib/
  supabase.ts                      Cliente público
  server/                          Credenciais e operações exclusivas do servidor
  pcp-types.ts                     Tipos de domínio
  pcp-config.ts                    Rótulos, menus e mapeamentos
  pcp-formatters.ts                Datas, status e formatação
supabase/migrations/               Evolução versionada do banco
public/                            Logo e favicon
```

## Fluxo de dados

1. O usuário autentica pelo Supabase Auth.
2. O navegador usa apenas a URL e a chave pública do Supabase.
3. Operações sensíveis usam rotas de servidor protegidas pela sessão do usuário.
4. A Service Role, tokens OAuth e segredos não são enviados ao navegador.
5. Alterações operacionais são persistidas no Supabase e registradas no histórico.
6. Eventos Realtime são agrupados antes da recarga para reduzir consultas repetidas.
7. Arquivos são armazenados no Google Drive e seus metadados ficam em `order_files`.
8. As raízes e categorias reais de cada OS ficam em `order_drive_folders`.

## Google Drive

A sincronização completa usa o escopo `https://www.googleapis.com/auth/drive`. A rota:

- localiza a raiz real por nome e IDs registrados;
- percorre todas as subpastas e atalhos;
- vincula qualquer tipo de arquivo;
- restaura arquivos mantidos no Drive;
- confere se cada arquivo encontrado ficou visível na OS.

## Regras estruturais

- Toda alteração de banco possui migration SQL.
- Credenciais administrativas ficam apenas no servidor.
- Novas telas devem ser extraídas para componentes quando possível.
- `.env.local`, dependências e builds não entram no Git/ZIP.
- `app/site-audit.css` é a última camada e deve conter apenas correções conservadoras de responsividade.
