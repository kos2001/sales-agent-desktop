import { QueryClient } from "@tanstack/react-query";

// Electron-tuned defaults. The renderer talks to the main process over IPC,
// not the network, so:
//   - networkMode "always" — there is no "offline" state to detect.
//   - refetchOnWindowFocus disabled — switching desktop apps shouldn't
//     trigger a refetch storm; IPC handlers explicitly invalidate.
//   - staleTime defaults to a few seconds so rapid re-renders don't
//     hammer the main process for the same data.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      networkMode: "always",
      refetchOnWindowFocus: false,
      retry: false,
      staleTime: 5_000,
    },
    mutations: {
      networkMode: "always",
      retry: false,
    },
  },
});
