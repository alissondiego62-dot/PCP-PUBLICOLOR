# Banco, ambiente e atualizações SQL

## Objetivo

O módulo permite que um administrador:

- cadastre o token da Vercel, projeto, Team ID e Deploy Hook;
- cadastre o token do Supabase Management API e a referência padrão do projeto;
- teste um novo Supabase antes da troca;
- atualize na Vercel as variáveis de produção do banco;
- dispare um novo deployment automaticamente;
- envie arquivos `.sql` para execução no projeto Supabase selecionado;
- consulte a auditoria de trocas de ambiente e execuções SQL.

## Migração inicial obrigatória

A primeira instalação ainda exige a execução manual do arquivo:

```text
20260722010000_admin_platform_and_sql_updates.sql
```

Depois dessa migração, os próximos arquivos SQL podem ser executados pelo próprio menu de Configurações.

## Configuração da automação

No sistema, abra:

```text
Configurações → Banco, ambiente e atualizações SQL
```

Informe:

- ID ou nome do projeto da Vercel;
- Team ID da Vercel, se o projeto estiver em uma equipe;
- token de acesso da Vercel;
- Deploy Hook da branch de produção;
- referência do projeto Supabase;
- Personal Access Token ou token granular do Supabase Management API com acesso de escrita no banco.

Os tokens e o Deploy Hook são cifrados no servidor e nunca retornam ao navegador.

## Troca de banco

O banco de destino precisa conter:

- todas as migrações do Publicolor;
- as tabelas `profiles`, `orders` e `system_platform_settings`;
- o usuário administrador atual no Supabase Auth;
- um perfil ativo com papel `admin` para esse usuário;
- os dados que serão utilizados depois da troca.

O sistema testa esses requisitos antes de alterar a Vercel. Ao aplicar:

1. valida o novo Supabase;
2. copia as credenciais administrativas e a configuração cifrada do Google Drive para o banco novo;
3. atualiza `NEXT_PUBLIC_SUPABASE_URL`;
4. atualiza `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`;
5. atualiza `SUPABASE_SERVICE_ROLE_KEY`;
6. atualiza `NEXT_PUBLIC_APP_URL`, quando informado;
7. aciona o Deploy Hook;
8. registra a operação na auditoria.

Após o novo deployment, a sessão do banco antigo deixa de ser usada. O administrador deverá entrar novamente com uma conta existente no banco novo.

## Execução de SQL

O executor aceita arquivos `.sql` de até 2 MB. Antes de executar, ele:

- mostra uma prévia;
- identifica alertas básicos como `DROP`, `TRUNCATE`, `DELETE`, `ALTER TABLE` e alterações de permissão;
- exige a frase `EXECUTAR SQL`;
- calcula SHA-256;
- impede repetição acidental de arquivos já executados com sucesso;
- registra usuário, projeto, arquivo, tamanho, hash, data, resultado e erro.

Comandos internos do `psql`, como `\i` e `\copy`, não são aceitos.

## Segurança

A variável `DRIVE_SETTINGS_ENCRYPTION_KEY` continua fixa na Vercel e precisa estar explicitamente configurada antes de qualquer troca de banco. Ela é a raiz de criptografia das credenciais e não pode ser alterada pelo painel sem invalidar os segredos existentes.

Somente usuários com papel `admin` acessam as rotas administrativas. As tabelas de configuração e auditoria não possuem acesso direto para os papéis `anon` ou `authenticated`; as operações passam pelas rotas de servidor usando a Service Role.
