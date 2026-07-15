"use client";

import type { Profile } from "@/lib/pcp-types";
import { roleLabel } from "@/lib/pcp-config";

export function UsersView({ profiles, currentUserId, profileBusyId, online, onNewUser, onChangeRole }: {
  profiles: Profile[];
  currentUserId: string;
  profileBusyId: string | null;
  online: boolean;
  onNewUser: () => void;
  onChangeRole: (profile: Profile, role: "admin" | "production" | "viewer") => void;
}) {
  return <section className="management-view">
    <div className="users-panel">
      <header>
        <div><h2>Níveis de acesso</h2><p>Administrador gerencia tudo; Operador trabalha nos pedidos; Usuário apenas visualiza e comenta.</p></div>
        <div className="users-panel-actions"><span className="role-badge" data-role="admin">Somente administrador</span><button type="button" className="primary new-user-button" onClick={onNewUser} disabled={!online}>＋ Novo usuário</button></div>
      </header>
      {profiles.map((profile) => <article className="user-role-row" key={profile.id}><div><b>{profile.name || profile.email.split("@")[0]}</b><small>{profile.email} · {profile.active ? "Ativo" : "Inativo"}</small><span className="current-user-label">{profile.id === currentUserId ? "Sua conta" : roleLabel[profile.role]}</span></div><select className="user-role-select" value={profile.role === "manager" ? "production" : profile.role} disabled={!online || profile.id === currentUserId || profileBusyId === profile.id || !profile.active} onChange={(event) => onChangeRole(profile, event.target.value as "admin" | "production" | "viewer")} aria-label={`Nível de acesso de ${profile.name || profile.email}`}><option value="admin">Administrador</option><option value="production">Operador</option><option value="viewer">Usuário</option></select></article>)}
    </div>
    <div className="settings-security-note">ⓘ {online ? "Use “Novo usuário” para enviar um convite. A pessoa criará a própria senha no primeiro acesso." : "Modo offline: os níveis de acesso estão disponíveis somente para consulta."}</div>
  </section>;
}
