"use client";

import { useEffect, useMemo, useState } from "react";
import type { Profile, Sector } from "@/lib/pcp-types";
import { supabase } from "@/lib/supabase";
import { AppIcon } from "@/components/ui/AppIcon";

type OperationalSettings = {
  purchase_deadline_hours: number;
  installation_daily_capacity: number;
  thumbnail_background_mode: "always" | "wifi" | "visible_only";
  default_purchase_responsible_id: string | null;
};

const defaults: OperationalSettings = {
  purchase_deadline_hours: 24,
  installation_daily_capacity: 8,
  thumbnail_background_mode: "wifi",
  default_purchase_responsible_id: null,
};

export function OperationalSettingsPanel({ sectors, profiles }: { sectors: Sector[]; profiles: Profile[] }) {
  const [settings, setSettings] = useState<OperationalSettings>(defaults);
  const [limits, setLimits] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const activeProfiles = useMemo(() => profiles.filter((profile) => profile.active), [profiles]);

  useEffect(() => {
    let active = true;
    void Promise.all([
      supabase.from("operational_settings").select("setting_key,setting_value"),
      supabase.from("sectors").select("id,wip_limit"),
    ]).then(([settingsResult, sectorResult]) => {
      if (!active) return;
      const next = { ...defaults };
      for (const row of settingsResult.data || []) {
        const key = row.setting_key as keyof OperationalSettings;
        if (key in next) (next as Record<string, unknown>)[key] = row.setting_value;
      }
      setSettings(next);
      setLimits(Object.fromEntries((sectorResult.data || []).map((row) => [row.id, row.wip_limit == null ? "" : String(row.wip_limit)])));
      setLoading(false);
    });
    return () => { active = false; };
  }, []);

  async function save() {
    if (saving) return;
    setSaving(true); setMessage("");
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session?.user.id;
    const rows = Object.entries(settings).map(([setting_key, setting_value]) => ({ setting_key, setting_value, updated_by: userId }));
    const settingsResult = await supabase.from("operational_settings").upsert(rows, { onConflict: "setting_key" });
    const sectorResults = await Promise.all(sectors.map((sector) => supabase.from("sectors").update({ wip_limit: limits[sector.id] ? Number(limits[sector.id]) : null }).eq("id", sector.id)));
    const sectorError = sectorResults.find((result) => result.error)?.error;
    if (settingsResult.error || sectorError) setMessage(`Erro: ${settingsResult.error?.message || sectorError?.message}`);
    else setMessage("Configurações operacionais salvas.");
    setSaving(false);
  }

  if (loading) return <div className="settings-loading"><span className="app-spinner"/> Carregando configurações operacionais…</div>;

  return <section className="settings-module operational-settings-panel">
    <header><div><small>OPERAÇÃO</small><h2>Regras e capacidade</h2><p>Centralize prazos, carregamento móvel e limites visuais do Kanban.</p></div><button type="button" className="primary" onClick={() => void save()} disabled={saving}><AppIcon name="check"/>{saving ? " Salvando…" : " Salvar alterações"}</button></header>
    <div className="operational-settings-grid">
      <label><span>Prazo padrão de compras</span><div className="field-with-suffix"><input type="number" min="1" max="720" value={settings.purchase_deadline_hours} onChange={(event) => setSettings((current) => ({ ...current, purchase_deadline_hours: Number(event.target.value) }))}/><b>horas</b></div><small>Usado ao criar uma compra automática.</small></label>
      <label><span>Capacidade diária de instalações</span><div className="field-with-suffix"><input type="number" min="1" max="100" value={settings.installation_daily_capacity} onChange={(event) => setSettings((current) => ({ ...current, installation_daily_capacity: Number(event.target.value) }))}/><b>itens</b></div><small>Gera alerta quando a agenda ultrapassa este limite.</small></label>
      <label><span>Responsável padrão de compras</span><select value={settings.default_purchase_responsible_id || ""} onChange={(event) => setSettings((current) => ({ ...current, default_purchase_responsible_id: event.target.value || null }))}><option value="">Usuário que criou</option>{activeProfiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name || profile.email}</option>)}</select><small>Pode ser alterado em cada atividade.</small></label>
      <label><span>Miniaturas em segundo plano</span><select value={settings.thumbnail_background_mode} onChange={(event) => setSettings((current) => ({ ...current, thumbnail_background_mode: event.target.value as OperationalSettings["thumbnail_background_mode"] }))}><option value="always">Sempre carregar todas</option><option value="wifi">Preferir Wi-Fi</option><option value="visible_only">Somente visíveis e próximas</option></select><small>Reduz consumo em celulares quando necessário.</small></label>
    </div>
    <div className="sector-capacity-settings"><h3>Limite de trabalho por setor</h3><p>Deixe vazio para não limitar. O Kanban apenas alerta; não bloqueia movimentações.</p><div>{sectors.filter((sector) => sector.active).map((sector) => <label key={sector.id}><span>{sector.name}</span><input aria-label={`Limite do setor ${sector.name}`} type="number" min="1" max="999" placeholder="Sem limite" value={limits[sector.id] || ""} onChange={(event) => setLimits((current) => ({ ...current, [sector.id]: event.target.value }))}/></label>)}</div></div>
    {message && <p className={message.startsWith("Erro") ? "settings-message error" : "settings-message success"}>{message}</p>}
  </section>;
}
