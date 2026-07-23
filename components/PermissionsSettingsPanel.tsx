"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import type { AppRole } from "@/lib/pcp-types";
import { defaultRolePermissions, permissionCatalog, type PermissionKey } from "@/lib/permissions";
import { supabase } from "@/lib/supabase";
import { AppIcon } from "@/components/ui/AppIcon";

const roles: Array<{ key: AppRole; label: string }> = [
  { key: "admin", label: "Administrador" },
  { key: "manager", label: "Gerente" },
  { key: "production", label: "Operador" },
  { key: "viewer", label: "Visualizador" },
];

type PermissionState = Record<AppRole, Record<PermissionKey, boolean>>;

function initialState(): PermissionState {
  return Object.fromEntries(roles.map(({ key }) => [key, Object.fromEntries(permissionCatalog.map((permission) => [permission.key, defaultRolePermissions[key].has(permission.key)]))])) as PermissionState;
}

export function PermissionsSettingsPanel() {
  const [matrix, setMatrix] = useState<PermissionState>(() => initialState());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const grouped = useMemo(() => permissionCatalog.reduce<Record<string, Array<(typeof permissionCatalog)[number]>>>((result, permission) => {
    (result[permission.module] ||= []).push(permission);
    return result;
  }, {}), []);

  useEffect(() => {
    let active = true;
    void (async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) {
        if (active) { setMessage("Sessão expirada. Entre novamente."); setLoading(false); }
        return;
      }
      const response = await fetch("/api/admin/permissions", { headers: { authorization: `Bearer ${token}` } });
      const payload = await response.json().catch(() => ({})) as { permissions?: Array<{ role: AppRole; permission_key: PermissionKey; allowed: boolean }>; error?: string };
      if (!active) return;
      if (response.ok && payload.permissions) {
        const next = initialState();
        for (const row of payload.permissions) {
          if (next[row.role] && row.permission_key in next[row.role]) next[row.role][row.permission_key] = row.allowed;
        }
        setMatrix(next);
      } else {
        setMessage(payload.error || "Não foi possível carregar as permissões.");
      }
      setLoading(false);
    })();
    return () => { active = false; };
  }, []);

  function toggle(role: AppRole, key: PermissionKey) {
    if (role === "admin" || key === "settings.permissions") return;
    setMatrix((current) => ({ ...current, [role]: { ...current[role], [key]: !current[role][key] } }));
  }

  function restoreDefaults() {
    if (!window.confirm("Restaurar as permissões padrão de todos os níveis?")) return;
    setMatrix(initialState());
    setMessage("Padrão restaurado localmente. Clique em Salvar permissões para aplicar.");
  }

  async function save() {
    setSaving(true); setMessage("");
    const rows = roles.flatMap(({ key: role }) => permissionCatalog.map((permission) => ({ role, permission_key: permission.key, allowed: matrix[role][permission.key] })));
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) { setSaving(false); setMessage("Sessão expirada. Entre novamente."); return; }
    const response = await fetch("/api/admin/permissions", {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ permissions: rows }),
    });
    const payload = await response.json().catch(() => ({})) as { message?: string; error?: string };
    setSaving(false);
    setMessage(response.ok ? payload.message || "Permissões atualizadas. Os usuários recebem a nova regra ao recarregar a sessão." : payload.error || "Não foi possível salvar as permissões.");
  }

  if (loading) return <section className="permissions-settings-card"><p>Carregando matriz de permissões…</p></section>;

  return <section className="permissions-settings-card">
    <header><div><small>CONTROLE DE ACESSO</small><h2>Permissões por nível de usuário</h2><p>As regras são aplicadas na interface e no banco. Exceções individuais permanecem separadas do padrão do cargo.</p></div><div className="permissions-header-actions"><button type="button" onClick={restoreDefaults}><AppIcon name="refresh"/> Restaurar padrão</button><button type="button" className="primary" disabled={saving} onClick={() => void save()}><AppIcon name="check"/> {saving ? "Salvando…" : "Salvar permissões"}</button></div></header>
    {message && <div className="permissions-message">{message}</div>}
    <div className="permissions-matrix-wrap"><table className="permissions-matrix"><thead><tr><th>Permissão</th>{roles.map((role) => <th key={role.key}>{role.label}</th>)}</tr></thead><tbody>{groupedEntries.map(([module, permissions]) => <Fragment key={module}>
      <tr className="permissions-module-row"><th colSpan={5}>{module}</th></tr>
      {permissions.map((permission) => <tr key={permission.key}><td><b>{permission.label}</b><small>{permission.description}</small></td>{roles.map(({ key: role }) => { const locked = role === "admin" || permission.key === "settings.permissions"; return <td key={role}><label className={`permission-switch ${locked ? "locked" : ""}`} title={locked ? (role === "admin" ? "O administrador mantém acesso total." : "Somente administradores configuram permissões.") : permission.label}><input type="checkbox" checked={matrix[role][permission.key]} disabled={locked} onChange={() => toggle(role, permission.key)}/><span/></label></td>; })}</tr>)}
    </Fragment>)}</tbody></table></div>
  </section>;
}
