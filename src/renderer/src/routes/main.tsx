import { createFileRoute, useNavigate } from "@tanstack/react-router";
import Layout from "../screens/Layout/Layout";
import { useAppState } from "../lib/app-context";

function MainRouteComponent(): React.JSX.Element {
  const navigate = useNavigate();
  const { verifyWarning, setVerifyWarning, setInstallError } = useAppState();

  return (
    <Layout
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

export const Route = createFileRoute("/main")({
  component: MainRouteComponent,
});
