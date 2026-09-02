import { resolve } from "path";
import { defineConfig } from "electron-vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";

export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        external: ["better-sqlite3"],
      },
    },
  },
  preload: {
    build: {
      rollupOptions: {
        input: {
          index: resolve("src/preload/index.ts"),
          askpass: resolve("src/preload/askpass.ts"),
        },
      },
    },
  },
  renderer: {
    resolve: {
      alias: {
        "@renderer": resolve("src/renderer/src"),
      },
    },
    plugins: [
      // File-based routing (Next.js-style DX) for TanStack Router. Watches
      // src/renderer/src/routes/ and regenerates routeTree.gen.ts. Must run
      // before the React plugin.
      tanstackRouter({
        target: "react",
        routesDirectory: resolve("src/renderer/src/routes"),
        generatedRouteTree: resolve("src/renderer/src/routeTree.gen.ts"),
        autoCodeSplitting: true,
      }),
      tailwindcss(),
      react(),
    ],
  },
});
