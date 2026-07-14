begin;

create table if not exists public.google_drive_settings (
  singleton_id smallint primary key default 1 check (singleton_id = 1),
  account_email text not null default 'alissondiego62@gmail.com',
  oauth_client_id text not null default '',
  oauth_client_secret_ciphertext text,
  access_token_ciphertext text,
  refresh_token_ciphertext text,
  token_expires_at timestamptz,
  connected_email text,
  root_folder_name text not null default 'PUBLICOLOR - SISTEMA PCP',
  root_folder_id text,
  enabled boolean not null default true,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.google_drive_settings (
  singleton_id,
  account_email,
  root_folder_name,
  enabled
) values (
  1,
  'alissondiego62@gmail.com',
  'PUBLICOLOR - SISTEMA PCP',
  true
)
on conflict (singleton_id) do nothing;

create table if not exists public.google_drive_oauth_states (
  state_hash text primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  redirect_uri text not null,
  return_to text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists google_drive_oauth_states_expiry_idx
  on public.google_drive_oauth_states (expires_at);

create table if not exists public.google_drive_upload_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  drive_folder_id text not null,
  file_name text not null,
  mime_type text not null default 'application/octet-stream',
  file_size bigint not null check (file_size > 0),
  file_category text not null default 'other'
    check (file_category in ('art','approval','production','photo','installation','document','other')),
  version text,
  notes text,
  is_approved boolean not null default false,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists google_drive_upload_sessions_expiry_idx
  on public.google_drive_upload_sessions (expires_at);
create index if not exists google_drive_upload_sessions_order_idx
  on public.google_drive_upload_sessions (order_id, created_at desc);

alter table public.google_drive_settings enable row level security;
alter table public.google_drive_oauth_states enable row level security;
alter table public.google_drive_upload_sessions enable row level security;

-- Nenhuma política é criada para usuários comuns. Esses registros contêm
-- credenciais cifradas e são acessados exclusivamente pelas rotas de servidor
-- usando a chave service_role, que nunca pode ser exposta no navegador.
revoke all on table public.google_drive_settings from anon, authenticated;
revoke all on table public.google_drive_oauth_states from anon, authenticated;
revoke all on table public.google_drive_upload_sessions from anon, authenticated;

grant all on table public.google_drive_settings to service_role;
grant all on table public.google_drive_oauth_states to service_role;
grant all on table public.google_drive_upload_sessions to service_role;

comment on table public.google_drive_settings is
  'Configuração única e credenciais cifradas da integração Google Drive. Acesso somente pelo servidor.';
comment on column public.google_drive_settings.account_email is
  'E-mail Google esperado durante a autorização OAuth. Pode ser alterado por administrador nas Configurações.';
comment on column public.google_drive_settings.oauth_client_secret_ciphertext is
  'Client Secret OAuth cifrado no servidor com AES-256-GCM.';
comment on column public.google_drive_settings.refresh_token_ciphertext is
  'Refresh token Google cifrado; nunca retornado ao navegador.';
comment on table public.google_drive_upload_sessions is
  'Sessões temporárias para upload retomável direto do navegador ao Google Drive.';

commit;
