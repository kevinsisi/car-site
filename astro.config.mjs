import { defineConfig } from "astro/config";
import node from "@astrojs/node";
import cloudflare from "@astrojs/cloudflare";
import svelte from "@astrojs/svelte";

const isWorkersRuntime = process.env.MITA_RUNTIME === "workers";

export default defineConfig({
  output: "server",
  adapter: isWorkersRuntime
    ? cloudflare({
        platformProxy: {
          enabled: true,
          configPath: "./wrangler.toml",
          environment: "preview",
        },
        imageService: "passthrough",
      })
    : node({ mode: "standalone" }),
  integrations: [svelte()],
  prefetch: true,
  security: {
    checkOrigin: false,
  },
  ...(!isWorkersRuntime && {
    vite: {
      ssr: {
        external: ["better-sqlite3"],
      },
    },
  }),
});
