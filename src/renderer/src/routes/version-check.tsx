import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import VersionCheck from "../screens/VersionCheck/VersionCheck";
import {
  BOOTSTRAP_NEXT_QUERY_KEY,
  VERSION_STATUS_QUERY_KEY,
} from "../lib/queryKeys";

function VersionCheckRouteComponent(): React.JSX.Element {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data, isError } = useQuery({
    queryKey: VERSION_STATUS_QUERY_KEY,
    queryFn: () => window.hermesAPI.checkVersionStatus(),
    staleTime: Infinity,
  });

  const next =
    (queryClient.getQueryData(BOOTSTRAP_NEXT_QUERY_KEY) as
      | string
      | undefined) ?? "main";

  const onSkip = useCallback(() => {
    navigate({ to: `/${next}` });
  }, [navigate, next]);

  const onUpdated = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: VERSION_STATUS_QUERY_KEY });
  }, [queryClient]);

  // If the status check itself fails, there is nothing to gate on — skip ahead
  // rather than leaving the user stuck on the loading skeleton forever.
  useEffect(() => {
    if (isError) navigate({ to: `/${next}` });
  }, [isError, navigate, next]);

  if (!data) return <div className="min-h-screen" />;

  return <VersionCheck status={data} onSkip={onSkip} onUpdated={onUpdated} />;
}

export const Route = createFileRoute("/version-check")({
  component: VersionCheckRouteComponent,
});
