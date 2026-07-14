export const runtime = "nodejs";

import {
  getPlatformSettings,
  publicPlatformSettings,
  savePlatformSettings,
} from "@/lib/server/platform-settings";
import { requireAppUser, responseMessage } from "@/lib/server/supabase-server";

export async function GET(request: Request) {
  try {
    await requireAppUser(request, ["admin"]);
    const settings = await getPlatformSettings();
    return Response.json(publicPlatformSettings(settings), { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return responseMessage(error);
  }
}

export async function PUT(request: Request) {
  try {
    const actor = await requireAppUser(request, ["admin"]);
    const body = await request.json() as {
      vercel_project_id?: string;
      vercel_team_id?: string;
      vercel_access_token?: string;
      deploy_hook_url?: string;
      supabase_project_ref?: string;
      supabase_management_token?: string;
    };

    const saved = await savePlatformSettings({
      vercelProjectId: String(body.vercel_project_id || ""),
      vercelTeamId: String(body.vercel_team_id || ""),
      vercelAccessToken: String(body.vercel_access_token || ""),
      deployHookUrl: String(body.deploy_hook_url || ""),
      supabaseProjectRef: String(body.supabase_project_ref || ""),
      supabaseManagementToken: String(body.supabase_management_token || ""),
      userId: actor.user.id,
    });

    return Response.json({
      ok: true,
      message: "Credenciais administrativas salvas com segurança.",
      settings: publicPlatformSettings(saved),
    });
  } catch (error) {
    return responseMessage(error);
  }
}
