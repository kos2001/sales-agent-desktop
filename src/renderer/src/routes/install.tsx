import { createFileRoute, useNavigate } from "@tanstack/react-router";
import Install from "../screens/Install/Install";
import { useAppState } from "../lib/app-context";

function InstallRouteComponent(): React.JSX.Element {
  const navigate = useNavigate();
  const { setInstallError } = useAppState();

  return (
    <Install
      onComplete={() => {
        setInstallError(null);
        navigate({ to: "/setup" });
      }}
      onFailed={(error: string) => {
        setInstallError(error);
        navigate({ to: "/welcome" });
      }}
      onCancel={() => navigate({ to: "/welcome" })}
    />
  );
}

export const Route = createFileRoute("/install")({
  component: InstallRouteComponent,
});
