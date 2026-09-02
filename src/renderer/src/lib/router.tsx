import { createMemoryHistory, createRouter } from "@tanstack/react-router";
import { routeTree } from "../routeTree.gen";

// File-based routing (Next.js-style DX). Routes live in src/renderer/src/routes/
// and `@tanstack/router-plugin/vite` regenerates routeTree.gen.ts on save.
//
// Memory history is used because Electron has no URL bar — navigation lives
// entirely in-process.
export const router = createRouter({
  routeTree,
  history: createMemoryHistory({ initialEntries: ["/"] }),
  defaultPreload: "intent",
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
