export const runtime = "nodejs";

import { getDriveSettings } from "@/lib/server/google-drive";
import { requireAppUser, responseMessage } from "@/lib/server/supabase-server";

export async function GET(request: Request) {
  try {
    await requireAppUser(request);
    const settings = await getDriveSettings();
    return Response.json({
      enabled: settings.enabled,
      connected: Boolean(settings.refresh_token_ciphertext && settings.connected_email),
      connected_email: settings.connected_email,
      root_folder_name: settings.root_folder_name,
      root_folder_id: settings.root_folder_id,
      root_folder_url: settings.root_folder_id
        ? `https://drive.google.com/drive/folders/${settings.root_folder_id}`
        : null,
    });
  } catch (error) {
    return responseMessage(error);
  }
}
