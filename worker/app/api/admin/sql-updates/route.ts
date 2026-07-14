export const runtime = "nodejs";

import {
  executeSupabaseSql,
  listAdministrativeHistory,
} from "@/lib/server/platform-settings";
import { requireAppUser, responseMessage } from "@/lib/server/supabase-server";

const MAX_SQL_FILE_BYTES = 2 * 1024 * 1024;

export async function GET(request: Request) {
  try {
    await requireAppUser(request, ["admin"]);
    const history = await listAdministrativeHistory();
    return Response.json(history, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return responseMessage(error);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireAppUser(request, ["admin"]);
    const form = await request.formData();
    const fileValue = form.get("file");
    if (!(fileValue instanceof File)) {
      return Response.json({ error: "Selecione um arquivo .sql." }, { status: 400 });
    }
    if (!fileValue.name.toLowerCase().endsWith(".sql")) {
      return Response.json({ error: "Somente arquivos com extensão .sql são aceitos." }, { status: 400 });
    }
    if (fileValue.size > MAX_SQL_FILE_BYTES) {
      return Response.json({ error: "O arquivo SQL deve ter no máximo 2 MB." }, { status: 400 });
    }
    if (String(form.get("confirmation") || "").trim().toUpperCase() !== "EXECUTAR SQL") {
      return Response.json({ error: "Digite EXECUTAR SQL para confirmar." }, { status: 400 });
    }

    const sql = await fileValue.text();
    const result = await executeSupabaseSql({
      sql,
      projectRef: String(form.get("project_ref") || ""),
      fileName: fileValue.name,
      fileSize: fileValue.size,
      allowRepeat: String(form.get("allow_repeat") || "") === "true",
      actor,
    });
    return Response.json({ ok: true, ...result });
  } catch (error) {
    return responseMessage(error);
  }
}
