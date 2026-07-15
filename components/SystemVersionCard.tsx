"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type BuildInfo = {
  version: string;
  commit: string;
  branch: string;
  environment: string;
  deploymentUrl: string | null;
  builtAt: string | null;
};

export function SystemVersionCard() {
  const [info, setInfo] = useState<BuildInfo | null>(null);

  useEffect(() => {
    let active = true;
    void supabase.auth.getSession().then(async ({ data }) => {
      const token = data.session?.access_token;
      if (!token) return;
      const response = await fetch("/api/system/version", { headers: { authorization: `Bearer ${token}` } });
      if (!response.ok) return;
      const payload = await response.json() as BuildInfo;
      if (active) setInfo(payload);
    });
    return () => { active = false; };
  }, []);

  return <article className="system-version-card">
    <div><small>VERSÃO DO SISTEMA</small><b>Publicolor PCP {info?.version || "…"}</b></div>
    <dl>
      <div><dt>Ambiente</dt><dd>{info?.environment || "Carregando"}</dd></div>
      <div><dt>Branch</dt><dd>{info?.branch || "—"}</dd></div>
      <div><dt>Commit</dt><dd>{info?.commit ? info.commit.slice(0, 9) : "—"}</dd></div>
    </dl>
  </article>;
}
