import type { DbStatus } from "@/lib/pcp-types";

export function dueLabel(value: string) {
  const due = new Date(`${value}T12:00:00`);
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const days = Math.round((due.getTime() - today.getTime()) / 86400000);
  if (days < 0) return `Atrasado ${Math.abs(days)} dia${days < -1 ? "s" : ""}`;
  if (days === 0) return "Prazo hoje";
  if (days === 1) return "Prazo amanhã";
  return due.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

export function initials(email?: string) {
  return (email?.split("@")[0] || "US").slice(0, 2).toUpperCase();
}

export function dateTimeLabel(value: string) {
  return new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export function installationDateTimeLabel(value: string) {
  return new Date(value).toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Manaus",
  });
}

export function toInstallationInputValue(value: string | null) {
  if (!value) return "";
  return new Date(value).toLocaleString("sv-SE", {
    timeZone: "America/Manaus",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).replace(" ", "T");
}

export function installationLocalToIso(value: string) {
  return new Date(`${value}:00-04:00`).toISOString();
}

export function statusLabel(status: DbStatus | null) {
  if (status === "in_progress") return "Em andamento";
  if (status === "completed") return "Concluído";
  if (status === "paused") return "Pausado";
  return "Aguardando";
}

function parseDateOnly(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function formatDateOnly(value: Date) {
  return [
    value.getUTCFullYear(),
    String(value.getUTCMonth() + 1).padStart(2, "0"),
    String(value.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

export function previousBusinessDay(value: string) {
  const date = parseDateOnly(value);
  do {
    date.setUTCDate(date.getUTCDate() - 1);
  } while (date.getUTCDay() === 0 || date.getUTCDay() === 6);
  return formatDateOnly(date);
}

export function nextBusinessDay(value: string) {
  const date = parseDateOnly(value);
  do {
    date.setUTCDate(date.getUTCDate() + 1);
  } while (date.getUTCDay() === 0 || date.getUTCDay() === 6);
  return formatDateOnly(date);
}

export function installationDateValue(value: string | null) {
  return value ? toInstallationInputValue(value).slice(0, 10) : "";
}

export function installationDateToIso(value: string, currentValue?: string | null) {
  const currentTime = currentValue
    ? toInstallationInputValue(currentValue).slice(11, 16)
    : "08:00";
  return installationLocalToIso(`${value}T${currentTime || "08:00"}`);
}

export function targetDateForOrder(installationValue: string | null, productionDeadline: string) {
  return installationDateValue(installationValue) || nextBusinessDay(productionDeadline);
}

export function dateOnlyLabel(value: string) {
  return parseDateOnly(value).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function shortDateOnlyLabel(value: string) {
  return parseDateOnly(value).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
  });
}
