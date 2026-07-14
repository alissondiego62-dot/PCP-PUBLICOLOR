export const runtime = "nodejs";

import { randomBytes } from "node:crypto";
import {
  DRIVE_SCOPES,
  driveCredentials,
  getDriveSettings,
} from "@/lib/server/google-drive";
import { hashOauthState } from "@/lib/server/drive-crypto";
import {
  getSupabaseAdmin,
  requestOrigin,
  requireAppUser,
  responseMessage,
} from "@/lib/server/supabase-server";

export async function POST(request: Request) {
  try {
    const actor = await requireAppUser(request, ["admin"]);
    const settings = await getDriveSettings();
    const { clientId } = driveCredentials(settings);
    if (!settings.enabled) {
      return Response.json({ error: "Ative a integração antes de conectar a conta Google." }, { status: 400 });
    }

    const origin = requestOrigin(request);
    const callback = `${origin}/api/google-drive/callback`;
    const returnTo = `${origin}/?view=settings`;
    const state = randomBytes(32).toString("base64url");
    const stateHash = hashOauthState(state);
    const admin = getSupabaseAdmin();

    await admin.from("google_drive_oauth_states").delete().lt("expires_at", new Date().toISOString());
    const { error } = await admin.from("google_drive_oauth_states").insert({
      state_hash: stateHash,
      user_id: actor.user.id,
      redirect_uri: callback,
      return_to: returnTo,
      expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    });
    if (error) throw new Error(`Não foi possível iniciar a autorização: ${error.message}`);

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: callback,
      response_type: "code",
      scope: DRIVE_SCOPES.join(" "),
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: "true",
      state,
    });
    if (settings.account_email) params.set("login_hint", settings.account_email);

    return Response.json({ url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}` });
  } catch (error) {
    return responseMessage(error);
  }
}
