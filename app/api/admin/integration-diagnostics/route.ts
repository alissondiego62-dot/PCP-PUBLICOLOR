export const runtime = "nodejs";

import { getDriveSettings } from "@/lib/server/google-drive";
import { getSupabaseAdmin, requireAppUser, responseMessage } from "@/lib/server/supabase-server";

type EventRow = {
  id: string; kind: string; level: string; source: string; action: string; status: string | null;
  message: string; order_id: string | null; actor_email: string | null; duration_ms: number | null;
  metadata: Record<string, unknown>; created_at: string;
};
type UploadSessionRow = { id: string; order_id: string; file_name: string; expires_at: string; created_at: string; };

export async function GET(request: Request) {
  try {
    await requireAppUser(request, ["admin"]);
    const admin = getSupabaseAdmin();
    const [eventsResult, sessionsResult, missingOpResult, driveSettings] = await Promise.all([
      admin
        .from("system_observability_events")
        .select("id,kind,level,source,action,status,message,order_id,actor_email,duration_ms,metadata,created_at")
        .order("created_at", { ascending: false })
        .limit(80),
      admin
        .from("google_drive_upload_sessions")
        .select("id,order_id,file_name,expires_at,created_at")
        .order("created_at", { ascending: false })
        .limit(30),
      admin
        .from("order_files")
        .select("id,file_name,origin,created_at")
        .is("order_id", null)
        .order("created_at", { ascending: false })
        .limit(30),
      getDriveSettings().catch(() => null),
    ]);

    const events = (eventsResult.error ? [] : eventsResult.data || []) as EventRow[];
    const sessions = (sessionsResult.error ? [] : sessionsResult.data || []) as UploadSessionRow[];
    const latestZipAnalysis = events.find((event) => event.source === "thumbnail_zip" && event.action === "analyze");
    const unmatchedFromLatestZip = Array.isArray(latestZipAnalysis?.metadata?.unmatchedFiles)
      ? latestZipAnalysis.metadata.unmatchedFiles.map((item) => String(item)).slice(0, 50)
      : [];
    const databaseOrphans = missingOpResult.error ? [] : missingOpResult.data || [];
    const missingOrderFiles = [
      ...databaseOrphans,
      ...unmatchedFromLatestZip.map((file_name) => ({ file_name, origin: "thumbnail_zip", created_at: latestZipAnalysis?.created_at || null })),
    ];
    const successfulDurations = events
      .filter((event) => event.kind === "integration" && event.status === "success" && Number(event.duration_ms) > 0)
      .map((event) => Number(event.duration_ms));
    const averageDurationMs = successfulDurations.length
      ? Math.round(successfulDurations.reduce((sum: number, value: number) => sum + value, 0) / successfulDurations.length)
      : 0;

    return Response.json({
      summary: {
        connected: Boolean(driveSettings?.enabled && driveSettings?.refresh_token_ciphertext),
        connectedEmail: driveSettings?.connected_email || null,
        lastUpdatedAt: driveSettings?.updated_at || null,
        errors24h: events.filter((event) => event.level === "error" && Date.now() - new Date(event.created_at).getTime() <= 86400000).length,
        averageDurationMs,
        orphanFiles: missingOrderFiles.length,
        activeUploads: sessions.filter((session) => new Date(session.expires_at).getTime() > Date.now()).length,
      },
      events,
      uploadSessions: sessions.map((session) => ({
        ...session,
        status: new Date(session.expires_at).getTime() > Date.now() ? "pending" : "expired",
        error_message: null,
      })),
      missingOrderFiles,
    });
  } catch (error) {
    return responseMessage(error);
  }
}
