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
    // Pinned, and strict about it.
    //
    // With no server config, Vite takes 5173 and — when something else
    // already has it — silently walks to the next free port. On a machine
    // running several of these projects that means the dev server lands
    // somewhere different every launch. The failure that surfaced it: the
    // renderer came up on 5174 because a sibling project held 5173, the dev
    // server was later killed while its Electron child survived as an orphan
    // (reparented to launchd), and the window sat there pointing at a dead
    // 5174 showing nothing. A blank app with no error is the worst possible
    // symptom for a silent port change.
    //
    // A project-specific port with strictPort makes the address predictable
    // and turns a conflict into a startup error naming the port instead of a
    // blank window ten minutes later.
    server: {
      port: 5273,
      strictPort: true,
    },
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
