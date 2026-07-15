"use client";

import { useEffect } from "react";
import { reportClientEvent } from "@/services/observability-client";

export function useObservability() {
  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      void reportClientEvent({
        level: "error",
        source: "frontend",
        action: "window.error",
        message: event.message || "Erro não identificado no navegador.",
        metadata: {
          file: event.filename,
          line: event.lineno,
          column: event.colno,
          route: window.location.pathname,
        },
      });
    };

    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      const message = event.reason instanceof Error
        ? event.reason.message
        : String(event.reason || "Promise rejeitada sem motivo informado.");
      void reportClientEvent({
        level: "error",
        source: "frontend",
        action: "unhandledrejection",
        message,
        metadata: { route: window.location.pathname },
      });
    };

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onUnhandledRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
    };
  }, []);
}
