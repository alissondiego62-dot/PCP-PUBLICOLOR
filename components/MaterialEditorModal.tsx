"use client";

import { useState, type FormEvent } from "react";
import { AppIcon } from "@/components/ui/AppIcon";
import type { OrderMaterial, PurchaseActivityStatus } from "@/lib/pcp-types";
import { PURCHASE_STATUS_OPTIONS, type MaterialEditorPatch, type MaterialEditorSubmission } from "@/lib/order-materials";

type Props = {
  material: OrderMaterial;
  busy?: boolean;
  contextLabel?: string;
  onClose: () => void;
  onSave: (submission: MaterialEditorSubmission) => Promise<void> | void;
};

function decimalValue(value: FormDataEntryValue | null, required = false) {
  const text = String(value ?? "").trim();
  if (!text) return required ? Number.NaN : null;
  const normalized = text.includes(",") ? text.replace(/\./g, "").replace(",", ".") : text;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function localDateTimeValue(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 16);
}

function nullableText(form: FormData, name: string) {
  return String(form.get(name) || "").trim() || null;
}

export function MaterialEditorModal({ material, busy = false, contextLabel = "ORDEM DE SERVIÇO", onClose, onSave }: Props) {
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = new FormData(event.currentTarget);
    const materialName = String(form.get("material_name") || "").trim();
    const quantity = decimalValue(form.get("quantity"), true);
    const unit = String(form.get("unit") || "").trim();
    const width = decimalValue(form.get("width"));
    const unitPrice = decimalValue(form.get("unit_price"));
    const actualUnitPrice = decimalValue(form.get("actual_unit_price"));
    const purchasedQuantity = decimalValue(form.get("purchased_quantity"));
    const receivedQuantity = decimalValue(form.get("received_quantity"));
    const status = String(form.get("status") || "planned") as OrderMaterial["status"];
    let availability = String(form.get("availability") || "available") as OrderMaterial["availability"];
    let purchaseStatus = String(form.get("purchase_status") || material.purchase_status || "pending") as PurchaseActivityStatus;

    if (!materialName) return setError("Informe o nome do material.");
    if (!Number.isFinite(quantity) || Number(quantity) <= 0) return setError("A quantidade deve ser maior que zero.");
    if (!unit) return setError("Informe a unidade do material.");
    if ([width, unitPrice, actualUnitPrice, purchasedQuantity, receivedQuantity].some((value) => value !== null && (!Number.isFinite(value) || Number(value) < 0))) {
      return setError("Largura, preços e quantidades de compra não podem ser negativos.");
    }
    if (purchasedQuantity !== null && receivedQuantity !== null && Number(receivedQuantity) > Number(purchasedQuantity)) {
      return setError("A quantidade recebida não pode ser maior que a quantidade comprada.");
    }

    if (availability === "available" && purchaseStatus !== "finalized") purchaseStatus = "finalized";
    if (availability === "unavailable" && purchaseStatus === "finalized") purchaseStatus = "pending";
    if (purchaseStatus === "finalized") availability = "available";

    const purchaseOrderedAt = String(form.get("purchase_ordered_at") || "").trim();
    const patch: MaterialEditorPatch = {
      material_name: materialName,
      quantity: Number(quantity),
      unit,
      width: width === null ? null : Number(width),
      status,
      availability,
      notes: nullableText(form, "notes"),
      unit_price: unitPrice === null ? null : Number(unitPrice),
      actual_unit_price: actualUnitPrice === null ? null : Number(actualUnitPrice),
      purchased_quantity: purchasedQuantity === null ? null : Number(purchasedQuantity),
      received_quantity: receivedQuantity === null ? null : Number(receivedQuantity),
      purchase_order_number: nullableText(form, "purchase_order_number"),
      purchase_ordered_at: purchaseOrderedAt ? new Date(purchaseOrderedAt).toISOString() : null,
      invoice_number: nullableText(form, "invoice_number"),
      purchase_document_url: nullableText(form, "purchase_document_url"),
      invoice_file_url: nullableText(form, "invoice_file_url"),
      receipt_notes: nullableText(form, "receipt_notes"),
    };

    setError("");
    try {
      await onSave({ patch, purchaseStatus });
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Não foi possível salvar o material.");
    }
  }

  const estimatedSubtotal = Number(material.quantity || 0) * Number(material.unit_price || 0);
  const actualQuantity = material.received_quantity ?? material.purchased_quantity ?? material.quantity ?? 0;
  const actualSubtotal = Number(actualQuantity) * Number(material.actual_unit_price ?? material.unit_price ?? 0);

  return <div className="overlay material-editor-overlay" onMouseDown={() => !busy && onClose()}>
    <form className="modal material-editor-modal" onSubmit={submit} onMouseDown={(event) => event.stopPropagation()}>
      <button type="button" className="close" aria-label="Fechar editor de material" onClick={onClose} disabled={busy}>×</button>
      <header className="material-editor-header">
        <div><p className="eyebrow">{contextLabel}</p><h2>Editar material</h2><span>Todos os dados abaixo pertencem ao mesmo material vinculado à OS e à atividade de compra.</span></div>
        <div className="material-editor-totals"><small>Estimado</small><b>{estimatedSubtotal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</b><small>Efetivo/recebido</small><strong>{actualSubtotal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</strong></div>
      </header>

      {error && <div className="auth-error">{error}</div>}

      <section className="material-editor-section">
        <div className="material-editor-section-title"><AppIcon name="edit"/><div><b>Identificação e uso</b><span>Nome, quantidade, medida e situação interna do material.</span></div></div>
        <div className="material-editor-grid">
          <label className="wide">Material<input name="material_name" defaultValue={material.material_name} required autoFocus /></label>
          <label>Quantidade<input name="quantity" inputMode="decimal" defaultValue={material.quantity} required /></label>
          <label>Unidade<input name="unit" defaultValue={material.unit} placeholder="un, barra, chapa, litro…" required /></label>
          <label>Largura/medida opcional<input name="width" inputMode="decimal" defaultValue={material.width ?? ""} placeholder="Ex.: 20 ou 1,22" /></label>
          <label>Situação de uso<select name="status" defaultValue={material.status}><option value="planned">Planejado</option><option value="reserved">Reservado</option><option value="consumed">Consumido</option></select></label>
          <label className="wide">Observação do material<textarea name="notes" defaultValue={material.notes || ""} placeholder="Cor, espessura, perfil, acabamento ou outra especificação." /></label>
        </div>
      </section>

      <section className="material-editor-section">
        <div className="material-editor-section-title"><AppIcon name="tasks"/><div><b>Disponibilidade e andamento da compra</b><span>Alterar para não disponível cria ou reabre a atividade vinculada. Finalizar torna o material disponível.</span></div></div>
        <div className="material-editor-grid">
          <label>Disponibilidade<select name="availability" defaultValue={material.availability}><option value="available">Disponível</option><option value="unavailable">Não disponível</option></select></label>
          <label>Status da compra<select name="purchase_status" defaultValue={material.purchase_status || (material.availability === "available" ? "finalized" : "pending")}>{PURCHASE_STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
          <label>Preço unitário estimado<input name="unit_price" inputMode="decimal" defaultValue={material.unit_price ?? ""} placeholder="0,00" /></label>
          <label>Preço unitário efetivo<input name="actual_unit_price" inputMode="decimal" defaultValue={material.actual_unit_price ?? ""} placeholder="0,00" /></label>
          <label>Quantidade comprada<input name="purchased_quantity" inputMode="decimal" defaultValue={material.purchased_quantity ?? ""} /></label>
          <label>Quantidade recebida<input name="received_quantity" inputMode="decimal" defaultValue={material.received_quantity ?? ""} /></label>
        </div>
      </section>

      <section className="material-editor-section">
        <div className="material-editor-section-title"><AppIcon name="link"/><div><b>Pedido, documento e recebimento</b><span>Informações opcionais para acompanhar a compra sem criar fornecedores ou cotações.</span></div></div>
        <div className="material-editor-grid">
          <label>Número do pedido<input name="purchase_order_number" defaultValue={material.purchase_order_number || ""} /></label>
          <label>Data do pedido<input type="datetime-local" name="purchase_ordered_at" defaultValue={localDateTimeValue(material.purchase_ordered_at)} /></label>
          <label>Número da nota fiscal<input name="invoice_number" defaultValue={material.invoice_number || ""} /></label>
          <label className="wide">Link do comprovante<input type="url" name="purchase_document_url" defaultValue={material.purchase_document_url || ""} placeholder="https://…" /></label>
          <label className="wide">Link da nota fiscal<input type="url" name="invoice_file_url" defaultValue={material.invoice_file_url || ""} placeholder="https://…" /></label>
          <label className="wide">Observação do recebimento<textarea name="receipt_notes" defaultValue={material.receipt_notes || ""} placeholder="Ex.: material recebido parcialmente; restante previsto para amanhã." /></label>
        </div>
      </section>

      <footer className="material-editor-actions">
        <span>{material.purchase_activity_id ? "Atividade de compra vinculada" : "Sem atividade vinculada no momento"}</span>
        <div><button type="button" className="secondary" onClick={onClose} disabled={busy}>Cancelar</button><button type="submit" className="primary" disabled={busy}>{busy ? "Salvando…" : "Salvar todas as alterações"}</button></div>
      </footer>
    </form>
  </div>;
}
