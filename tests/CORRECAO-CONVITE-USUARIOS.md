# Correção do convite de usuários

O cadastro de usuários deixou de depender da Edge Function `admin-create-user`, que estava configurada com o domínio antigo do GPT Sites e bloqueava requisições originadas da Vercel.

O convite agora é executado por uma rota segura do próprio servidor Vercel:

- `POST /api/admin/users/invite`
- exige sessão válida;
- confirma que o solicitante é administrador;
- usa a `SUPABASE_SERVICE_ROLE_KEY` somente no servidor;
- calcula a URL de retorno usando `NEXT_PUBLIC_APP_URL`;
- configura o perfil do usuário após o convite;
- reverte o usuário caso o perfil não possa ser criado;
- apresenta mensagens específicas para URL não autorizada, SMTP, limite de envio e e-mail duplicado.

Não é necessária migração SQL nem novo deploy da Edge Function.

No Supabase, confirme que a URL abaixo está autorizada em **Authentication → URL Configuration → Redirect URLs**:

`https://SEU-DOMINIO.vercel.app/**`
