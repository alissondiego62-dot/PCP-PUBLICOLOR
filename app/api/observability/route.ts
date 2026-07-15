export const runtime = "nodejs";

import { requireAppUser, responseMessage } from "@/lib/server/supabase-server";
import { logSystemEvent } from "@/lib/server/observability";

export async function POST(request: Request) {
  try {
    const actor = await requireAppUser(request);
    const body = await request.json().catch(() => ({})) as {
      level?: "info" | "warning" | "error";
      source?: string;
      action?: string;
      message?: string;
      orderId?: string | null;
      metadata?: Record<string, unknown>;
      correlationId?: string;
      route?: string;
    };

    if (!body.source || !body.action || !body.message) {
      return Response.json({ error: "Evento incompleto." }, { status: 400 });
    }

    await logSystemEvent({
      kind: body.level === "error" ? "frontend_error" : "system",
      level: body.level || "info",
      source: body.source,
      action: body.action,
      message: body.message,
      orderId: body.orderId,
      metadata: body.metadata,
      correlationId: body.correlationId,
      route: body.route,
      actor,
    });

    return Response.json({ ok: true, correlation_id: body.correlationId || null }, { headers: body.correlationId ? { "x-correlation-id": body.correlationId } : undefined });
  } catch (error) {
    return responseMessage(error);
  }
}
