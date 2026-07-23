"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { AppRole, Profile } from "@/lib/pcp-types";
import { dateTimeLabel } from "@/lib/pcp-formatters";
import { supabase } from "@/lib/supabase";
import { AppIcon } from "@/components/ui/AppIcon";
import { permissionCatalog, type PermissionKey } from "@/lib/permissions";

type Action = "activate" | "deactivate" | "resend_invite" | "cancel_invite";
type AccessRow = { id: string; signed_in_at: string; last_seen_at: string | null; signed_out_at: string | null; device_label: string | null; platform: string | null; user_agent: string | null };

type UserPatch = { name: string; role: AppRole; active: boolean; display_title: string | null; admin_notes: string | null };

function statusLabel(profile: Profile) { if (!profile.active) return "Inativo"; if (profile.invite_status === "pending") return "Convite pendente"; if (profile.invite_status === "expired") return "Convite expirado"; return "Ativo"; }
function displayDate(value?: string | null) { return value ? dateTimeLabel(value) : "Nunca"; }
function browserLabel(userAgent?: string | null) {
  const value = userAgent || "";
  if (/Edg\//.test(value)) return "Microsoft Edge";
  if (/OPR\//.test(value)) return "Opera";
  if (/Firefox\//.test(value)) return "Firefox";
  if (/CriOS\//.test(value)) return "Google Chrome (iOS)";
  if (/Chrome\//.test(value)) return "Google Chrome";
  if (/Safari\//.test(value)) return "Safari";
  return value ? "Navegador não identificado" : "Sem informação do navegador";
}
function sessionDuration(row: AccessRow) {
  const start = new Date(row.signed_in_at).getTime();
  const end = new Date(row.signed_out_at || row.last_seen_at || row.signed_in_at).getTime();
  const minutes = Math.max(0, Math.round((end - start) / 60000));
  if (minutes < 1) return "menos de 1 min";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${rest}min` : `${hours}h`;
}

export function UsersView({ profiles,currentUserId,profileBusyId,online,canManage,canManagePermissions,onNewUser,onChangeRole,onManageUser,onEditUser }: {
  profiles: Profile[];
  currentUserId: string;
  profileBusyId: string | null;
  online: boolean;
  canManage: boolean;
  canManagePermissions: boolean;
  onNewUser: () => void;
  onChangeRole: (profile: Profile, role: AppRole) => void;
  onManageUser: (profile: Profile, action: Action) => void;
  onEditUser: (profile: Profile, patch: UserPatch) => Promise<void>;
}) {
  const [query,setQuery]=useState(""); const [role,setRole]=useState<"all"|AppRole>("all"); const [status,setStatus]=useState<"all"|"active"|"inactive"|"pending">("all");
  const [editing,setEditing]=useState<Profile|null>(null); const [historyUser,setHistoryUser]=useState<Profile|null>(null); const [permissionUser,setPermissionUser]=useState<Profile|null>(null); const [history,setHistory]=useState<AccessRow[]>([]); const [historyLoading,setHistoryLoading]=useState(false); const [editBusy,setEditBusy]=useState(false);
  const filtered=useMemo(()=>profiles.filter((p)=>role==="all"||p.role===role).filter((p)=>status==="all"||(status==="active"&&p.active&&p.invite_status!=="pending")||(status==="inactive"&&!p.active)||(status==="pending"&&p.invite_status==="pending")).filter((p)=>!query.trim()||`${p.name} ${p.email} ${p.display_title||""}`.toLowerCase().includes(query.trim().toLowerCase())),[profiles,query,role,status]);

  async function openHistory(profile: Profile) {
    setHistoryUser(profile); setHistoryLoading(true); setHistory([]);
    const { data } = await supabase.from("user_access_log").select("id,signed_in_at,last_seen_at,signed_out_at,device_label,platform,user_agent").eq("user_id",profile.id).order("signed_in_at",{ascending:false}).limit(100);
    setHistory((data||[]) as AccessRow[]); setHistoryLoading(false);
  }

  async function submitEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if(!editing||editBusy)return;
    const form=new FormData(event.currentTarget); setEditBusy(true);
    await onEditUser(editing,{name:String(form.get("name")||"").trim(),role:String(form.get("role")||editing.role) as AppRole,active:form.get("active")==="on",display_title:String(form.get("display_title")||"").trim()||null,admin_notes:String(form.get("admin_notes")||"").trim()||null});
    setEditBusy(false); setEditing(null);
  }

  return <section className="management-view users-v342"><div className="users-panel"><header><div><h2>Usuários e permissões</h2><p>Gerencie contas, último acesso, convites e níveis de responsabilidade.</p></div><button type="button" className="primary new-user-button" onClick={onNewUser} disabled={!online || !canManage}><AppIcon name="users"/> Novo usuário</button></header>
    <div className="users-filter-bar"><label><AppIcon name="search"/><input value={query} onChange={(e)=>setQuery(e.target.value)} placeholder="Buscar usuário…"/></label><select value={role} onChange={(e)=>setRole(e.target.value as typeof role)}><option value="all">Todos os papéis</option><option value="admin">Administrador</option><option value="manager">Gerente</option><option value="production">Operador</option><option value="viewer">Visualizador</option></select><select value={status} onChange={(e)=>setStatus(e.target.value as typeof status)}><option value="all">Todos os status</option><option value="active">Ativos</option><option value="pending">Convites pendentes</option><option value="inactive">Inativos</option></select></div>
    <div className="users-role-matrix"><span>Administrador: acesso total</span><span>Gerente: operação e gestão</span><span>Operador: produção, pedidos e atividades</span><span>Visualizador: consulta</span></div>
    <div className="users-list">{filtered.map((profile)=><article className="user-v342-card" key={profile.id}><div className="user-identity"><b>{profile.name||profile.email.split("@")[0]}</b><small>{profile.email}</small>{profile.display_title&&<em>{profile.display_title}</em>}<span data-status={profile.active?"active":"inactive"}>{statusLabel(profile)}</span></div><div className="user-access-summary"><span><small>Último acesso</small><b>{displayDate(profile.last_seen_at)}</b></span><span><small>Convite</small><b>{displayDate(profile.invited_at)}</b></span><span><small>Nível</small><b>{profile.role==="production"?"Operador":profile.role==="manager"?"Gerente":profile.role==="admin"?"Administrador":"Visualizador"}</b></span></div>
      <div className="user-v342-actions"><button type="button" title="Histórico de acesso" aria-label={`Histórico de acesso de ${profile.name||profile.email}`} onClick={()=>void openHistory(profile)}><AppIcon name="history"/></button><button type="button" title="Editar usuário" aria-label={`Editar ${profile.name||profile.email}`} disabled={!canManage} onClick={()=>setEditing(profile)}><AppIcon name="edit"/></button>{canManagePermissions&&profile.id!==currentUserId&&<button type="button" title="Permissões especiais" aria-label={`Permissões especiais de ${profile.name||profile.email}`} onClick={()=>setPermissionUser(profile)}><AppIcon name="shield"/></button>}{profile.invite_status==="pending"&&<button disabled={!canManage || !online || profileBusyId===profile.id} title="Reenviar convite" onClick={()=>onManageUser(profile,"resend_invite")}><AppIcon name="refresh"/></button>}{profile.invite_status==="pending"&&<button title="Cancelar convite" onClick={()=>window.confirm("Cancelar este convite?")&&onManageUser(profile,"cancel_invite")} disabled={!canManage||!online||profileBusyId===profile.id}><AppIcon name="close"/></button>}{profile.id!==currentUserId&&<button title={profile.active?"Inativar usuário":"Ativar usuário"} onClick={()=>window.confirm(`${profile.active?"Inativar":"Ativar"} ${profile.name||profile.email}?`)&&onManageUser(profile,profile.active?"deactivate":"activate")} disabled={!canManage||!online||profileBusyId===profile.id}>{profile.active?<AppIcon name="trash"/>:<AppIcon name="check"/>}</button>}</div></article>)}</div>
  </div>
  {editing&&<div className="overlay" onMouseDown={()=>!editBusy&&setEditing(null)}><form className="modal user-edit-modal" onSubmit={(event)=>void submitEdit(event)} onMouseDown={(event)=>event.stopPropagation()}><button type="button" className="close" onClick={()=>setEditing(null)}>×</button><p className="eyebrow">USUÁRIO</p><h2>Editar conta</h2><div className="user-edit-grid"><label>Nome<input name="name" defaultValue={editing.name} required/></label><label>Cargo exibido<input name="display_title" defaultValue={editing.display_title||""} placeholder="Ex.: Gerente de produção"/></label><label>Nível<select name="role" defaultValue={editing.role} disabled={editing.id===currentUserId}><option value="admin">Administrador</option><option value="manager">Gerente</option><option value="production">Operador</option><option value="viewer">Visualizador</option></select></label><label className="user-active-check"><input type="checkbox" name="active" defaultChecked={editing.active} disabled={editing.id===currentUserId}/> Conta ativa</label><label className="wide">Observação administrativa<textarea name="admin_notes" defaultValue={editing.admin_notes||""}/></label></div><div className="modal-actions"><button type="button" onClick={()=>setEditing(null)}>Cancelar</button><button type="submit" className="primary" disabled={editBusy}>{editBusy?"Salvando…":"Salvar usuário"}</button></div></form></div>}
  {historyUser&&<div className="overlay" onMouseDown={()=>setHistoryUser(null)}><section className="modal user-access-modal" onMouseDown={(event)=>event.stopPropagation()}><button type="button" className="close" onClick={()=>setHistoryUser(null)}>×</button><p className="eyebrow">HISTÓRICO DE ACESSO</p><h2>{historyUser.name||historyUser.email}</h2>{historyLoading?<p>Carregando acessos…</p>:history.length?<div className="access-history-list">{history.map((row)=><article key={row.id}><div><b>{displayDate(row.signed_in_at)}</b><small>{row.device_label||row.platform||"Dispositivo não identificado"}</small></div><div><span>Última atividade: {displayDate(row.last_seen_at)}</span><span>{row.signed_out_at?`Encerrada: ${displayDate(row.signed_out_at)}`:"Sessão sem encerramento registrado"}</span><span>Navegador: {browserLabel(row.user_agent)}</span><span>Duração aproximada: {sessionDuration(row)}</span></div></article>)}</div>:<div className="workspace-empty">Nenhum acesso registrado após a instalação desta versão.</div>}</section></div>}
  {permissionUser&&<UserPermissionOverridesModal profile={permissionUser} onClose={()=>setPermissionUser(null)}/>}
  </section>;
}


function UserPermissionOverridesModal({ profile, onClose }: { profile: Profile; onClose: () => void }) {
  const [values,setValues]=useState<Record<PermissionKey,"inherit"|"allow"|"deny">>(()=>Object.fromEntries(permissionCatalog.map((p)=>[p.key,"inherit"])) as Record<PermissionKey,"inherit"|"allow"|"deny">);
  const [loading,setLoading]=useState(true); const [saving,setSaving]=useState(false); const [message,setMessage]=useState("");
  useEffect(()=>{let active=true;void (async()=>{
    const {data:sessionData}=await supabase.auth.getSession();
    const token=sessionData.session?.access_token;
    if(!token){if(active){setMessage("Sessão expirada. Entre novamente.");setLoading(false)}return}
    const response=await fetch(`/api/admin/users/permissions?user_id=${encodeURIComponent(profile.id)}`,{headers:{authorization:`Bearer ${token}`}});
    const payload=await response.json().catch(()=>({})) as {overrides?:Array<{permission_key:PermissionKey;allowed:boolean}>;error?:string};
    if(!active)return;
    if(response.ok){setValues((current)=>{const next={...current};for(const row of payload.overrides||[])next[row.permission_key]=row.allowed?"allow":"deny";return next})}else setMessage(payload.error||"Não foi possível carregar as permissões especiais.");
    setLoading(false)
  })();return()=>{active=false}},[profile.id]);
  async function save(){
    setSaving(true);setMessage("");
    const {data:sessionData}=await supabase.auth.getSession();
    const token=sessionData.session?.access_token;
    if(!token){setSaving(false);setMessage("Sessão expirada. Entre novamente.");return}
    const response=await fetch("/api/admin/users/permissions",{method:"POST",headers:{authorization:`Bearer ${token}`,"content-type":"application/json"},body:JSON.stringify({user_id:profile.id,values})});
    const payload=await response.json().catch(()=>({})) as {message?:string;error?:string};
    setSaving(false);setMessage(response.ok?payload.message||"Permissões especiais atualizadas.":`Falha: ${payload.error||"Não foi possível salvar."}`)
  }
  return <div className="overlay" onMouseDown={()=>!saving&&onClose()}><section className="modal user-permissions-modal" onMouseDown={(e)=>e.stopPropagation()}><button type="button" className="close" onClick={onClose}>×</button><p className="eyebrow">EXCEÇÕES INDIVIDUAIS</p><h2>{profile.name||profile.email}</h2><p>Use somente quando este usuário precisar substituir o padrão do cargo. “Padrão do nível” remove a exceção.</p>{loading?<p>Carregando…</p>:<div className="user-override-list">{permissionCatalog.map((permission)=><label key={permission.key}><span><b>{permission.label}</b><small>{permission.module}</small></span><select value={values[permission.key]} onChange={(e)=>setValues((current)=>({...current,[permission.key]:e.target.value as "inherit"|"allow"|"deny"}))}><option value="inherit">Padrão do nível</option><option value="allow">Permitir</option><option value="deny">Negar</option></select></label>)}</div>}{message&&<div className="permissions-message">{message}</div>}<div className="modal-actions"><button type="button" onClick={onClose}>Fechar</button><button type="button" className="primary" disabled={loading||saving} onClick={()=>void save()}>{saving?"Salvando…":"Salvar exceções"}</button></div></section></div>;
}
