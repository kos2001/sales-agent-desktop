import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import Welcome from "../screens/Welcome/Welcome";
import { useAppState } from "../lib/app-context";

function WelcomeRouteComponent(): React.JSX.Element {
  const navigate = useNavigate();
  const { installError, setInstallError } = useAppState();

  const { data: conn } = useQuery({
    queryKey: ["connection-config"],
    queryFn: () => window.hermesAPI.getConnectionConfig(),
  });
  const connectionMode = conn?.mode ?? "local";

  const onStart = useCallback(() => {
    setInstallError(null);
    navigate({ to: "/install" });
  }, [navigate, setInstallError]);

  const onRecheck = useCallback(() => {
    setInstallError(null);
    navigate({ to: "/" });
  }, [navigate, setInstallError]);

  const onSwitchToLocal = useCallback(async () => {
    await window.hermesAPI.setConnectionConfig("local", "", "");
    setInstallError(null);
    navigate({ to: "/" });
  }, [navigate, setInstallError]);

  return (
    <Welcome
      error={installError}
      connectionMode={connectionMode}
      onStart={onStart}
      onRecheck={onRecheck}
      onSwitchToLocal={onSwitchToLocal}
    />
  );
}

export const Route = createFileRoute("/welcome")({
  component: WelcomeRouteComponent,
});
