import type { ReactNode } from "react";

export type AppIconName =
  | "search" | "alert" | "close" | "menu" | "dashboard" | "kanban" | "orders"
  | "completed" | "calendar" | "tasks" | "clients" | "users" | "settings"
  | "eye" | "edit" | "copy" | "trash" | "chevronDown" | "chevronLeft" | "chevronRight"
  | "refresh" | "download" | "upload" | "filter" | "more" | "check" | "info"
  | "link" | "database" | "activity" | "shield" | "user" | "history" | "comments" | "move" | "status" | "pause" | "logout";

const paths: Record<AppIconName, ReactNode> = {
  search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>,
  alert: <><path d="M12 3 2.7 20h18.6Z"/><path d="M12 9v4M12 17h.01"/></>,
  close: <path d="m6 6 12 12M18 6 6 18"/>,
  menu: <path d="M4 7h16M4 12h16M4 17h16"/>,
  dashboard: <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,
  kanban: <><rect x="3" y="4" width="5" height="16" rx="1"/><rect x="10" y="4" width="5" height="10" rx="1"/><rect x="17" y="4" width="4" height="13" rx="1"/></>,
  orders: <><path d="M7 4h10M7 8h10M7 12h10M7 16h7"/><path d="M4 4h.01M4 8h.01M4 12h.01M4 16h.01"/></>,
  completed: <><circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18"/></>,
  tasks: <><path d="m4 6 2 2 3-4M11 6h9M4 13l2 2 3-4M11 13h9M4 20l2 2 3-4M11 20h9"/></>,
  clients: <><circle cx="9" cy="8" r="4"/><path d="M2 21a7 7 0 0 1 14 0M17 11a4 4 0 0 1 5 4v6"/></>,
  users: <><circle cx="9" cy="8" r="4"/><circle cx="18" cy="10" r="3"/><path d="M2 21a7 7 0 0 1 14 0M15 21a5 5 0 0 1 7 0"/></>,
  settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3A1.7 1.7 0 0 0 10 3V2.8h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z"/></>,
  eye: <><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.5"/></>,
  edit: <><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/></>,
  copy: <><rect x="8" y="8" width="11" height="11" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></>,
  trash: <><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/><path d="M10 11v5M14 11v5"/></>,
  chevronDown: <path d="m6 9 6 6 6-6"/>,
  chevronLeft: <path d="m15 6-6 6 6 6"/>,
  chevronRight: <path d="m9 6 6 6-6 6"/>,
  refresh: <><path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/></>,
  download: <><path d="M12 3v12M7 10l5 5 5-5"/><path d="M4 21h16"/></>,
  upload: <><path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 21h16"/></>,
  filter: <path d="M4 5h16l-6 7v6l-4 2v-8Z"/>,
  more: <><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></>,
  check: <path d="m5 12 4 4L19 6"/>,
  info: <><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/></>,
  link: <><path d="M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1.1 1.1"/><path d="M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1.1-1.1"/></>,
  database: <><ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/></>,
  activity: <path d="M3 12h4l2.5-7 4 14 2.5-7H21"/>,
  shield: <><path d="M12 3 4 6v5c0 5.2 3.3 8.7 8 10 4.7-1.3 8-4.8 8-10V6Z"/><path d="m9 12 2 2 4-5"/></>,
  user: <><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></>,
  history: <><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5M12 7v5l3 2"/></>,
  comments: <><path d="M21 12a8 8 0 0 1-8 8H6l-3 2 1-5a8 8 0 1 1 17-5Z"/><path d="M8 12h.01M12 12h.01M16 12h.01"/></>,
  move: <><path d="M5 7h11M13 4l3 3-3 3M19 17H8M11 14l-3 3 3 3"/></>,
  status: <><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/></>,
  pause: <><circle cx="12" cy="12" r="9"/><path d="M9 8v8M15 8v8"/></>,
  logout: <><path d="M10 5H5v14h5M14 8l4 4-4 4M18 12H9"/></>,
};

export function AppIcon({ name, size = 18 }: { name: AppIconName; size?: number }) {
  return <svg className="app-icon" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">{paths[name]}</svg>;
}
