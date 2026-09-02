import { useEffect, useState, useRef } from "react";
import { ArrowRight, Copy, Send } from "../../assets/icons";

const TELEGRAM_COMMUNITY_URL = "https://t.me/hermes_agent_desktop";
import { useI18n } from "../../components/useI18n";

interface InstallProgress {
  step: number;
  totalSteps: number;
  title: string;
  detail: string;
  log: string;
}

interface InstallTarget {
  hermesHome: string;
  repoPath: string;
  state: "fresh" | "update" | "replace";
}

interface InstallProps {
  onComplete: () => void;
  onFailed: (error: string) => void;
  onCancel: () => void;
}

function Install({
  onComplete,
  onFailed,
  onCancel,
}: InstallProps): React.JSX.Element {
  const { t } = useI18n();
  // Gate the install behind an explicit confirmation so it can't run
  // silently and surprise a user who already has Hermes installed (#272).
  const [phase, setPhase] = useState<"confirm" | "running">("confirm");
  const [target, setTarget] = useState<InstallTarget | null>(null);
  const [useExistingError, setUseExistingError] = useState<string | null>(null);
  // Set once the user adopts an existing install — the new location only
  // applies on the next launch, so we ask them to restart.
  const [adopted, setAdopted] = useState(false);
  const [progress, setProgress] = useState<InstallProgress>({
    step: 0,
    totalSteps: 7,
    title: t("install.preparing"),
    detail: t("install.startingInstall"),
    log: "",
  });
  const [done, setDone] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);

  // Corporate-network (proxy / mirror) install settings + connectivity check.
  type CorpCfg = {
    enabled: boolean;
    httpsProxy: string;
    noProxy: string;
    pypiIndexUrl: string;
    gitMirrorBase: string;
    pythonInstallMirror: string;
    playwrightDownloadHost: string;
  };
  type Probe = {
    id: string;
    label: string;
    host: string;
    ok: boolean;
    status?: number;
    hint?: string;
  };
  const [corp, setCorp] = useState<CorpCfg>({
    enabled: false,
    httpsProxy: "",
    noProxy: "",
    pypiIndexUrl: "",
    gitMirrorBase: "",
    pythonInstallMirror: "",
    playwrightDownloadHost: "",
  });
  const [showCorp, setShowCorp] = useState(false);
  const [probes, setProbes] = useState<Probe[] | null>(null);
  const [diagnosing, setDiagnosing] = useState(false);

  useEffect(() => {
    let mounted = true;
    window.hermesAPI.getCorporateNetwork().then((c) => {
      if (mounted) setCorp(c);
    });
    return () => {
      mounted = false;
    };
  }, []);

  function updateCorp(patch: Partial<CorpCfg>): void {
    setCorp((prev) => {
      const next = { ...prev, ...patch };
      window.hermesAPI.setCorporateNetwork(next);
      return next;
    });
  }

  async function handleDiagnose(): Promise<void> {
    setDiagnosing(true);
    try {
      const results = await window.hermesAPI.runPreflight(corp);
      setProbes(results);
    } finally {
      setDiagnosing(false);
    }
  }

  // Inspect what the installer will do to the target directory, so the
  // confirmation can say exactly what to expect (fresh / update / replace).
  useEffect(() => {
    let mounted = true;
    window.hermesAPI
      .inspectInstallTarget()
      .then((info) => {
        if (mounted) setTarget(info);
      })
      .catch(() => {
        /* leave target null — the confirmation falls back to generic copy */
      });
    return () => {
      mounted = false;
    };
  }, []);

  // The install itself runs only once the user confirms.
  useEffect(() => {
    if (phase !== "running") return;
    let isMounted = true;
    const cleanup = window.hermesAPI.onInstallProgress((p) => {
      if (isMounted) setProgress(p);
    });

    window.hermesAPI
      .startInstall()
      .then((result) => {
        if (!isMounted) return;
        if (result.success) {
          setDone(true);
        } else {
          setFailed(result.error || t("install.installationFailedHint"));
        }
      })
      .catch((err) => {
        if (!isMounted) return;
        setFailed(err.message || t("install.installationFailedHint"));
      });

    return () => {
      isMounted = false;
      cleanup();
    };
  }, [phase]);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [progress.log]);

  function handleCopyLogs(): void {
    const text = `Installation Error:\n${failed}\n\n--- Full Log ---\n${progress.log}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // "Use an existing installation": let the user point the app at a Hermes
  // install it didn't auto-detect. A valid pick is persisted; the app must
  // restart to adopt it (#272).
  async function handleUseExisting(): Promise<void> {
    setUseExistingError(null);
    const dir = await window.hermesAPI.selectFolder();
    if (!dir) return;
    const ok = await window.hermesAPI.validateHermesHome(dir);
    if (!ok) {
      setUseExistingError(t("install.useExistingInvalid"));
      return;
    }
    const saved = await window.hermesAPI.adoptHermesHome(dir);
    if (saved) {
      setAdopted(true);
    } else {
      // Lost a race (dir changed between validate and adopt).
      setUseExistingError(t("install.useExistingInvalid"));
    }
  }

  const percent =
    progress.totalSteps > 0
      ? Math.round((progress.step / progress.totalSteps) * 100)
      : 0;

  if (phase === "confirm") {
    // After adopting an existing install, the choice only applies on the
    // next launch — ask the user to restart.
    if (adopted) {
      return (
        <div className="screen install-screen">
          <h1 className="install-title">{t("install.confirmTitle")}</h1>
          <div className="install-confirm">
            <p className="install-confirm-state">
              {t("install.useExistingDone")}
            </p>
            <div className="install-confirm-actions">
              <button
                className="btn btn-primary"
                onClick={() => window.hermesAPI.quitApp()}
              >
                {t("install.useExistingQuitBtn")}
              </button>
            </div>
          </div>
        </div>
      );
    }

    const stateMessage =
      target?.state === "update"
        ? t("install.confirmUpdate")
        : target?.state === "replace"
          ? t("install.confirmReplace")
          : t("install.confirmFresh");

    return (
      <div className="screen install-screen">
        <h1 className="install-title">{t("install.confirmTitle")}</h1>

        <div className="install-confirm">
          <div className="install-confirm-location">
            <span className="install-confirm-label">
              {t("install.confirmLocationLabel")}
            </span>
            <code className="install-confirm-path">
              {target?.repoPath || "…"}
            </code>
          </div>

          <p
            className={`install-confirm-state install-confirm-state--${
              target?.state ?? "fresh"
            }`}
          >
            {stateMessage}
          </p>
          <p className="install-confirm-note">
            {t("install.confirmNotInherited")}
          </p>

          <div className="install-confirm-actions">
            <button
              className="btn btn-primary"
              onClick={() => setPhase("running")}
            >
              {t("install.confirmInstallBtn")}
            </button>
            <button className="btn btn-secondary" onClick={handleUseExisting}>
              {t("install.useExistingBtn")}
            </button>
            <button className="btn btn-secondary" onClick={onCancel}>
              {t("common.cancel")}
            </button>
          </div>
          <p className="install-confirm-hint">{t("install.useExistingHint")}</p>
          {useExistingError && (
            <p className="install-confirm-error">{useExistingError}</p>
          )}

          <div className="install-corp">
            <button
              type="button"
              className="install-corp-toggle"
              onClick={() => setShowCorp((v) => !v)}
            >
              {t("install.corp.sectionTitle")}
            </button>
            {showCorp && (
              <div className="install-corp-body">
                <p className="install-corp-hint">
                  {t("install.corp.sectionHint")}
                </p>
                <label className="install-corp-check">
                  <input
                    type="checkbox"
                    checked={corp.enabled}
                    onChange={(e) => updateCorp({ enabled: e.target.checked })}
                  />
                  {t("install.corp.enableLabel")}
                </label>
                <label className="install-corp-field">
                  {t("install.corp.proxyLabel")}
                  <input
                    type="text"
                    value={corp.httpsProxy}
                    placeholder="http://proxy.corp:8080"
                    onChange={(e) => updateCorp({ httpsProxy: e.target.value })}
                  />
                </label>
                <label className="install-corp-field">
                  {t("install.corp.noProxyLabel")}
                  <input
                    type="text"
                    value={corp.noProxy}
                    placeholder="localhost,.corp"
                    onChange={(e) => updateCorp({ noProxy: e.target.value })}
                  />
                </label>
                <label className="install-corp-field">
                  {t("install.corp.pypiLabel")}
                  <input
                    type="text"
                    value={corp.pypiIndexUrl}
                    placeholder="https://pypi.corp/simple/"
                    onChange={(e) =>
                      updateCorp({ pypiIndexUrl: e.target.value })
                    }
                  />
                </label>
                <label className="install-corp-field">
                  {t("install.corp.gitMirrorLabel")}
                  <input
                    type="text"
                    value={corp.gitMirrorBase}
                    placeholder="https://gitmirror.corp/"
                    onChange={(e) =>
                      updateCorp({ gitMirrorBase: e.target.value })
                    }
                  />
                </label>
                <label className="install-corp-field">
                  {t("install.corp.pythonMirrorLabel")}
                  <input
                    type="text"
                    value={corp.pythonInstallMirror}
                    placeholder="https://pymirror.corp/python"
                    onChange={(e) =>
                      updateCorp({ pythonInstallMirror: e.target.value })
                    }
                  />
                </label>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={handleDiagnose}
                  disabled={diagnosing}
                >
                  {diagnosing
                    ? t("install.corp.diagnosing")
                    : t("install.corp.diagnose")}
                </button>
                {probes && (
                  <ul className="install-corp-probes">
                    {probes.map((p) => (
                      <li
                        key={p.id}
                        className={p.ok ? "probe-ok" : "probe-blocked"}
                      >
                        {p.ok ? "✅" : "❌"} {p.label} ({p.host})
                        {p.ok
                          ? ` — ${t("install.corp.reachable")}`
                          : ` — ${t("install.corp.blocked")}${
                              p.hint ? `: ${p.hint}` : ""
                            }`}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="screen install-screen">
      <h1 className="install-title">
        {done
          ? t("install.installationComplete")
          : failed
            ? t("install.installationFailed")
            : t("install.installingHermes")}
      </h1>

      <div className="install-progress-container">
        <div className="install-progress-bar">
          <div
            className={`install-progress-fill ${failed ? "install-progress-fill--error" : ""}`}
            style={{ width: `${done ? 100 : percent}%` }}
          />
        </div>
        <div className="install-percent">{done ? "100" : percent}%</div>
      </div>

      {failed && (
        <div className="install-error-banner">
          <p className="install-error-text">{failed}</p>
          <div className="install-error-actions">
            <button
              className="btn btn-primary btn-sm"
              onClick={() => {
                setFailed(null);
                setProgress({
                  step: 0,
                  totalSteps: 7,
                  title: t("install.preparing"),
                  detail: t("install.startingInstall"),
                  log: "",
                });
                // Re-trigger install via parent
                onFailed(failed);
              }}
            >
              {t("install.retryInstallation")}
            </button>
            <button
              className="btn btn-secondary btn-sm"
              onClick={handleCopyLogs}
            >
              <Copy size={13} />
              {copied ? t("install.copied") : t("install.copyLogs")}
            </button>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() =>
                window.hermesAPI.openExternal(TELEGRAM_COMMUNITY_URL)
              }
              title={TELEGRAM_COMMUNITY_URL}
            >
              <Send size={13} />
              Join Community
            </button>
          </div>
        </div>
      )}

      {!done && !failed && (
        <div className="install-step-info">
          <div className="install-step-title">
            {t("install.stepLabel", {
              step: progress.step,
              total: progress.totalSteps,
              title: progress.title,
            })}
          </div>
          <div className="install-step-detail">{progress.detail}</div>
        </div>
      )}

      <div className="install-log" ref={logRef}>
        {progress.log || t("install.waitingToStart")}
      </div>

      {done && (
        <div className="install-done">
          <button className="btn btn-primary" onClick={onComplete}>
            {t("install.continueToSetup")}
            <ArrowRight size={16} />
          </button>
        </div>
      )}
    </div>
  );
}

export default Install;
