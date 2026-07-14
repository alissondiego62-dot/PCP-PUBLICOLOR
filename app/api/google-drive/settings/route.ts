export const runtime = "nodejs";

import {
  getDriveSettings,
  publicDriveSettings,
  saveDriveSettings,
} from "@/lib/server/google-drive";
import {
  requestOrigin,
  requireAppUser,
  responseMessage,
} from "@/lib/server/supabase-server";

function redirectUri(request: Request) {
  return `${requestOrigin(request)}/api/google-drive/callback`;
}

export async function GET(request: Request) {
  try {
    await requireAppUser(request, ["admin"]);
    const settings = await getDriveSettings();
    return Response.json(publicDriveSettings(settings, redirectUri(request)));
  } catch (error) {
    return responseMessage(error);
  }
}

export async function PUT(request: Request) {
  try {
    const actor = await requireAppUser(request, ["admin"]);
    const body = await request.json() as {
      account_email?: string;
      oauth_client_id?: string;
      oauth_client_secret?: string;
      root_folder_name?: string;
      enabled?: boolean;
    };

    const accountEmail = String(body.account_email || "").trim().toLowerCase();
    const clientId = String(body.oauth_client_id || "").trim();
    const clientSecret = String(body.oauth_client_secret || "").trim();
    const rootFolderName = String(body.root_folder_name || "PUBLICOLOR - SISTEMA PCP").trim();

    if (accountEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(accountEmail)) {
      return Response.json({ error: "Informe um e-mail Google válido." }, { status: 400 });
    }
    if (clientId && !clientId.endsWith(".apps.googleusercontent.com")) {
      return Response.json({ error: "O Client ID deve terminar em .apps.googleusercontent.com." }, { status: 400 });
    }
    if (!rootFolderName) {
      return Response.json({ error: "Informe o nome da pasta principal do Drive." }, { status: 400 });
    }

    const saved = await saveDriveSettings({
      accountEmail,
      clientId,
      clientSecret: clientSecret || undefined,
      rootFolderName,
      enabled: body.enabled !== false,
      userId: actor.user.id,
    });

    return Response.json({
      ok: true,
      message: "Configurações do Google Drive salvas.",
      settings: publicDriveSettings(saved, redirectUri(request)),
    });
  } catch (error) {
    return responseMessage(error);
  }
}
