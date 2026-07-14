export const runtime = "nodejs";

import { testVercelConnection } from "@/lib/server/platform-settings";
import { requireAppUser, responseMessage } from "@/lib/server/supabase-server";

export async function POST(request: Request) {
  try {
    await requireAppUser(request, ["admin"]);
    const result = await testVercelConnection();
    return Response.json({ ok: true, message: `Vercel conectada ao projeto ${result.project_name}.`, ...result });
  } catch (error) {
    return responseMessage(error);
  }
}
