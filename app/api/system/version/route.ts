export const runtime = "nodejs";

import packageInfo from "@/package.json";
import { requireAppUser, responseMessage } from "@/lib/server/supabase-server";

export async function GET(request: Request) {
  try {
    await requireAppUser(request);
    return Response.json({
      version: packageInfo.version,
      commit: process.env.VERCEL_GIT_COMMIT_SHA || process.env.GIT_COMMIT_SHA || "local",
      branch: process.env.VERCEL_GIT_COMMIT_REF || "local",
      environment: process.env.NEXT_PUBLIC_APP_ENV || process.env.VERCEL_ENV || "development",
      deploymentUrl: process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL || null,
      builtAt: process.env.NEXT_PUBLIC_BUILD_TIME || null,
    });
  } catch (error) {
    return responseMessage(error);
  }
}
