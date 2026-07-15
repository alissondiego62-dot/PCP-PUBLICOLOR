import { getSupabaseAdmin, type AuthorizedAppUser } from "@/lib/server/supabase-server";

type SystemEventInput = {
  kind?: "integration" | "frontend_error" | "api_error" | "system";
  level?: "info" | "warning" | "error";
  source: string;
  action: string;
  status?: string;
  message: string;
  orderId?: string | null;
  durationMs?: number | null;
  metadata?: Record<string, unknown>;
  actor?: AuthorizedAppUser | null;
};

const SECRET_PATTERN = /(token|secret|password|authorization|apikey|api_key|credential)/i;

function sanitize(value: unknown): unknown {
  if (Array.isArray(value)) return value.slice(0, 50).map(sanitize);
  if (!value || typeof value !== "object") {
    if (typeof value === "string") return value.slice(0, 2000);
    return value;
  }
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !SECRET_PATTERN.test(key))
      .slice(0, 60)
      .map(([key, item]) => [key, sanitize(item)]),
  );
}

export async function logSystemEvent(input: SystemEventInput) {
  try {
    const admin = getSupabaseAdmin();
    await admin.from("system_observability_events").insert({
      kind: input.kind || "system",
      level: input.level || "info",
      source: input.source,
      action: input.action,
      status: input.status || null,
      message: input.message.slice(0, 2000),
      order_id: input.orderId || null,
      user_id: input.actor?.user.id || null,
      actor_email: input.actor?.email || null,
      duration_ms: input.durationMs ?? null,
      metadata: sanitize(input.metadata || {}),
    });
  } catch (error) {
    console.error("Falha ao registrar evento de observabilidade", error);
  }
}
