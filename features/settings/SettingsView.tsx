"use client";

import type { Client, Order, Sector } from "@/lib/pcp-types";
import { PlatformAdministrationSettings } from "@/components/PlatformAdministrationSettings";
import { GoogleDriveSettings } from "@/components/GoogleDriveSettings";
import { DataImportExportSettings } from "@/components/DataImportExportSettings";
import { IntegrationDiagnosticsPanel } from "@/components/IntegrationDiagnosticsPanel";
import { SystemVersionCard } from "@/components/SystemVersionCard";

export function SettingsView({ userEmail, activeSectors, orders, clients, sectors, online, onImportComplete }: {
  userEmail: string;
  activeSectors: Sector[];
  orders: Order[];
  clients: Client[];
  sectors: Sector[];
  online: boolean;
  onImportComplete: () => void;
}) {
  return <section className="management-view settings-view">
    <div className="settings-grid">
      <div className="settings-security-note">🔒 Os dados de conexão ficam protegidos na hospedagem e não são exibidos no navegador. Somente administradores visualizam esta área.</div>
      <article className="settings-card"><span className="settings-icon">◉</span><div><small>CONTA ADMINISTRADORA</small><b>{userEmail}</b><p>Seu acesso está autenticado e protegido pelo Supabase.</p></div></article>
      <article className="settings-card"><span className="settings-icon">◆</span><div><small>BANCO DE DADOS</small><b>Supabase conectado</b><p>Pedidos, comentários, agenda e histórico estão sincronizados.</p></div></article>
      <article className="settings-card"><span className="settings-icon">▦</span><div><small>SETORES ATIVOS</small><b>{activeSectors.length} setores</b><p>A ordem dos setores segue a configuração do banco.</p></div></article>
      <article className="settings-card"><span className="settings-icon">✓</span><div><small>STATUS DO SISTEMA</small><b>{online ? "Operacional" : "Offline · somente leitura"}</b><p>{online ? "Interface e serviços carregados corretamente." : "Exibindo a cópia local até a conexão retornar."}</p></div></article>
    </div>
    <SystemVersionCard />
    {online ? <>
      <IntegrationDiagnosticsPanel />
      <PlatformAdministrationSettings />
      <GoogleDriveSettings />
      <DataImportExportSettings orders={orders} clients={clients} sectors={sectors} onImportComplete={onImportComplete} />
    </> : <div className="settings-security-note">Modo offline: configurações e integrações ficam disponíveis somente para consulta quando a conexão retornar.</div>}
  </section>;
}
