import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

// Ephemeral cross-route UI state that doesn't belong in a query cache:
// transient install errors surfaced on the Welcome screen, and the soft
// "verify failed" warning banner shown on Setup/Layout (#130).
interface AppState {
  installError: string | null;
  verifyWarning: boolean;
  setInstallError: (e: string | null) => void;
  setVerifyWarning: (v: boolean) => void;
}

const AppStateContext = createContext<AppState | null>(null);

export function AppStateProvider({
  children,
}: {
  children: ReactNode;
}): React.JSX.Element {
  const [installError, setInstallError] = useState<string | null>(null);
  const [verifyWarning, setVerifyWarningState] = useState(false);

  const setVerifyWarning = useCallback((v: boolean) => {
    setVerifyWarningState(v);
  }, []);

  const value = useMemo(
    () => ({
      installError,
      verifyWarning,
      setInstallError,
      setVerifyWarning,
    }),
    [installError, verifyWarning, setVerifyWarning],
  );

  return (
    <AppStateContext.Provider value={value}>
      {children}
    </AppStateContext.Provider>
  );
}

export function useAppState(): AppState {
  const ctx = useContext(AppStateContext);
  if (!ctx) {
    throw new Error("useAppState must be used inside <AppStateProvider>");
  }
  return ctx;
}
