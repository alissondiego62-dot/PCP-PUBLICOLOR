import type { AppRole, Priority, UiStatus, DbStatus, ViewKey } from "./types";

export const priorityLabel: Record<Priority, string> = {
  low: "Baixa",
  normal: "Normal",
  high: "Alta",
  urgent: "Urgente",
};

export const statusToDb: Record<UiStatus, DbStatus> = {
  Aguardando: "waiting",
  "Em andamento": "in_progress",
};

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
  { key: "clients", icon: "◉", label: "Clientes" },
  { key: "reports", icon: "▥", label: "Relatórios" },
];
