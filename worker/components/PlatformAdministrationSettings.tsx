"use client";

import { useEffect, useMemo, useState } from "react";
import type { ChangeEvent, FormEvent, MouseEvent } from "react";
import { supabase } from "@/lib/supabase";

type PlatformSettings = {
  vercel_project_id: string;
  vercel_team_id: string;
  vercel_token_configured: boolean;
  deploy_hook_configured: boolean;
  supabase_project_ref: string;
  supabase_management_token_configured: boolean;
  updated_at: string;
  current_environment: {
    supabase_url: string;
    project_ref: string;
    publishable_key_masked: string;
    service_role_key_masked: string;
    app_url: string;
    encryption_root_configured: boolean;
  };
};

type SqlUpdate = {
  id: string;
  actor_name: string;
  actor_email: string;
  project_ref: string;
  file_name: string;
  file_sha256: string;
  file_size: number;
  statement_count: number;
  risk_flags: string[];
  status: "running" | "success" | "failed";
  error_message: string | null;
  started_at: string;
  completed_at: string | null;
};

type EnvironmentChange = {
  id: string;
  actor_name: string;
  actor_email: string;
  target_project_ref: string | null;
  target_supabase_url_masked: string;
  changed_keys: string[];
  status: string;
  deployment_job_id: string | null;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
};

type AdministrativeHistory = {
  sql_updates: SqlUpdate[];
  environment_changes: EnvironmentChange[];
};

type Feedback = { type: "success" | "error" | "warning"; text: string };

async function accessToken() {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.access_token) throw new Error("Sessão expirada. Entre novamente no sistema.");
  return data.session.access_token;
}

async function apiRequest<T>(path: string, init: RequestInit = {}) {
  const token = await accessToken();
  const isFormData = init.body instanceof FormData;
  const response = await fetch(path, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      ...(!isFormData && init.body ? { "content-type": "application/json" } : {}),
      ...(init.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new Error(payload.error || "Não foi possível concluir a operação.");
  return payload;
}

function dateTimeLabel(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function bytesLabel(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function riskFlags(sql: string) {
  const checks: Array<[RegExp, string]> = [
    [/\bdrop\s+(table|schema|view|function|type|policy|trigger)\b/i, "DROP de objeto"],
    [/\btruncate\b/i, "TRUNCATE"],
    [/\bdelete\s+from\b/i, "DELETE"],
    [/\balter\s+table\b/i, "ALTER TABLE"],
    [/\brevoke\b|\bgrant\b/i, "Permissões"],
  ];
  return checks.filter(([pattern]) => pattern.test(sql)).map(([, label]) => label);
}

export function PlatformAdministrationSettings() {
  const [settings, setSettings] = useState<PlatformSettings | null>(null);
  const [history, setHistory] = useState<AdministrativeHistory>({ sql_updates: [], environment_changes: [] });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [sqlFile, setSqlFile] = useState<File | null>(null);
  const [sqlPreview, setSqlPreview] = useState("");
  const [targetTest, setTargetTest] = useState<{ admin_ready: boolean; message: string; project_ref: string } | null>(null);

  async function loadData() {
    setLoading(true);
    try {
      const [settingsResult, historyResult] = await Promise.all([
        apiRequest<PlatformSettings>("/api/admin/platform/settings"),
        apiRequest<AdministrativeHistory>("/api/admin/sql-updates"),
      ]);
      setSettings(settingsResult);
      setHistory(historyResult);
    } catch (error) {
      setFeedback({ type: "error", text: error instanceof Error ? error.message : "Falha ao carregar as configurações." });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  async function saveAutomation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setBusy("save-automation");
    setFeedback(null);
    try {
      const result = await apiRequest<{ settings: PlatformSettings; message: string }>("/api/admin/platform/settings", {
        method: "PUT",
        body: JSON.stringify({
          vercel_project_id: String(form.get("vercel_project_id") || ""),
          vercel_team_id: String(form.get("vercel_team_id") || ""),
          vercel_access_token: String(form.get("vercel_access_token") || ""),
          deploy_hook_url: String(form.get("deploy_hook_url") || ""),
          supabase_project_ref: String(form.get("supabase_project_ref") || ""),
          supabase_management_token: String(form.get("supabase_management_token") || ""),
        }),
      });
      setSettings(result.settings);
      setFeedback({ type: "success", text: result.message });
      formElement.reset();
    } catch (error) {
      setFeedback({ type: "error", text: error instanceof Error ? error.message : "Falha ao salvar." });
    } finally {
      setBusy("");
    }
  }

  async function testVercel() {
    if (busy) return;
    setBusy("test-vercel");
    setFeedback(null);
    try {
      const result = await apiRequest<{ message: string }>("/api/admin/platform/test-vercel", { method: "POST", body: "{}" });
      setFeedback({ type: "success", text: result.message });
    } catch (error) {
      setFeedback({ type: "error", text: error instanceof Error ? error.message : "Falha ao testar a Vercel." });
    } finally {
      setBusy("");
    }
  }

  function targetPayload(form: FormData) {
    return {
      supabase_url: String(form.get("supabase_url") || ""),
      publishable_key: String(form.get("publishable_key") || ""),
      service_role_key: String(form.get("service_role_key") || ""),
      project_ref: String(form.get("project_ref") || ""),
      app_url: String(form.get("app_url") || ""),
      confirmation: String(form.get("confirmation") || ""),
    };
  }

  async function testNewDatabase(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = new FormData(event.currentTarget);
    setBusy("test-database");
    setFeedback(null);
    setTargetTest(null);
    try {
      const result = await apiRequest<{ admin_ready: boolean; message: string; project_ref: string }>("/api/admin/platform/test-supabase", {
        method: "POST",
        body: JSON.stringify(targetPayload(form)),
      });
      setTargetTest(result);
      setFeedback({ type: result.admin_ready ? "success" : "warning", text: result.message });
    } catch (error) {
      setFeedback({ type: "error", text: error instanceof Error ? error.message : "Falha ao testar o novo banco." });
    } finally {
      setBusy("");
    }
  }

  async function applyNewDatabase(formElement: HTMLFormElement) {
    if (busy) return;
    const form = new FormData(formElement);
    const payload = targetPayload(form);
    if (payload.confirmation.trim().toUpperCase() !== "TROCAR BANCO") {
      setFeedback({ type: "error", text: "Digite TROCAR BANCO no campo de confirmação." });
      return;
    }
    if (!window.confirm("Aplicar as novas chaves na Vercel e iniciar um deployment? O sistema ficará temporariamente indisponível e você precisará entrar novamente.")) return;

    setBusy("apply-database");
    setFeedback(null);
    try {
      const result = await apiRequest<{ message: string; deployment_job_id: string | null }>("/api/admin/platform/apply-environment", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setFeedback({ type: "success", text: `${result.message}${result.deployment_job_id ? ` Deployment: ${result.deployment_job_id}.` : ""}` });
      setTargetTest(null);
      await loadData();
    } catch (error) {
      setFeedback({ type: "error", text: error instanceof Error ? error.message : "Falha ao aplicar a troca." });
    } finally {
      setBusy("");
    }
  }

  async function selectSqlFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] || null;
    setSqlFile(file);
    setSqlPreview("");
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".sql")) {
      setFeedback({ type: "error", text: "Selecione um arquivo com extensão .sql." });
      setSqlFile(null);
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setFeedback({ type: "error", text: "O arquivo SQL deve ter no máximo 2 MB." });
      setSqlFile(null);
      return;
    }
    const text = await file.text();
    setSqlPreview(text.slice(0, 12_000));
    setFeedback(null);
  }

  async function executeSql(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!sqlFile || busy) {
      if (!sqlFile) setFeedback({ type: "error", text: "Selecione o arquivo SQL antes de executar." });
      return;
    }
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    if (String(form.get("confirmation") || "").trim().toUpperCase() !== "EXECUTAR SQL") {
      setFeedback({ type: "error", text: "Digite EXECUTAR SQL para confirmar." });
      return;
    }
    if (!window.confirm(`Executar ${sqlFile.name} no projeto ${String(form.get("project_ref") || settings?.supabase_project_ref || "informado")}?`)) return;

    const upload = new FormData();
    upload.set("file", sqlFile);
    upload.set("project_ref", String(form.get("project_ref") || ""));
    upload.set("confirmation", String(form.get("confirmation") || ""));
    upload.set("allow_repeat", form.get("allow_repeat") === "on" ? "true" : "false");

    setBusy("execute-sql");
    setFeedback(null);
    try {
      const result = await apiRequest<{ message: string; statement_count: number; risk_flags: string[] }>("/api/admin/sql-updates", {
        method: "POST",
        body: upload,
      });
      setFeedback({
        type: "success",
        text: `${result.message} ${result.statement_count} bloco(s) identificado(s).${result.risk_flags.length ? ` Alertas: ${result.risk_flags.join(", ")}.` : ""}`,
      });
      setSqlFile(null);
      setSqlPreview("");
      formElement.reset();
      await loadData();
    } catch (error) {
      setFeedback({ type: "error", text: error instanceof Error ? error.message : "Falha ao executar o SQL." });
      await loadData();
    } finally {
      setBusy("");
    }
  }

  const previewRisks = useMemo(() => riskFlags(sqlPreview), [sqlPreview]);

  if (loading) return <section className="platform-admin-module"><div className="platform-loading">Carregando banco, ambiente e atualizações SQL…</div></section>;
  if (!settings) return <section className="platform-admin-module"><div className="platform-feedback error">Execute a migração inicial deste módulo no Supabase.</div></section>;

  return <section className="platform-admin-module">
    <header className="platform-heading">
      <div><small>ADMINISTRAÇÃO TÉCNICA</small><h2>Banco, ambiente e atualizações SQL</h2><p>Centraliza a troca do Supabase, a atualização das variáveis de produção na Vercel e a execução auditada de arquivos SQL.</p></div>
      <span>Somente administrador</span>
    </header>

    {feedback && <div className={`platform-feedback ${feedback.type}`}>{feedback.text}</div>}
    {!settings.current_environment.encryption_root_configured && <div className="platform-feedback warning">Antes de trocar o banco, configure uma DRIVE_SETTINGS_ENCRYPTION_KEY própria na Vercel. O fallback atual depende da Service Role e não é seguro para uma mudança de Supabase.</div>}

    <div className="platform-current-grid">
      <article><small>SUPABASE ATUAL</small><b>{settings.current_environment.project_ref || "Referência não identificada"}</b><code>{settings.current_environment.supabase_url || "Não informado"}</code></article>
      <article><small>PUBLISHABLE KEY</small><b>{settings.current_environment.publishable_key_masked}</b><span>Variável de produção</span></article>
      <article><small>SERVICE ROLE</small><b>{settings.current_environment.service_role_key_masked}</b><span>Nunca exibida integralmente</span></article>
      <article><small>URL DO SISTEMA</small><b>{settings.current_environment.app_url || "Não informada"}</b><span>Raiz de criptografia: {settings.current_environment.encryption_root_configured ? "configurada" : "usando fallback"}</span></article>
    </div>

    <div className="platform-two-column">
      <form key={`platform-automation-${settings.updated_at}`} className="platform-card" onSubmit={saveAutomation}>
        <div className="platform-card-title"><span>⚙</span><div><small>AUTOMAÇÃO</small><h3>Vercel e Supabase Management API</h3></div></div>
        <p className="platform-card-description">Essas credenciais permitem alterar variáveis e executar SQL sem abrir os painéis externos. Segredos ficam cifrados e os valores atuais não retornam ao navegador.</p>
        <div className="platform-fields">
          <label>ID ou nome do projeto Vercel<input name="vercel_project_id" defaultValue={settings.vercel_project_id} placeholder="prj_... ou controle-pedidos-kanban" required /></label>
          <label>Team ID da Vercel<input name="vercel_team_id" defaultValue={settings.vercel_team_id} placeholder="team_... (opcional em conta pessoal)" /></label>
          <label>Token de acesso da Vercel<input name="vercel_access_token" type="password" autoComplete="new-password" placeholder={settings.vercel_token_configured ? "•••••••• Deixe vazio para manter" : "Cole o token da Vercel"} /></label>
          <label>Deploy Hook de produção<input name="deploy_hook_url" type="password" autoComplete="new-password" placeholder={settings.deploy_hook_configured ? "•••••••• Deixe vazio para manter" : "https://api.vercel.com/v1/integrations/deploy/..."} /></label>
          <label>Referência padrão do projeto Supabase<input name="supabase_project_ref" defaultValue={settings.supabase_project_ref || settings.current_environment.project_ref} placeholder="abcdefghijklmnopqrst" required /></label>
          <label>Token do Supabase Management API<input name="supabase_management_token" type="password" autoComplete="new-password" placeholder={settings.supabase_management_token_configured ? "•••••••• Deixe vazio para manter" : "Cole o Personal Access Token"} /></label>
        </div>
        <div className="platform-actions">
          <button type="button" onClick={() => void testVercel()} disabled={Boolean(busy) || !settings.vercel_token_configured}>{busy === "test-vercel" ? "Testando…" : "Testar Vercel"}</button>
          <button className="primary" disabled={Boolean(busy)}>{busy === "save-automation" ? "Salvando…" : "Salvar automação"}</button>
        </div>
      </form>

      <form className="platform-card platform-switch-card" onSubmit={testNewDatabase}>
        <div className="platform-card-title"><span>⇄</span><div><small>TROCA CONTROLADA</small><h3>Conectar outro banco Supabase</h3></div></div>
        <p className="platform-card-description">O teste verifica as chaves, as tabelas obrigatórias e se sua conta já existe como administrador no banco de destino. O banco novo deve estar previamente migrado e com os dados que serão utilizados.</p>
        <div className="platform-fields">
          <label className="wide">URL do novo Supabase<input name="supabase_url" type="url" placeholder="https://novo-projeto.supabase.co" required /></label>
          <label>Referência do novo projeto<input name="project_ref" placeholder="novo-project-ref" required /></label>
          <label>Nova URL do aplicativo<input name="app_url" type="url" defaultValue={settings.current_environment.app_url} placeholder="https://controle-pedidos-kanban.vercel.app" /></label>
          <label className="wide">Publishable Key do novo banco<input name="publishable_key" type="password" autoComplete="new-password" placeholder="sb_publishable_..." required /></label>
          <label className="wide">Service Role Key do novo banco<input name="service_role_key" type="password" autoComplete="new-password" placeholder="sb_secret_... ou service_role JWT" required /></label>
          <label className="wide confirmation-field">Confirmação para aplicar<input name="confirmation" placeholder="Digite TROCAR BANCO somente ao aplicar" /><small>A troca só é publicada após o teste e uma nova validação no servidor.</small></label>
        </div>
        {targetTest && <div className={`platform-inline-result ${targetTest.admin_ready ? "success" : "warning"}`}><b>{targetTest.project_ref}</b><span>{targetTest.message}</span></div>}
        <div className="platform-actions">
          <button type="submit" disabled={Boolean(busy)}>{busy === "test-database" ? "Validando…" : "Testar novo banco"}</button>
          <button type="button" className="danger" disabled={Boolean(busy)} onClick={(event: MouseEvent<HTMLButtonElement>) => void applyNewDatabase(event.currentTarget.form!)}>{busy === "apply-database" ? "Aplicando e publicando…" : "Aplicar e publicar"}</button>
        </div>
      </form>
    </div>

    <div className="platform-sql-layout">
      <form className="platform-card platform-sql-card" onSubmit={executeSql}>
        <div className="platform-card-title"><span>SQL</span><div><small>ATUALIZAÇÃO DO BANCO</small><h3>Executar arquivo SQL</h3></div></div>
        <p className="platform-card-description">Use para as migrações fornecidas para o Publicolor. O arquivo é enviado ao servidor, executado pelo Management API e registrado com usuário, hash, projeto, data e resultado.</p>
        <div className="platform-sql-target">
          <label>Projeto de destino<input name="project_ref" defaultValue={settings.supabase_project_ref || settings.current_environment.project_ref} required /></label>
          <label className={`platform-sql-picker ${sqlFile ? "ready" : ""}`}>
            <input type="file" accept=".sql,text/plain,application/sql" onChange={(event: ChangeEvent<HTMLInputElement>) => void selectSqlFile(event)} />
            <span>{sqlFile ? sqlFile.name : "Selecionar arquivo .sql"}</span>
            <small>{sqlFile ? `${bytesLabel(sqlFile.size)} · pré-visualização carregada` : "Máximo de 2 MB"}</small>
          </label>
        </div>
        {sqlFile && <div className="platform-sql-summary"><span><b>Arquivo</b>{sqlFile.name}</span><span><b>Tamanho</b>{bytesLabel(sqlFile.size)}</span><span><b>Alertas detectados</b>{previewRisks.length ? previewRisks.join(", ") : "Nenhum alerta básico"}</span></div>}
        {sqlPreview && <details className="platform-sql-preview"><summary>Visualizar início do SQL</summary><pre>{sqlPreview}</pre></details>}
        <div className="platform-sql-confirm">
          <label><input name="allow_repeat" type="checkbox" /> Permitir repetir um arquivo já executado com sucesso</label>
          <label>Confirmação<input name="confirmation" placeholder="Digite EXECUTAR SQL" required /></label>
        </div>
        <div className="platform-danger-note"><b>Atenção</b><span>SQL pode alterar ou excluir dados. Faça backup antes de migrações destrutivas. A raiz de criptografia e as credenciais em uso não são exibidas nesta tela.</span></div>
        <div className="platform-actions"><button className="danger" disabled={Boolean(busy) || !sqlFile}>{busy === "execute-sql" ? "Executando…" : "Executar SQL no Supabase"}</button></div>
      </form>

      <aside className="platform-card platform-history-card">
        <div className="platform-card-title"><span>✓</span><div><small>AUDITORIA</small><h3>Últimas atualizações SQL</h3></div></div>
        <div className="platform-history-list">
          {history.sql_updates.length === 0 && <p>Nenhum arquivo SQL executado por este módulo.</p>}
          {history.sql_updates.map((item) => <article key={item.id} data-status={item.status}>
            <header><b title={item.file_name}>{item.file_name}</b><span>{item.status === "success" ? "Sucesso" : item.status === "failed" ? "Erro" : "Executando"}</span></header>
            <small>{item.project_ref} · {dateTimeLabel(item.started_at)}</small>
            <small>{item.actor_name || item.actor_email} · {item.statement_count} bloco(s) · {bytesLabel(item.file_size)}</small>
            <code title={item.file_sha256}>{item.file_sha256.slice(0, 16)}…</code>
            {item.risk_flags?.length > 0 && <em>{item.risk_flags.join(" · ")}</em>}
            {item.error_message && <p>{item.error_message}</p>}
          </article>)}
        </div>
      </aside>
    </div>

    <details className="platform-environment-history">
      <summary>Histórico de trocas de ambiente</summary>
      <div>{history.environment_changes.length === 0 ? <p>Nenhuma troca registrada.</p> : history.environment_changes.map((item) => <article key={item.id} data-status={item.status}><b>{item.target_project_ref || "Projeto não informado"}</b><span>{item.status} · {dateTimeLabel(item.created_at)}</span><small>{item.actor_name || item.actor_email} · {item.changed_keys.join(", ")}</small>{item.error_message && <p>{item.error_message}</p>}</article>)}</div>
    </details>

    <div className="platform-bootstrap-note"><b>Configuração que permanece fixa</b><span>A chave <code>DRIVE_SETTINGS_ENCRYPTION_KEY</code> continua na Vercel. Ela é a raiz que permite descriptografar as demais credenciais e não pode ser trocada por esta tela sem invalidar os segredos já armazenados.</span></div>
  </section>;
}
