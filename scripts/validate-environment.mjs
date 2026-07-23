const required = [
  "NEXT_PUBLIC_APP_ENV",
  "NEXT_PUBLIC_APP_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
];

const missing = required.filter((name) => !process.env[name]?.trim());
if (missing.length) {
  console.error(`Variáveis ausentes: ${missing.join(", ")}`);
  process.exit(1);
}

const environment = process.env.NEXT_PUBLIC_APP_ENV;
const appUrl = process.env.NEXT_PUBLIC_APP_URL;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

if (environment === "production" && !/^https:\/\/pcp-publicolor\.vercel\.app\/?$/i.test(appUrl)) {
  console.error("Produção deve usar https://pcp-publicolor.vercel.app/");
  process.exit(1);
}
if (environment !== "production" && /^https:\/\/pcp-publicolor\.vercel\.app\/?$/i.test(appUrl)) {
  console.error("Homologação/preview não pode usar a URL de produção.");
  process.exit(1);
}
if (!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(supabaseUrl)) {
  console.error("NEXT_PUBLIC_SUPABASE_URL possui formato inválido.");
  process.exit(1);
}

console.log(`Ambiente validado: ${environment} · ${appUrl} · ${new URL(supabaseUrl).hostname}`);
