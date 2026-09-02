import { useCallback, useEffect, useState } from "react";
import HermesLogo from "../../components/common/HermesLogo";
import {
  ArrowRight,
  Download,
  Monitor,
  Puzzle,
  Refresh,
} from "../../assets/icons";
import { useI18n } from "../../components/useI18n";

// The VersionStatus interface in src/preload/index.d.ts is module-scoped and
// not exported, so we derive the shape from the exposed API surface instead.
type VersionStatus = Awaited<
  ReturnType<Window["hermesAPI"]["checkVersionStatus"]>
>;

interface Props {
  status: VersionStatus;
  onSkip: () => void;
  onUpdated: () => void;
}

export default function VersionCheck({
  status,
  onSkip,
  onUpdated,
}: Props): React.JSX.Element {
  const { t } = useI18n();
  const [engineBusy, setEngineBusy] = useState(false);
  const [desktopBusy, setDesktopBusy] = useState(false);
  const [desktopReady, setDesktopReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const off = window.hermesAPI.onUpdateDownloaded(() => {
      setDesktopBusy(false);
      setDesktopReady(true);
    });
    return off;
  }, []);

  const onUpdateEngine = useCallback(async () => {
    setError(null);
    setEngineBusy(true);
    const result = await window.hermesAPI.runHermesUpdate();
    setEngineBusy(false);
    if (result.success) onUpdated();
    else setError(result.error ?? t("versionCheck.engineUpdateFailed"));
  }, [onUpdated, t]);

  const onUpdateDesktop = useCallback(async () => {
    setError(null);
    try {
      if (desktopReady) {
        await window.hermesAPI.installUpdate();
        return;
      }
      setDesktopBusy(true);
      await window.hermesAPI.downloadUpdate();
    } catch (e) {
      setDesktopBusy(false);
      setError((e as Error)?.message ?? t("versionCheck.engineUpdateFailed"));
    }
  }, [desktopReady, t]);

  const rows = [
    {
      key: "engine",
      name: t("versionCheck.engineName"),
      icon: <Puzzle size={18} />,
      data: status.engine,
      busy: engineBusy,
      busyLabel: t("versionCheck.updatingEngine"),
      actionLabel: t("versionCheck.updateEngine"),
      actionIcon: <Refresh size={15} />,
      onAction: onUpdateEngine,
    },
    {
      key: "desktop",
      name: t("versionCheck.desktopName"),
      icon: <Monitor size={18} />,
      data: status.desktop,
      busy: desktopBusy,
      busyLabel: t("versionCheck.downloadingDesktop"),
      actionLabel: desktopReady
        ? t("versionCheck.restartToUpdate")
        : t("versionCheck.downloadDesktop"),
      actionIcon: desktopReady ? <Refresh size={15} /> : <Download size={15} />,
      onAction: onUpdateDesktop,
    },
  ];

  return (
    <div className="screen version-check-screen">
      <HermesLogo size={40} />
      <h1 className="version-check-title">{t("versionCheck.title")}</h1>
      <p className="version-check-subtitle">{t("versionCheck.subtitle")}</p>

      <div className="version-check-list">
        {rows.map((r) => {
          const updateAvailable = r.data.updateAvailable;
          const current = r.data.current ?? "—";
          const latest = r.data.latest ?? t("versionCheck.unknown");
          return (
            <div key={r.key} className="version-check-card">
              <div className="version-check-card-icon" aria-hidden="true">
                {r.icon}
              </div>

              <div className="version-check-card-main">
                <span className="version-check-card-name">{r.name}</span>
                <span className="version-check-card-versions">
                  <span className="version-check-version" title={current}>
                    {current}
                  </span>
                  <ArrowRight size={12} className="version-check-arrow" />
                  <span className="version-check-version" title={latest}>
                    {latest}
                  </span>
                </span>
              </div>

              <div className="version-check-card-actions">
                <span
                  className={
                    updateAvailable
                      ? "version-check-badge version-check-badge-warning"
                      : "version-check-badge version-check-badge-success"
                  }
                >
                  {updateAvailable
                    ? t("versionCheck.updateAvailable")
                    : t("versionCheck.upToDate")}
                </span>
                {updateAvailable && (
                  <button
                    type="button"
                    className="btn btn-primary version-check-action-btn"
                    disabled={r.busy}
                    onClick={r.onAction}
                  >
                    {r.busy ? (
                      r.busyLabel
                    ) : (
                      <>
                        {r.actionIcon}
                        {r.actionLabel}
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {error && <p className="version-check-error">{error}</p>}

      <button
        type="button"
        className="btn-ghost version-check-skip"
        onClick={onSkip}
      >
        {t("versionCheck.skip")}
      </button>
    </div>
  );
}
