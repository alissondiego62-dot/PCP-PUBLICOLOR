import type { AppRole } from "@/lib/pcp-types";

export type PermissionKey =
  | "dashboard.view"
  | "production.view"
  | "production.move"
  | "orders.view"
  | "orders.create"
  | "orders.edit"
  | "orders.finalize"
  | "orders.delete"
  | "materials.view"
  | "materials.edit"
  | "activities.view"
  | "activities.manage"
  | "purchases.prices"
  | "agenda.view"
  | "agenda.manage"
  | "clients.view"
  | "clients.manage"
  | "users.view"
  | "users.manage"
  | "settings.view"
  | "settings.operation"
  | "settings.integrations"
  | "settings.permissions"
  | "settings.infrastructure";

export type PermissionDefinition = {
  key: PermissionKey;
  module: string;
  label: string;
  description: string;
  critical?: boolean;
};

export const permissionCatalog: PermissionDefinition[] = [
  { key: "dashboard.view", module: "Dashboard", label: "Visualizar Dashboard", description: "Acessar indicadores e prioridades operacionais." },
  { key: "production.view", module: "Produção", label: "Visualizar Kanban", description: "Consultar pedidos distribuídos por setor." },
  { key: "production.move", module: "Produção", label: "Mover pedidos e alterar status", description: "Trocar setor, status e usar movimentação rápida." },
  { key: "orders.view", module: "Pedidos", label: "Visualizar pedidos", description: "Abrir pedidos ativos e concluídos." },
  { key: "orders.create", module: "Pedidos", label: "Criar e importar pedidos", description: "Criar nova OS e importar PDF." },
  { key: "orders.edit", module: "Pedidos", label: "Editar pedidos", description: "Alterar resumo, responsável e prioridade." },
  { key: "orders.finalize", module: "Pedidos", label: "Finalizar e reabrir OS", description: "Concluir ou devolver uma ordem ao fluxo." },
  { key: "orders.delete", module: "Pedidos", label: "Excluir pedidos", description: "Apagar uma OS e seus vínculos permitidos.", critical: true },
  { key: "materials.view", module: "Materiais", label: "Visualizar materiais", description: "Consultar disponibilidade, compra e recebimento." },
  { key: "materials.edit", module: "Materiais", label: "Editar materiais", description: "Criar, alterar e excluir materiais da OS." },
  { key: "activities.view", module: "Atividades e Compras", label: "Visualizar atividades", description: "Consultar atividades, compras e finalizadas." },
  { key: "activities.manage", module: "Atividades e Compras", label: "Gerenciar atividades", description: "Criar, editar, concluir e excluir atividades." },
  { key: "purchases.prices", module: "Atividades e Compras", label: "Alterar preços de compras", description: "Editar quantidade, unidade, preço e recebimento." },
  { key: "agenda.view", module: "Agenda", label: "Visualizar Agenda", description: "Consultar instalações e entregas." },
  { key: "agenda.manage", module: "Agenda", label: "Gerenciar Agenda", description: "Agendar, reagendar e concluir compromissos." },
  { key: "clients.view", module: "Clientes", label: "Visualizar clientes", description: "Consultar cadastro e pedidos do cliente." },
  { key: "clients.manage", module: "Clientes", label: "Gerenciar clientes", description: "Criar e editar dados de clientes." },
  { key: "users.view", module: "Usuários", label: "Visualizar usuários", description: "Consultar usuários, convites e histórico de acesso." },
  { key: "users.manage", module: "Usuários", label: "Gerenciar usuários", description: "Editar, ativar, inativar e alterar papéis.", critical: true },
  { key: "settings.view", module: "Configurações", label: "Visualizar Configurações", description: "Acessar as configurações permitidas." },
  { key: "settings.operation", module: "Configurações", label: "Alterar regras operacionais", description: "Configurar prazos, capacidade e miniaturas." },
  { key: "settings.integrations", module: "Configurações", label: "Gerenciar integrações e dados", description: "Acessar Google Drive, importação e diagnósticos." },
  { key: "settings.permissions", module: "Configurações", label: "Configurar permissões", description: "Editar a matriz de acesso por nível.", critical: true },
  { key: "settings.infrastructure", module: "Configurações", label: "Acessar infraestrutura", description: "Executar ações avançadas de ambiente e banco.", critical: true },
];

const allKeys = permissionCatalog.map((item) => item.key);
const operatorKeys: PermissionKey[] = [
  "dashboard.view", "production.view", "production.move", "orders.view", "orders.create", "orders.edit", "orders.finalize",
  "materials.view", "materials.edit", "activities.view", "activities.manage", "purchases.prices", "agenda.view", "agenda.manage",
  "clients.view", "clients.manage",
];
const managerKeys: PermissionKey[] = [...operatorKeys, "users.view", "settings.view", "settings.operation", "settings.integrations"];
const viewerKeys: PermissionKey[] = ["dashboard.view", "production.view", "orders.view", "materials.view", "activities.view", "agenda.view", "clients.view"];

export const defaultRolePermissions: Record<AppRole, Set<PermissionKey>> = {
  admin: new Set(allKeys),
  manager: new Set(managerKeys),
  production: new Set(operatorKeys),
  viewer: new Set(viewerKeys),
};

export function roleHasDefaultPermission(role: AppRole, permission: PermissionKey) {
  return defaultRolePermissions[role]?.has(permission) ?? false;
}
