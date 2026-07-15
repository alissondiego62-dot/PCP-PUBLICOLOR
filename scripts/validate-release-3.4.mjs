import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const requiredFiles = [
  "app/dashboard/page.tsx",
  "app/producao/page.tsx",
  "app/pedidos/page.tsx",
  "app/concluidos/page.tsx",
  "app/agenda/page.tsx",
  "app/atividades-compras/page.tsx",
  "app/clientes/page.tsx",
  "app/usuarios/page.tsx",
  "app/configuracoes/page.tsx",
  "components/PcpApp.tsx",
  "components/SystemHealthPanel.tsx",
  "components/MaterialEditorModal.tsx",
  "lib/order-materials.ts",
  "app/release-3-4-1.css",
  "components/OperationalSettingsPanel.tsx",
  "components/AdminAuditPanel.tsx",
  "components/CompletedOrdersView.tsx",
  "features/dashboard/DashboardView.tsx",
  "features/orders/OrdersView.tsx",
  "features/settings/SettingsView.tsx",
  "features/users/UsersView.tsx",
  "features/search/GlobalSearch.tsx",
  "features/pending/PendingCenter.tsx",
  "hooks/usePcpRealtime.ts",
  "supabase/migrations/20260803010000_publicolor_3_4_foundation_performance_and_operations.sql",
  "SQL-ATUALIZACAO-PUBLICOLOR-3.4.1.sql",
  "SQL-VALIDAR-PUBLICOLOR-3.4.1.sql",
  "docs/ATUALIZACAO-3.4.1.md",
  "docs/AUDITORIA-FINAL-3.4.0.md",
  "COMO-ATUALIZAR-PUBLICOLOR-3.4.1.txt",
  "VALIDACAO-PUBLICOLOR-3.4.1.txt",
];

const missing = requiredFiles.filter((file) => !fs.existsSync(path.join(root, file)));
if (missing.length) {
  console.error(`Arquivos obrigatórios ausentes:\n- ${missing.join("\n- ")}`);
  process.exit(1);
}

const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
if (packageJson.version !== "3.4.1") {
  console.error(`Versão inválida no package.json: ${packageJson.version}`);
  process.exit(1);
}

const serviceWorker = fs.readFileSync(path.join(root, "public/service-worker.js"), "utf8");
if (!serviceWorker.includes("v3.4.1")) {
  console.error("O Service Worker não aponta para o cache 3.4.1.");
  process.exit(1);
}

const forbidden = [".env.local", "node_modules", ".next", "dist", ".git", "tsconfig.tsbuildinfo"];
for (const name of forbidden) {
  if (fs.existsSync(path.join(root, name))) {
    console.error(`Diretório ou arquivo proibido no pacote: ${name}`);
    process.exit(1);
  }
}

console.log(`Release ${packageJson.version} validada: ${requiredFiles.length} arquivos obrigatórios presentes.`);
