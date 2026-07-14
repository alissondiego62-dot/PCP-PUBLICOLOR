export const runtime = "nodejs";

import { applyEnvironmentChange } from "@/lib/server/platform-settings";
import { requireAppUser, responseMessage } from "@/lib/server/supabase-server";

export async function POST(request: Request) {
  try {
    const actor = await requireAppUser(request, ["admin"]);
    const body = await request.json() as {
      confirmation?: string;
      supabase_url?: string;
      publishable_key?: string;
      service_role_key?: string;
      project_ref?: string;
      app_url?: string;
    };
    if (String(body.confirmation || "").trim().toUpperCase() !== "TROCAR BANCO") {
      return Response.json({ error: "Digite TROCAR BANCO para confirmar a alteração." }, { status: 400 });
    }

    const result = await applyEnvironmentChange({
      target: {
        supabaseUrl: String(body.supabase_url || ""),
        publishableKey: String(body.publishable_key || ""),
        serviceRoleKey: String(body.service_role_key || ""),
        projectRef: String(body.project_ref || ""),
      },
      appUrl: String(body.app_url || ""),
      actor,
    });
    return Response.json({ ok: true, ...result });
  } catch (error) {
    return responseMessage(error);
  }
}
