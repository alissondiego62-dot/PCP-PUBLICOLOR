export const runtime = "nodejs";

import { clearDriveTokens, revokeDriveToken } from "@/lib/server/google-drive";
import { requireAppUser, responseMessage } from "@/lib/server/supabase-server";

export async function POST(request: Request) {
  try {
    const actor = await requireAppUser(request, ["admin"]);
    await revokeDriveToken();
    await clearDriveTokens(actor.user.id);
    return Response.json({ ok: true, message: "Conta Google desconectada." });
  } catch (error) {
    return responseMessage(error);
  }
}
