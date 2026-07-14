export function requiresAutomaticOrderNumber(value: string | null | undefined) {
  const normalized = String(value || "").trim();
  return !normalized || /^0+$/.test(normalized);
}

export function automaticOrderNumberHint() {
  return "Deixe vazio ou informe 0000 para o sistema gerar um número único automaticamente.";
}
