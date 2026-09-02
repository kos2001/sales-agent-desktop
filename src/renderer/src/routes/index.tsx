import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import SplashScreen from "../screens/SplashScreen/SplashScreen";
import { useAppState } from "../lib/app-context";
import { BOOTSTRAP_NEXT_QUERY_KEY } from "../lib/queryKeys";

const SPLASH_MIN_MS = 1300;

interface BootstrapResult {
  next: "welcome" | "setup" | "main" | "version-check";
  normalNext: "welcome" | "setup" | "main";
  error: string | null;
  connectionMode: "local" | "remote" | "ssh";
  isRemote: boolean;
}

async function runBootstrap(): Promise<BootstrapResult> {
  try {
    const conn = await window.hermesAPI.getConnectionConfig();
    const isRemote = conn.mode === "remote" || conn.mode === "ssh";

    if (conn.mode === "ssh" && conn.ssh) {
      try {
        await window.hermesAPI.startSshTunnel();
        return {
          next: "main",
          normalNext: "main",
          error: null,
          connectionMode: conn.mode,
          isRemote,
        };
      } catch (tunnelErr) {
        return {
          next: "welcome",
          normalNext: "welcome",
          error: `SSH tunnel failed to start: ${(tunnelErr as Error).message}`,
          connectionMode: conn.mode,
          isRemote,
        };
      }
    }

    if (conn.mode === "remote" && conn.remoteUrl) {
      const ok = await window.hermesAPI.testRemoteConnection(conn.remoteUrl);
      return ok
        ? {
            next: "main",
            normalNext: "main",
            error: null,
            connectionMode: conn.mode,
            isRemote,
          }
        : {
            next: "welcome",
            normalNext: "welcome",
            error: `Cannot reach remote Hermes at ${conn.remoteUrl}. Check the URL or switch to local mode.`,
            connectionMode: conn.mode,
            isRemote,
          };
    }

    const [status, versionStatus] = await Promise.all([
      window.hermesAPI.checkInstall(),
      // Never let a version-check failure block onboarding — degrade to null.
      window.hermesAPI.checkVersionStatus().catch(() => null),
    ]);

    const normalNext: "welcome" | "setup" | "main" = !status.installed
      ? "welcome"
      : !status.hasApiKey
        ? "setup"
        : "main";

    // First onboarding gate: surface available upgrades (engine vs GitHub
    // latest release, desktop vs electron-updater) before the normal flow.
    // Never blocks — main-process failures degrade to updateAvailable:false,
    // and a thrown call was already caught to null above.
    const next: BootstrapResult["next"] =
      versionStatus &&
      (versionStatus.engine.updateAvailable ||
        versionStatus.desktop.updateAvailable)
        ? "version-check"
        : normalNext;

    return {
      next,
      normalNext,
      error: null,
      connectionMode: "local",
      isRemote: false,
    };
  } catch {
    return {
      next: "welcome",
      normalNext: "welcome",
      error: null,
      connectionMode: "local",
      isRemote: false,
    };
  }
}

function SplashRouteComponent(): React.JSX.Element {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { setInstallError, setVerifyWarning } = useAppState();

  const { data } = useQuery({
    queryKey: ["bootstrap"],
    queryFn: runBootstrap,
    staleTime: Infinity,
    gcTime: Infinity,
  });

  useEffect(() => {
    if (!data) return;
    const startedAt = performance.now();

    if (data.error) setInstallError(data.error);

    // Stash the skip target so the version-check route knows where
    // "Skip and continue" should navigate.
    queryClient.setQueryDefaults(BOOTSTRAP_NEXT_QUERY_KEY, { gcTime: Infinity });
    queryClient.setQueryData(BOOTSTRAP_NEXT_QUERY_KEY, data.normalNext);

    const elapsed = performance.now() - startedAt;
    const wait = Math.max(0, SPLASH_MIN_MS - elapsed);
    const handle = window.setTimeout(() => {
      navigate({ to: `/${data.next}` });
    }, wait);

    // Skip verifyInstall() in remote mode — it probes the LOCAL Python
    // install which doesn't exist when only a remote backend is configured
    // (#47, #41, #30, #130). Key off normalNext (not next) so the soft
    // verify-warning still runs when we detour through version-check.
    if (
      (data.normalNext === "main" || data.normalNext === "setup") &&
      !data.isRemote
    ) {
      window.hermesAPI.verifyInstall().then((ok) => {
        if (!ok) setVerifyWarning(true);
      });
    }

    return () => window.clearTimeout(handle);
  }, [data, navigate, queryClient, setInstallError, setVerifyWarning]);

  return <SplashScreen onFinished={() => undefined} />;
}

export const Route = createFileRoute("/")({ component: SplashRouteComponent });
