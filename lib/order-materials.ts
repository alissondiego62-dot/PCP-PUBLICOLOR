import type { OrderMaterial, PurchaseActivityStatus } from "@/lib/pcp-types";

export const ORDER_MATERIAL_COLUMNS = [
  "id",
  "order_id",
  "material_name",
  "quantity",
  "unit",
  "unit_price",
  "actual_unit_price",
  "purchased_quantity",
  "received_quantity",
  "purchase_order_number",
  "purchase_ordered_at",
  "invoice_number",
  "purchase_document_url",
  "invoice_file_url",
  "receipt_notes",
  "width",
  "status",
  "availability",
  "purchase_status",
  "purchase_activity_id",
  "available_at",
  "available_by",
  "notes",
  "created_at",
  "updated_at",
  "deleted_at",
].join(",");

export const PURCHASE_STATUS_OPTIONS: Array<{ value: PurchaseActivityStatus; label: string }> = [
  { value: "pending", label: "Pendente" },
  { value: "awaiting_quote", label: "Aguardando orçamento" },
  { value: "awaiting_separation", label: "Aguardando separação" },
  { value: "awaiting_delivery", label: "Aguardando entrega" },
  { value: "finalized", label: "Finalizada" },
];

export type MaterialEditorPatch = Pick<OrderMaterial,
  | "material_name"
  | "quantity"
  | "unit"
  | "width"
  | "status"
  | "availability"
  | "notes"
  | "unit_price"
  | "actual_unit_price"
  | "purchased_quantity"
  | "received_quantity"
  | "purchase_order_number"
  | "purchase_ordered_at"
  | "invoice_number"
  | "purchase_document_url"
  | "invoice_file_url"
  | "receipt_notes"
>;

export type MaterialEditorSubmission = {
  patch: MaterialEditorPatch;
  purchaseStatus: PurchaseActivityStatus;
};
