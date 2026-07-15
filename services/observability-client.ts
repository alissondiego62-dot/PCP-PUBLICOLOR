"use client";

import { supabase } from "@/lib/supabase";

type ClientEvent = {
  level?: "info" | "warning" | "error";
  source: string;
  action: string;
  message: string;
  orderId?: string | null;
  metadata?: Record<string, unknown>;
};

const SECRET_PATTERN = /(token|secret|password|authorization|apikey|api_key)/i;

function sanitize(value: unknown): unknown {
  if (Array.isArray(value)) return value.slice(0, 30).map(sanitize);
  if (!value || typeof value !== "object") {
    if (typeof value === "string") return value.slice(0, 1000);
    return value;
  }
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !SECRET_PATTERN.test(key))
      .slice(0, 40)
      .map(([key, item]) => [key, sanitize(item)]),
  );
}

export async function reportClientEvent(event: ClientEvent) {
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return;
    await fetch("/api/observability", {
      method: "POST",
      keepalive: true,
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ ...event, metadata: sanitize(event.metadata || {}) }),
    });
  } catch {
    // Telemetria nunca deve interromper o fluxo principal.
  }
}
