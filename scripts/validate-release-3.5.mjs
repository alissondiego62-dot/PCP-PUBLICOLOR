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
  "app/api/admin/sectors/route.ts",
  "app/components/InstallationAgendaView.tsx",
  "app/release-3-5-0.css",
  "components/KanbanSettingsPanel.tsx",
  "components/PcpApp.tsx",
  "features/kanban/KanbanView.tsx",
  "features/kanban/MoveOrderModal.tsx",
  "features/settings/SettingsView.tsx",
  "lib/pcp-types.ts",
  "SQL-MIGRACAO-PUBLICOLOR-3.5.0-REVISADO.sql",
  "SQL-ATUALIZACAO-PUBLICOLOR-3.5.0-REVISADO.sql",
  "SQL-VALIDAR-PUBLICOLOR-3.5.0-REVISADO.sql",
  "supabase/migrations/20260718010000_publicolor_3_5_0_revisado_kanban_agenda_instalacao.sql",
  "docs/ATUALIZACAO-3.5.0-REVISADO.md",
  "docs/ATUALIZACAO-3.5.2.md",
  "docs/ATUALIZACAO-3.5.3.md",
  "docs/ATUALIZACAO-3.5.4.md",
  "docs/ATUALIZACAO-3.5.5.md",
  "app/release-3-5-3.css",
  "app/release-3-5-4.css",
  "app/release-3-5-5.css",
  "app/api/order-thumbnails/[orderId]/pages/route.ts",
  "COMO-ATUALIZAR-PUBLICOLOR-3.5.5.txt",
  "VALIDACAO-PUBLICOLOR-3.5.5.txt",
  "COMO-ATUALIZAR-PUBLICOLOR-3.5.0-REVISADO.txt",
  "VALIDACAO-PUBLICOLOR-3.5.0-REVISADO.txt",
];

const missing = requiredFiles.filter((file) => !fs.existsSync(path.join(root, file)));
if (missing.length) {
  console.error(`Arquivos obrigatórios ausentes:\n- ${missing.join("\n- ")}`);
  process.exit(1);
}

const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
if (packageJson.version !== "3.5.5") {
  console.error(`Versão inválida no package.json: ${packageJson.version}`);
  process.exit(1);
}

const serviceWorker = fs.readFileSync(path.join(root, "public/service-worker.js"), "utf8");
if (!serviceWorker.includes("v3.5.5")) {
  console.error("O Service Worker não aponta para o cache 3.5.5.");
  process.exit(1);
}

const migration = fs.readFileSync(path.join(root, "SQL-MIGRACAO-PUBLICOLOR-3.5.0-REVISADO.sql"), "utf8").trim();
const repositoryMigration = fs.readFileSync(path.join(root, "supabase/migrations/20260718010000_publicolor_3_5_0_revisado_kanban_agenda_instalacao.sql"), "utf8").trim();
if (migration !== repositoryMigration) {
  console.error("A migration do repositório diverge do SQL incremental 3.5.0 revisado.");
  process.exit(1);
}

const forbidden = [".env.local", "node_modules", ".next", "dist", ".git", "tsconfig.tsbuildinfo"];
for (const name of forbidden) {
  if (fs.existsSync(path.join(root, name))) {
    console.error(`Diretório ou arquivo proibido no pacote: ${name}`);
    process.exit(1);
  }
}

console.log(`Release ${packageJson.version} revisada: ${requiredFiles.length} arquivos obrigatórios presentes.`);
