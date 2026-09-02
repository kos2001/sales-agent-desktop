# Hermes Desktop — Web

Companion marketing/docs site for [Hermes Desktop](../README.md). This is a **separate package** from the Electron app:

- Built with **Next.js 15** (App Router) — file-based routing, static export
- **No runtime overlap** with the desktop renderer (which is Electron + Vite + React)
- Output is a fully static `out/` directory — deploy anywhere

## Why Next.js here (and not in the desktop app)

Next.js is designed around a Node server: SSR, Server Components, Server Actions, the image optimization endpoint. None of that runs inside an Electron renderer — the desktop app uses Vite + TanStack Router because there is no HTTP server in Electron, only IPC. For a public-facing marketing/docs site, however, Next.js is a great fit: file-based routing, automatic code splitting, easy static export.

## Develop

```sh
cd web
npm install
npm run dev      # http://localhost:3000
npm run build    # produces out/ for static hosting
```
