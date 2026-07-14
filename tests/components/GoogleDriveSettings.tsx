"use client";

import { FormEvent, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type DriveSettings = {
  account_email: string;
  oauth_client_id: string;
  client_secret_configured: boolean;
  connected: boolean;
  connected_email: string | null;
  root_folder_name: string;
  root_folder_id: string | null;
  root_folder_url: string | null;
  enabled: boolean;
  redirect_uri: string;
  updated_at: string;
};

async function accessToken() {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.access_token) throw new Error("Sessão expirada. Entre novamente no sistema.");
  return data.session.access_token;
}

async function apiRequest<T>(path: string, init: RequestInit = {}) {
  const token = await accessToken();
  const response = await fetch(path, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...(init.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new Error(payload.error || "Não foi possível concluir a operação.");
  return payload;
}

export function GoogleDriveSettings() {
  const [settings, setSettings] = useState<DriveSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"save" | "connect" | "test" | "disconnect" | "" | "copy">("");
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);

  async function loadSettings() {
    setLoading(true);
    try {
      const result = await apiRequest<DriveSettings>("/api/google-drive/settings");
      setSettings(result);
    } catch (error) {
      setFeedback({ type: "error", text: error instanceof Error ? error.message : "Falha ao carregar o Google Drive." });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadSettings();
  }, []);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!settings || busy) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setBusy("save");
    setFeedback(null);
    try {
      const result = await apiRequest<{ settings: DriveSettings; message: string }>("/api/google-drive/settings", {
        method: "PUT",
        body: JSON.stringify({
          account_email: String(form.get("account_email") || ""),
          oauth_client_id: String(form.get("oauth_client_id") || ""),
          oauth_client_secret: String(form.get("oauth_client_secret") || ""),
          root_folder_name: String(form.get("root_folder_name") || ""),
          enabled: form.get("enabled") === "on",
        }),
      });
      setSettings(result.settings);
      setFeedback({ type: "success", text: result.message });
    } catch (error) {
      setFeedback({ type: "error", text: error instanceof Error ? error.message : "Falha ao salvar." });
    } finally {
      setBusy("");
    }
  }

  async function connect() {
    if (!settings || busy) return;
    setBusy("connect");
    setFeedback(null);
    try {
      const result = await apiRequest<{ url: string }>("/api/google-drive/authorize", { method: "POST", body: "{}" });
      window.location.assign(result.url);
    } catch (error) {
      setFeedback({ type: "error", text: error instanceof Error ? error.message : "Falha ao iniciar a autorização." });
      setBusy("");
    }
  }

  async function testConnection() {
    if (!settings || busy) return;
    setBusy("test");
    setFeedback(null);
    try {
      const result = await apiRequest<{ message: string; root_folder_url?: string }>("/api/google-drive/test", { method: "POST", body: "{}" });
      setFeedback({ type: "success", text: result.message });
      await loadSettings();
    } catch (error) {
      setFeedback({ type: "error", text: error instanceof Error ? error.message : "Falha no teste de conexão." });
    } finally {
      setBusy("");
    }
  }

  async function disconnect() {
    if (!settings || busy || !window.confirm("Desconectar a conta Google Drive do sistema? Os arquivos já enviados permanecerão no Drive.")) return;
    setBusy("disconnect");
    setFeedback(null);
    try {
      const result = await apiRequest<{ message: string }>("/api/google-drive/disconnect", { method: "POST", body: "{}" });
      setFeedback({ type: "success", text: result.message });
      await loadSettings();
    } catch (error) {
      setFeedback({ type: "error", text: error instanceof Error ? error.message : "Falha ao desconectar." });
    } finally {
      setBusy("");
    }
  }

  async function copyRedirect() {
    if (!settings?.redirect_uri) return;
    setBusy("copy");
    try {
      await navigator.clipboard.writeText(settings.redirect_uri);
      setFeedback({ type: "success", text: "URI de redirecionamento copiada." });
    } catch {
      setFeedback({ type: "error", text: "Não foi possível copiar. Selecione o endereço manualmente." });
    } finally {
      setBusy("");
    }
  }

  if (loading) return <section className="drive-settings-module"><div className="drive-settings-loading">Carregando integração com o Google Drive…</div></section>;
  if (!settings) return <section className="drive-settings-module"><div className="drive-settings-feedback error">Execute a migração SQL da integração e confira as variáveis do servidor.</div></section>;

  return <section className="drive-settings-module">
    <header className="drive-settings-heading">
      <div><small>ARQUIVOS DOS PEDIDOS</small><h2>Integração com Google Drive</h2><p>O administrador configura as credenciais OAuth, conecta a conta Google e define a pasta principal usada pelo sistema.</p></div>
      <span className={`drive-connection-pill ${settings.connected ? "connected" : "disconnected"}`}>{settings.connected ? "● Conectado" : "○ Não conectado"}</span>
    </header>

    {feedback && <div className={`drive-settings-feedback ${feedback.type}`}>{feedback.text}</div>}

    <div className="drive-settings-layout">
      <form key={settings.updated_at} className="drive-credentials-card" onSubmit={save}>
        <div className="drive-card-title"><span>🔐</span><div><small>CONFIGURAÇÃO ADMINISTRATIVA</small><h3>Conta e credenciais OAuth</h3></div></div>
        <div className="drive-settings-fields">
          <label>E-mail Google esperado<input name="account_email" type="email" defaultValue={settings.account_email || "alissondiego62@gmail.com"} placeholder="alissondiego62@gmail.com" /><small>O sistema impedirá a conexão de outra conta por engano.</small></label>
          <label>OAuth Client ID<input name="oauth_client_id" defaultValue={settings.oauth_client_id} placeholder="000000000000-xxxxx.apps.googleusercontent.com" autoComplete="off" /></label>
          <label>OAuth Client Secret<input name="oauth_client_secret" type="password" placeholder={settings.client_secret_configured ? "••••••••  Deixe vazio para manter" : "Cole o Client Secret"} autoComplete="new-password" /><small>O valor é cifrado no servidor e nunca volta para o navegador.</small></label>
          <label>Nome da pasta principal<input name="root_folder_name" defaultValue={settings.root_folder_name} placeholder="PUBLICOLOR - SISTEMA PCP" /></label>
          <label className="drive-enable-check"><input name="enabled" type="checkbox" defaultChecked={settings.enabled} /><span><b>Integração ativa</b><small>Permite criar pastas e anexar arquivos diretamente nos pedidos.</small></span></label>
        </div>
        <button type="submit" className="primary drive-save-button" disabled={Boolean(busy)}>{busy === "save" ? "Salvando…" : "Salvar configurações"}</button>
      </form>

      <aside className="drive-connection-card">
        <div className="drive-card-title"><span>☁</span><div><small>CONEXÃO GOOGLE</small><h3>{settings.connected ? settings.connected_email : "Aguardando autorização"}</h3></div></div>
        <dl>
          <div><dt>Client Secret</dt><dd>{settings.client_secret_configured ? "Configurado" : "Não informado"}</dd></div>
          <div><dt>Pasta principal</dt><dd>{settings.root_folder_id ? "Criada e localizada" : "Será criada ao conectar/testar"}</dd></div>
          <div><dt>Conta autorizada</dt><dd>{settings.connected_email || "—"}</dd></div>
        </dl>
        <div className="drive-connection-actions">
          <button type="button" className="primary" onClick={() => void connect()} disabled={Boolean(busy) || !settings.oauth_client_id || !settings.client_secret_configured}>{busy === "connect" ? "Abrindo Google…" : settings.connected ? "Reconectar conta" : "Conectar com Google"}</button>
          <button type="button" onClick={() => void testConnection()} disabled={Boolean(busy) || !settings.connected}>{busy === "test" ? "Testando…" : "Testar conexão"}</button>
          {settings.root_folder_url && <a href={settings.root_folder_url} target="_blank" rel="noreferrer">Abrir pasta principal</a>}
          {settings.connected && <button type="button" className="danger" onClick={() => void disconnect()} disabled={Boolean(busy)}>{busy === "disconnect" ? "Desconectando…" : "Desconectar"}</button>}
        </div>
      </aside>
    </div>

    <div className="drive-redirect-card">
      <div><small>URI DE REDIRECIONAMENTO AUTORIZADA</small><b>Cadastre exatamente este endereço no cliente OAuth do Google Cloud</b></div>
      <code>{settings.redirect_uri}</code>
      <button type="button" onClick={() => void copyRedirect()} disabled={busy === "copy"}>{busy === "copy" ? "Copiando…" : "Copiar"}</button>
    </div>

    <div className="drive-security-note"><b>Segurança e sincronização completa</b><span>O e-mail, Client ID e Client Secret podem ser trocados pelo administrador. Tokens e segredos ficam cifrados e não são devolvidos ao navegador. Para localizar também arquivos colocados manualmente nas pastas, a conta deve estar conectada com acesso completo ao Google Drive. Se ela foi conectada em uma versão antiga, desconecte e conecte novamente.</span></div>
  </section>;
}
