export const runtime = "nodejs";

import { testTargetSupabase } from "@/lib/server/platform-settings";
import { requireAppUser, responseMessage } from "@/lib/server/supabase-server";

export async function POST(request: Request) {
  try {
    const actor = await requireAppUser(request, ["admin"]);
    const body = await request.json() as {
      supabase_url?: string;
      publishable_key?: string;
      service_role_key?: string;
      project_ref?: string;
    };
    const result = await testTargetSupabase({
      supabaseUrl: String(body.supabase_url || ""),
      publishableKey: String(body.publishable_key || ""),
      serviceRoleKey: String(body.service_role_key || ""),
      projectRef: String(body.project_ref || ""),
    }, actor.email);
    return Response.json(result);
  } catch (error) {
    return responseMessage(error);
  }
}
