"use client";

import { useEffect, useState } from "react";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

const DISMISS_KEY = "pcp-publicolor-pwa-dismissed-at";
const DISMISS_INTERVAL = 7 * 24 * 60 * 60 * 1000;

function isStandaloneMode() {
  const iosStandalone = Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone);
  return window.matchMedia("(display-mode: standalone)").matches || iosStandalone;
}

export function PwaInstallPrompt() {
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [isIos, setIsIos] = useState(false);
  const [standalone, setStandalone] = useState(false);
  const [visible, setVisible] = useState(false);
  const [showIosInstructions, setShowIosInstructions] = useState(false);
  const installLabel = isIos ? "Como adicionar" : "Instalar";

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/service-worker.js").catch((error) => {
        console.warn("Não foi possível registrar o service worker:", error);
      });
    }

    const installed = isStandaloneMode();
    // Estado determinado exclusivamente no navegador após a hidratação.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStandalone(installed);
    if (installed) return;

    const dismissedAt = Number(window.localStorage.getItem(DISMISS_KEY) || 0);
    if (dismissedAt && Date.now() - dismissedAt < DISMISS_INTERVAL) return;

    const mobileViewport = window.matchMedia("(max-width: 1100px)");
    const iosDevice = /iphone|ipad|ipod/i.test(window.navigator.userAgent)
      || (window.navigator.platform === "MacIntel" && window.navigator.maxTouchPoints > 1);
    // Detecção de plataforma usada apenas para adaptar a instrução de instalação.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsIos(iosDevice);

    const handleInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
      if (mobileViewport.matches) setVisible(true);
    };

    const handleInstalled = () => {
      setStandalone(true);
      setVisible(false);
      setInstallPrompt(null);
      window.localStorage.removeItem(DISMISS_KEY);
    };

    window.addEventListener("beforeinstallprompt", handleInstallPrompt);
    window.addEventListener("appinstalled", handleInstalled);

    const iosTimer = iosDevice && mobileViewport.matches
      ? window.setTimeout(() => setVisible(true), 1400)
      : null;

    return () => {
      window.removeEventListener("beforeinstallprompt", handleInstallPrompt);
      window.removeEventListener("appinstalled", handleInstalled);
      if (iosTimer) window.clearTimeout(iosTimer);
    };
  }, []);

  function dismiss() {
    window.localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setVisible(false);
    setShowIosInstructions(false);
  }

  async function install() {
    if (isIos) {
      setShowIosInstructions(true);
      return;
    }

    if (!installPrompt) return;
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === "accepted") setVisible(false);
    setInstallPrompt(null);
  }

  if (!visible || standalone) return null;

  return (
    <aside className="pwa-install-prompt" aria-label="Instalar Publicolor na tela inicial">
      <button type="button" className="pwa-install-close" aria-label="Fechar aviso de instalação" onClick={dismiss}>×</button>
      <img src="/icons/publicolor-192.png" alt="" width={48} height={48} />
      <div className="pwa-install-copy">
        <strong>Publicolor no celular</strong>
        <span>Adicione o PCP à tela inicial para abrir como aplicativo.</span>
      </div>
      <button type="button" className="pwa-install-button" onClick={() => void install()}>{installLabel}</button>
      {showIosInstructions && <div className="pwa-ios-instructions" role="status">
        No Safari, toque em <b>Compartilhar</b> e depois em <b>Adicionar à Tela de Início</b>.
      </div>}
    </aside>
  );
}
