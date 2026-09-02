import { createFileRoute, useNavigate } from "@tanstack/react-router";
import Setup from "../screens/Setup/Setup";
import { useAppState } from "../lib/app-context";

function SetupRouteComponent(): React.JSX.Element {
  const navigate = useNavigate();
  const { verifyWarning, setVerifyWarning, setInstallError } = useAppState();

  return (
    <Setup
      onComplete={() => navigate({ to: "/main" })}
      verifyWarning={verifyWarning}
      onReinstall={() => {
        setVerifyWarning(false);
        setInstallError(null);
        navigate({ to: "/install" });
      }}
      onDismissVerifyWarning={() => setVerifyWarning(false)}
    />
  );
}

export const Route = createFileRoute("/setup")({
  component: SetupRouteComponent,
});
