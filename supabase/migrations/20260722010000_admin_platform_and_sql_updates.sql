begin;

create table if not exists public.system_platform_settings (
  singleton_id smallint primary key default 1 check (singleton_id = 1),
  vercel_access_token_ciphertext text,
  vercel_project_id text not null default '',
  vercel_team_id text not null default '',
  vercel_deploy_hook_ciphertext text,
  supabase_management_token_ciphertext text,
  supabase_project_ref text not null default '',
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.system_platform_settings (singleton_id)
values (1)
on conflict (singleton_id) do nothing;

create table if not exists public.system_environment_changes (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id) on delete set null,
  actor_name text not null default '',
  actor_email text not null default '',
  target_project_ref text,
  target_supabase_url_masked text not null default '',
  changed_keys text[] not null default '{}',
  status text not null default 'started'
    check (status in ('started', 'validated', 'variables_updated', 'deployment_triggered', 'completed', 'failed')),
  deployment_job_id text,
  error_message text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists system_environment_changes_created_idx
  on public.system_environment_changes (created_at desc);

create table if not exists public.system_sql_updates (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id) on delete set null,
  actor_name text not null default '',
  actor_email text not null default '',
  project_ref text not null,
  file_name text not null,
  file_sha256 text not null,
  file_size bigint not null check (file_size >= 0),
  statement_count integer not null default 0,
  risk_flags text[] not null default '{}',
  sql_preview text not null default '',
  status text not null default 'running'
    check (status in ('running', 'success', 'failed')),
  result_summary jsonb,
  error_message text,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists system_sql_updates_project_hash_idx
  on public.system_sql_updates (project_ref, file_sha256, status);

create index if not exists system_sql_updates_started_idx
  on public.system_sql_updates (started_at desc);

alter table public.system_platform_settings enable row level security;
alter table public.system_environment_changes enable row level security;
alter table public.system_sql_updates enable row level security;

revoke all on table public.system_platform_settings from anon, authenticated;
revoke all on table public.system_environment_changes from anon, authenticated;
revoke all on table public.system_sql_updates from anon, authenticated;

grant all on table public.system_platform_settings to service_role;
grant all on table public.system_environment_changes to service_role;
grant all on table public.system_sql_updates to service_role;

comment on table public.system_platform_settings is
  'Credenciais cifradas para automação administrativa da Vercel e Supabase. Acesso exclusivo por rotas de servidor.';
comment on column public.system_platform_settings.vercel_access_token_ciphertext is
  'Token da API da Vercel cifrado com AES-256-GCM; nunca retornado ao navegador.';
comment on column public.system_platform_settings.vercel_deploy_hook_ciphertext is
  'URL secreta do Deploy Hook da Vercel cifrada; usada para publicar alterações de ambiente.';
comment on column public.system_platform_settings.supabase_management_token_ciphertext is
  'Personal Access Token ou token granular do Supabase Management API, cifrado no servidor.';
comment on table public.system_environment_changes is
  'Auditoria de testes e trocas das variáveis de ambiente do banco de dados.';
comment on table public.system_sql_updates is
  'Auditoria dos arquivos SQL executados pelo menu administrativo.';

commit;
