"use client";

import { useEffect, useState } from "react";
import { AppIcon } from "@/components/ui/AppIcon";

export function PwaUpdatePrompt() {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    let registration: ServiceWorkerRegistration | null = null;
    let reloading = false;
    const controllerChanged = () => {
      if (reloading) return;
      reloading = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", controllerChanged);
    void navigator.serviceWorker.register("/service-worker.js").then((nextRegistration) => {
      registration = nextRegistration;
      if (registration.waiting) setWaiting(registration.waiting);
      registration.addEventListener("updatefound", () => {
        const worker = registration?.installing;
        if (!worker) return;
        worker.addEventListener("statechange", () => {
          if (worker.state === "installed" && navigator.serviceWorker.controller) setWaiting(worker);
        });
      });
      void registration.update();
    }).catch(() => undefined);
    const interval = window.setInterval(() => { void registration?.update(); }, 30 * 60 * 1000);
    return () => {
      window.clearInterval(interval);
      navigator.serviceWorker.removeEventListener("controllerchange", controllerChanged);
    };
  }, []);

  function updateNow() {
    if (!waiting) return;
    setUpdating(true);
    waiting.postMessage({ type: "SKIP_WAITING" });
  }

  if (!waiting) return null;
  return <aside className="pwa-update-prompt" role="status"><AppIcon name="refresh"/><div><b>Nova versão disponível</b><span>A página atual será preservada após a atualização.</span></div><button type="button" onClick={updateNow} disabled={updating}>{updating ? "Atualizando…" : "Atualizar agora"}</button></aside>;
}
