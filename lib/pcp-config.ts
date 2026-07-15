import type { AppRole, Priority, UiStatus, DbStatus, ViewKey } from "@/lib/pcp-types";

export const priorityLabel: Record<Priority, string> = {
  low: "Baixa",
  normal: "Normal",
  high: "Alta",
  urgent: "Urgente",
};

export const statusToDb: Record<UiStatus, DbStatus> = {
  Aguardando: "waiting",
  "Em andamento": "in_progress",
  "Em transporte": "in_transport",
  "Aguardando cliente": "waiting_client",
};

export const standardSectorStatuses: UiStatus[] = ["Aguardando", "Em andamento"];
export const pcpSectorStatuses: UiStatus[] = ["Aguardando", "Em transporte", "Aguardando cliente"];

export function isPcpSectorName(name: string | null | undefined) {
  return String(name || "").trim().toLocaleUpperCase("pt-BR") === "PCP";
}

export function statusesForSector(name: string | null | undefined): UiStatus[] {
  return isPcpSectorName(name) ? pcpSectorStatuses : standardSectorStatuses;
}

export function statusDotClass(status: UiStatus) {
  if (status === "Aguardando") return "wait";
  if (status === "Em andamento") return "run";
  if (status === "Em transporte") return "transport";
  return "client";
}

export const roleLabel: Record<AppRole, string> = {
  admin: "Administrador",
  manager: "Operador",
  production: "Operador",
  viewer: "Usuário",
};

export const menuItems: Array<{
  key: Exclude<ViewKey, "settings" | "users">;
  icon: string;
  label: string;
}> = [
  { key: "dashboard", icon: "◫", label: "Dashboard" },
  { key: "kanban", icon: "▦", label: "Produção · Kanban" },
  { key: "orders", icon: "▤", label: "Pedidos" },
  { key: "completed", icon: "✓", label: "Concluídos" },
  { key: "installation", icon: "◷", label: "Agenda de instalação/entrega" },
  { key: "activities", icon: "☑", label: "Atividades e Compras" },
  { key: "clients", icon: "◉", label: "Clientes" },
];


export const viewPath: Record<ViewKey, string> = {
  dashboard: "/dashboard",
  kanban: "/producao",
  orders: "/pedidos",
  completed: "/concluidos",
  installation: "/agenda",
  activities: "/atividades-compras",
  clients: "/clientes",
  users: "/usuarios",
  settings: "/configuracoes",
};

const pathnameView = new Map<string, ViewKey>(
  Object.entries(viewPath).map(([view, pathname]) => [pathname, view as ViewKey]),
);

export function viewFromPathname(pathname: string | null | undefined): ViewKey {
  const normalized = String(pathname || "/").replace(/\/+$/, "") || "/";
  return pathnameView.get(normalized) || "dashboard";
}

export function pathForView(view: ViewKey) {
  return viewPath[view] || viewPath.dashboard;
}
