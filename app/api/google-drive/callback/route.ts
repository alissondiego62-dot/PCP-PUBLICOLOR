export const runtime = "nodejs";

import {
  driveCredentials,
  getDriveSettings,
  storeDriveTokens,
  testDriveConnection,
} from "@/lib/server/google-drive";
import { hashOauthState } from "@/lib/server/drive-crypto";
import { getSupabaseAdmin, requestOrigin } from "@/lib/server/supabase-server";

function redirectWithResult(returnTo: string, status: "connected" | "error", message?: string) {
  const url = new URL(returnTo);
  url.searchParams.set("drive", status);
  if (message) url.searchParams.set("drive_message", message.slice(0, 240));
  return Response.redirect(url, 302);
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const state = requestUrl.searchParams.get("state") || "";
  const code = requestUrl.searchParams.get("code") || "";
  const googleError = requestUrl.searchParams.get("error") || "";
  const fallback = `${requestOrigin(request)}/?view=settings`;

  if (!state) return redirectWithResult(fallback, "error", "Estado de autorização ausente.");

  const admin = getSupabaseAdmin();
  const stateHash = hashOauthState(state);
  const { data: storedState } = await admin
    .from("google_drive_oauth_states")
    .select("state_hash,user_id,redirect_uri,return_to,expires_at")
    .eq("state_hash", stateHash)
    .maybeSingle();

  if (!storedState) return redirectWithResult(fallback, "error", "Autorização inválida ou já utilizada.");
  await admin.from("google_drive_oauth_states").delete().eq("state_hash", stateHash);

  const returnTo = storedState.return_to || fallback;
  if (new Date(storedState.expires_at).getTime() < Date.now()) {
    return redirectWithResult(returnTo, "error", "A autorização expirou. Tente conectar novamente.");
  }
  if (googleError) {
    return redirectWithResult(returnTo, "error", googleError === "access_denied" ? "A autorização foi cancelada." : `Google: ${googleError}`);
  }
  if (!code) return redirectWithResult(returnTo, "error", "Código de autorização não recebido.");

  try {
    const settings = await getDriveSettings();
    const { clientId, clientSecret } = driveCredentials(settings);
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: storedState.redirect_uri,
        grant_type: "authorization_code",
      }),
    });
    const tokenPayload = await tokenResponse.json() as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      error_description?: string;
    };
    if (!tokenResponse.ok || !tokenPayload.access_token) {
      throw new Error(tokenPayload.error_description || "O Google não retornou o token de acesso necessário. Tente autorizar novamente.");
    }

    const userInfoResponse = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
      headers: { authorization: `Bearer ${tokenPayload.access_token}` },
    });
    const userInfo = await userInfoResponse.json() as { email?: string; email_verified?: boolean };
    if (!userInfoResponse.ok || !userInfo.email) throw new Error("Não foi possível confirmar o e-mail da conta Google.");

    const expectedEmail = settings.account_email.trim().toLowerCase();
    const connectedEmail = userInfo.email.trim().toLowerCase();
    if (expectedEmail && expectedEmail !== connectedEmail) {
      await fetch("https://oauth2.googleapis.com/revoke", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token: tokenPayload.refresh_token || tokenPayload.access_token }),
      }).catch(() => null);
      throw new Error(`A conta autorizada foi ${connectedEmail}. Use ${expectedEmail} ou altere o e-mail nas Configurações.`);
    }

    await storeDriveTokens({
      accessToken: tokenPayload.access_token,
      refreshToken: tokenPayload.refresh_token,
      expiresIn: tokenPayload.expires_in || 3600,
      connectedEmail,
      userId: storedState.user_id,
    });
    await testDriveConnection();
    return redirectWithResult(returnTo, "connected", `Google Drive conectado à conta ${connectedEmail}.`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao conectar o Google Drive.";
    return redirectWithResult(returnTo, "error", message);
  }
}
