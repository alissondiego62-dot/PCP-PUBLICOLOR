import type { AppRole, Priority, UiStatus, DbStatus, ViewKey } from "@/lib/pcp-types";
import type { AppIconName } from "@/components/ui/AppIcon";

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
  manager: "Gerente",
  production: "Produção",
  viewer: "Visualizador",
};

export const menuItems: Array<{
  key: Exclude<ViewKey, "settings" | "users">;
  icon: AppIconName;
  label: string;
}> = [
  { key: "dashboard", icon: "dashboard", label: "Dashboard" },
  { key: "kanban", icon: "kanban", label: "Produção · Kanban" },
  { key: "orders", icon: "orders", label: "Pedidos" },
  { key: "completed", icon: "completed", label: "Concluídos" },
  { key: "installation", icon: "calendar", label: "Agenda de instalação/entrega" },
  { key: "activities", icon: "tasks", label: "Atividades e Compras" },
  { key: "clients", icon: "clients", label: "Clientes" },
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
