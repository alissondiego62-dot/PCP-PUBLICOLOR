export type DbStatus = "waiting" | "in_progress" | "in_transport" | "waiting_client" | "completed" | "paused";
export type UiStatus = "Aguardando" | "Em andamento" | "Em transporte" | "Aguardando cliente";
export type Priority = "low" | "normal" | "high" | "urgent";
export type AppRole = "admin" | "manager" | "production" | "viewer";
export type InstallationStatus = "pending" | "scheduled" | "in_progress" | "completed" | "cancelled";

export type Sector = { id: string; name: string; position: number; active: boolean };

export type Client = {
  id: string;
  name: string;
  trade_name: string | null;
  document: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  contact_name: string | null;
  address: string | null;
  district: string | null;
  city: string | null;
  state: string | null;
  notes: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
};
export type Profile = { id: string; name: string; email: string; role: AppRole; active: boolean; created_at: string };
export type Author = { name: string; email: string } | null;

export type Order = {
  id: string;
  op_number: string;
  client_name: string;
  client_id: string | null;
  description: string;
  delivery_date: string;
  priority: Priority;
  sector_id: string;
  status: DbStatus;
  responsible_user_id: string | null;
  consultant_name: string | null;
  main_image_path: string | null;
  blocked: boolean;
  completed_at: string | null;
  installation_scheduled_at: string | null;
  installation_address: string | null;
  installation_team: string | null;
  installation_vehicle: string | null;
  installation_status: InstallationStatus | null;
  installation_notes: string | null;
  installation_completed_at: string | null;
  installation_time_confirmed: boolean;
  materials: string | null;
  notes: string | null;
  created_at: string;
};

export type OrderPatch = Partial<Pick<Order,
  | "op_number"
  | "client_id"
  | "client_name"
  | "description"
  | "delivery_date"
  | "priority"
  | "responsible_user_id"
  | "consultant_name"
  | "sector_id"
  | "status"
  | "blocked"
  | "completed_at"
  | "main_image_path"
  | "installation_scheduled_at"
  | "installation_address"
  | "installation_team"
  | "installation_vehicle"
  | "installation_status"
  | "installation_notes"
  | "installation_completed_at"
  | "installation_time_confirmed"
  | "materials"
  | "notes"
>>;

export type HistoryEntry = {
  id: number;
  action_type: string;
  description: string;
  previous_sector_id: string | null;
  new_sector_id: string | null;
  previous_status: DbStatus | null;
  new_status: DbStatus | null;
  created_at: string;
  author: Author;
};

export type OrderChangeEntry = { id: string; field_name: string; old_value: string | null; new_value: string | null; change_group: string; created_at: string; changed_by: string | null; };

export type CommentEntry = { id: string; comment: string; created_at: string; user_id: string; author: Author };
export type PurchaseActivityStatus = "pending" | "awaiting_quote" | "awaiting_separation" | "awaiting_delivery" | "finalized";
export type OrderMaterial = {
  id: string;
  order_id: string;
  material_name: string;
  quantity: number;
  unit: string;
  unit_price: number | null;
  width: number | null;
  status: "planned" | "reserved" | "consumed";
  availability: "available" | "unavailable";
  purchase_status: PurchaseActivityStatus | null;
  purchase_activity_id: string | null;
  available_at: string | null;
  available_by: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};
export type ChecklistItem = { id: string; order_id: string; label: string; category: string; completed: boolean; position: number; completed_at: string | null; created_at: string };
export type OrderFileEntry = {
  id: string;
  order_id: string;
  uploaded_by: string;
  updated_by: string | null;
  origin: "drive_upload" | "drive_sync" | "manual_link" | "legacy";
  file_name: string;
  file_path: string | null;
  file_type: string | null;
  file_size: number | null;
  drive_url: string | null;
  drive_file_id: string | null;
  drive_folder_id: string | null;
  file_category: "art" | "approval" | "production" | "photo" | "installation" | "document" | "other";
  version: string | null;
  notes: string | null;
  is_approved: boolean;
  drive_modified_at: string | null;
  drive_last_modified_by_name: string | null;
  drive_last_modified_by_email: string | null;
  updated_at: string;
  created_at: string;
};

export type CreateUserResponse = { ok?: boolean; message?: string; error?: string; user?: Profile };
export type DetailTab = "summary" | "production" | "materials" | "files" | "checklist" | "installation" | "history" | "comments";
export type DeadlineFilter = "all" | "late" | "today" | "next7";
export type SortMode = "newest" | "oldest" | "delivery";
export type ViewKey = "dashboard" | "kanban" | "orders" | "completed" | "installation" | "activities" | "clients" | "reports" | "users" | "settings";
export type AuthMode = "login" | "forgot" | "update";
