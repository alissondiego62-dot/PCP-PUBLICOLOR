"use client";

import { useEffect, useState } from "react";
import type { Profile, Sector } from "@/lib/pcp-types";
import { PlatformAdministrationSettings } from "@/components/PlatformAdministrationSettings";
import { GoogleDriveSettings } from "@/components/GoogleDriveSettings";
import { DataImportExportSettings } from "@/components/DataImportExportSettings";
import { IntegrationDiagnosticsPanel } from "@/components/IntegrationDiagnosticsPanel";
import { SystemVersionCard } from "@/components/SystemVersionCard";
import { OperationalSettingsPanel } from "@/components/OperationalSettingsPanel";
import { AdminAuditPanel } from "@/components/AdminAuditPanel";
import { SystemHealthPanel } from "@/components/SystemHealthPanel";
import { ThumbnailOptimizationPanel } from "@/components/ThumbnailOptimizationPanel";
import { AppIcon } from "@/components/ui/AppIcon";

type SettingsTab = "general" | "operation" | "integrations" | "data" | "diagnostics" | "infrastructure";
const tabs: Array<{ key: SettingsTab; label: string; icon: "settings" | "kanban" | "link" | "database" | "activity" | "shield" }> = [
  { key: "general", label: "Geral", icon: "settings" },
  { key: "operation", label: "Operação", icon: "kanban" },
  { key: "integrations", label: "Integrações", icon: "link" },
  { key: "data", label: "Dados", icon: "database" },
  { key: "diagnostics", label: "Diagnóstico", icon: "activity" },
  { key: "infrastructure", label: "Infraestrutura", icon: "shield" },
];

export function SettingsView({ userEmail, activeSectors, sectors, profiles, online, onImportComplete }: {
  userEmail: string;
  activeSectors: Sector[];
  sectors: Sector[];
  profiles: Profile[];
  online: boolean;
  onImportComplete: () => void;
}) {
  const [activeTab, setActiveTab] = useState<SettingsTab>("general");
  const [infraUnlocked, setInfraUnlocked] = useState(false);
  const [confirmation, setConfirmation] = useState("");

  useEffect(() => {
    const saved = window.sessionStorage.getItem("pcp-settings-tab") as SettingsTab | null;
    if (saved && tabs.some((tab) => tab.key === saved)) setActiveTab(saved);
  }, []);
  useEffect(() => { window.sessionStorage.setItem("pcp-settings-tab", activeTab); }, [activeTab]);

  return <section className="management-view settings-view settings-v34">
    <nav className="settings-tabs" aria-label="Categorias das configurações">{tabs.map((tab) => <button key={tab.key} type="button" className={activeTab === tab.key ? "active" : ""} onClick={() => setActiveTab(tab.key)}><AppIcon name={tab.icon}/><span>{tab.label}</span></button>)}</nav>

    {activeTab === "general" && <div className="settings-tab-content"><div className="settings-grid">
      <div className="settings-security-note">As credenciais não são exibidas no navegador. Esta área é restrita aos administradores.</div>
      <article className="settings-card"><AppIcon name="user"/><div><small>CONTA ADMINISTRADORA</small><b>{userEmail}</b><p>Acesso autenticado pelo Supabase.</p></div></article>
      <article className="settings-card"><AppIcon name="database"/><div><small>BANCO DE DADOS</small><b>Supabase conectado</b><p>Pedidos, atividades, agenda e histórico sincronizados.</p></div></article>
      <article className="settings-card"><AppIcon name="kanban"/><div><small>SETORES ATIVOS</small><b>{activeSectors.length} setores</b><p>A ordem segue a configuração operacional.</p></div></article>
      <article className="settings-card"><AppIcon name={online ? "check" : "alert"}/><div><small>STATUS DO SISTEMA</small><b>{online ? "Operacional" : "Offline · leitura local"}</b><p>{online ? "Interface e serviços disponíveis." : "Aguardando a conexão retornar."}</p></div></article>
    </div><SystemHealthPanel/><SystemVersionCard /></div>}

    {activeTab === "operation" && <div className="settings-tab-content">{online ? <OperationalSettingsPanel sectors={sectors} profiles={profiles}/> : <OfflineMessage/>}</div>}
    {activeTab === "integrations" && <div className="settings-tab-content">{online ? <><GoogleDriveSettings/><ThumbnailOptimizationPanel/></> : <OfflineMessage/>}</div>}
    {activeTab === "data" && <div className="settings-tab-content">{online ? <DataImportExportSettings sectors={sectors} onImportComplete={onImportComplete}/> : <OfflineMessage/>}</div>}
    {activeTab === "diagnostics" && <div className="settings-tab-content">{online ? <><IntegrationDiagnosticsPanel/><AdminAuditPanel/></> : <OfflineMessage/>}</div>}
    {activeTab === "infrastructure" && <div className="settings-tab-content infrastructure-tab">{!online ? <OfflineMessage/> : !infraUnlocked ? <section className="infrastructure-lock"><AppIcon name="shield"/><h2>Área de alto risco</h2><p>Esta área altera ambiente, banco, variáveis e SQL. Digite <b>PUBLICOLOR</b> para liberar durante esta sessão.</p><label><span>Confirmação</span><input value={confirmation} onChange={(event) => setConfirmation(event.target.value.toLocaleUpperCase("pt-BR"))} placeholder="PUBLICOLOR"/></label><button type="button" className="danger" disabled={confirmation !== "PUBLICOLOR"} onClick={() => setInfraUnlocked(true)}>Liberar infraestrutura</button></section> : <><div className="infrastructure-warning"><AppIcon name="alert"/><div><b>Operações sensíveis liberadas</b><p>Confirme o ambiente, tenha backup e registre o motivo antes de qualquer alteração.</p></div><button type="button" onClick={() => { setInfraUnlocked(false); setConfirmation(""); }}>Bloquear novamente</button></div><PlatformAdministrationSettings/></>}</div>}
  </section>;
}

function OfflineMessage() { return <div className="settings-security-note">Modo offline: esta categoria fica disponível quando a conexão retornar.</div>; }
