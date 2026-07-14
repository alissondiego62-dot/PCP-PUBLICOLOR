declare module "nitro/vite" {
  import type { PluginOption } from "vite";
  export function nitro(options?: Record<string, unknown>): PluginOption;
}
