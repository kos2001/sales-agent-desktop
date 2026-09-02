import {
  createRootRoute,
  Outlet,
  useRouterState,
} from "@tanstack/react-router";
import { useEffect } from "react";
import { ThemeProvider } from "../components/ThemeProvider";
import ErrorBoundary from "../components/ErrorBoundary";
import { AppStateProvider } from "../lib/app-context";
import { captureScreenView } from "../utils/analytics";

function RootComponent(): React.JSX.Element {
  const isMac = window.electron?.process?.platform === "darwin";

  const pathname = useRouterState({ select: (s) => s.location.pathname });
  useEffect(() => {
    const screen = pathname === "/" ? "splash" : pathname.replace(/^\//, "");
    captureScreenView(screen);
  }, [pathname]);

  return (
    <ThemeProvider>
      <ErrorBoundary>
        <AppStateProvider>
          <div className="app">
            {isMac && <div className="drag-region" />}
            <div className="app-content">
              <Outlet />
            </div>
          </div>
        </AppStateProvider>
      </ErrorBoundary>
    </ThemeProvider>
  );
}

export const Route = createRootRoute({ component: RootComponent });
