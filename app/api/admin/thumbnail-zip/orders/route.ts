export const runtime = "nodejs";

import {
  getSupabaseAdmin,
  requireAppUser,
  responseMessage,
} from "@/lib/server/supabase-server";

const PAGE_SIZE = 1000;

type OrderRow = {
  id: string;
  op_number: string;
  client_name: string;
  main_image_path: string | null;
};

export async function GET(request: Request) {
  try {
    await requireAppUser(request, ["admin"]);
    const admin = getSupabaseAdmin();
    const orders: OrderRow[] = [];
    let from = 0;

    while (true) {
      const { data, error } = await admin
        .from("orders")
        .select("id,op_number,client_name,main_image_path")
        .not("op_number", "is", null)
        .order("op_number", { ascending: true })
        .range(from, from + PAGE_SIZE - 1);

      if (error) throw new Error(`Não foi possível carregar as OPs: ${error.message}`);
      const page = (data || []) as OrderRow[];
      orders.push(...page.filter((order) => Boolean(order.id && order.op_number)));
      if (page.length < PAGE_SIZE) break;
      from += PAGE_SIZE;
    }

    return Response.json({ orders }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return responseMessage(error);
  }
}
