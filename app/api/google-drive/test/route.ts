export const runtime = "nodejs";

import { testDriveConnection } from "@/lib/server/google-drive";
import { requireAppUser, responseMessage } from "@/lib/server/supabase-server";

export async function POST(request: Request) {
  try {
    await requireAppUser(request, ["admin"]);
    const result = await testDriveConnection();
    return Response.json({ ok: true, message: "Conexão validada e pasta principal disponível.", ...result });
  } catch (error) {
    return responseMessage(error);
  }
}
