const TABLE = "client_materials";

export async function listClientMaterials(supabase, clientId) {
  if (!clientId) return [];

  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .eq("client_id", clientId)
    .eq("active", true)
    .order("category", { ascending: true })
    .order("source_row", { ascending: true, nullsFirst: false })
    .order("item_name", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function createClientMaterial(supabase, clientId, values) {
  const { data, error } = await supabase
    .from(TABLE)
    .insert({
      ...values,
      client_id: clientId,
      source: "Cadastro manual",
      source_key: null,
      source_row: null,
      raw_source: null,
      active: true,
    })
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

export async function updateClientMaterial(
  supabase,
  clientId,
  materialId,
  values,
) {
  const { data, error } = await supabase
    .from(TABLE)
    .update({
      ...values,
      updated_at: new Date().toISOString(),
    })
    .eq("id", materialId)
    .eq("client_id", clientId)
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

export async function archiveClientMaterial(
  supabase,
  clientId,
  materialId,
) {
  const { error } = await supabase
    .from(TABLE)
    .update({
      active: false,
      updated_at: new Date().toISOString(),
    })
    .eq("id", materialId)
    .eq("client_id", clientId);

  if (error) throw error;
}

export function normalizeMaterialForDatabase(form) {
  const distribution =
    form.category === "led"
      ? (form.led_distribution ?? [])
          .map((row) => ({
            group: String(row.group ?? "").trim(),
            position: String(row.position ?? "").trim(),
            letter: String(row.letter ?? "").trim(),
            quantity: Number(row.quantity) || 0,
          }))
          .filter(
            (row) =>
              row.group ||
              row.position ||
              row.letter ||
              Number(row.quantity) > 0,
          )
      : [];

  const calculatedLedTotal = distribution.reduce(
    (total, row) => total + row.quantity,
    0,
  );

  const typedQuantity = String(form.quantity ?? "")
    .trim()
    .replace(",", ".");
  const parsedQuantity = typedQuantity ? Number(typedQuantity) : null;

  return {
    category: form.category,
    item_name: String(form.item_name ?? "").trim(),
    brand: emptyToNull(form.brand),
    code: emptyToNull(form.code),
    catalog_page: emptyToNull(form.catalog_page),
    finish: emptyToNull(form.finish),
    application: emptyToNull(form.application),
    quantity:
      form.category === "led" && distribution.length
        ? calculatedLedTotal
        : Number.isFinite(parsedQuantity)
          ? parsedQuantity
          : null,
    unit:
      form.category === "led"
        ? emptyToNull(form.unit) ?? "módulos"
        : emptyToNull(form.unit),
    led_temperature:
      form.category === "led" ? emptyToNull(form.led_temperature) : null,
    led_distribution: distribution,
    notes: emptyToNull(form.notes),
  };
}

function emptyToNull(value) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}
