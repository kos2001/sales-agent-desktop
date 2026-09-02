import { useEffect, useState, useRef, useCallback } from "react";
import { Search, X, Trash, Check } from "../../assets/icons";
import { useI18n } from "../../components/useI18n";
import { sessionLabel, disambiguateLabels } from "../../lib/sessionLabel";

// Claude-desktop-style recent-conversations list that lives at the bottom of
// the sidebar. It mirrors the Sessions tab's data source (the synced session
// cache) but shows only the most recent few; "See all" opens the full
// Sessions screen for date-grouping and unbounded history.
const RECENT_LIMIT = 15;
// Same cadence as the Sessions tab (SESSIONS_REFRESH_MS) so background-created
// sessions surface without a manual refresh.
const REFRESH_MS = 30_000;

interface CachedSession {
  id: string;
  title: string;
  startedAt: number;
  source: string;
  messageCount: number;
  model: string;
  dbTitle?: string;
  summary?: string;
  summaryAtCount?: number;
  summaryLlm?: boolean;
}

interface SidebarSessionsProps {
  currentSessionId: string | null;
  onResumeSession: (sessionId: string) => void;
  onSeeAll: () => void;
  collapsed: boolean;
  /** Called after a session is deleted (e.g. so the Layout can start a fresh
   *  chat if the deleted conversation was the one currently open). */
  onSessionDeleted?: (sessionId: string) => void;
}

interface ListItem {
  id: string;
  title: string;
}

function SidebarSessions({
  currentSessionId,
  onResumeSession,
  onSeeAll,
  collapsed,
  onSessionDeleted,
}: SidebarSessionsProps): React.JSX.Element | null {
  const { t } = useI18n();
  const [sessions, setSessions] = useState<CachedSession[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<ListItem[]>([]);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Track session ids we've already requested a summary for this mount so a
  // re-render or re-sync doesn't re-fire the same request. Cleared only on
  // unmount; a stale summary (messageCount changed) is re-requested under a
  // distinct key so growing conversations still refresh.
  const summaryRequested = useRef<Set<string>>(new Set());
  // Flips false only on real unmount, so a late-resolving summary request
  // (which we deliberately never cancel) doesn't setState after teardown.
  const mountedRef = useRef(true);
  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const refresh = useCallback(async (): Promise<void> => {
    try {
      const synced = await window.hermesAPI.syncSessionCache();
      setSessions(synced.slice(0, RECENT_LIMIT));
    } catch {
      // Non-fatal: keep whatever is already shown.
    }
  }, []);

  // Initial load + refresh when the active session changes (a new chat or a
  // resumed/continued conversation reorders the recents).
  useEffect(() => {
    void refresh();
  }, [refresh, currentSessionId]);

  // Periodic + on-focus re-sync, matching the Sessions tab behaviour.
  useEffect(() => {
    const timer = setInterval(() => void refresh(), REFRESH_MS);
    const onFocus = (): void => void refresh();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [refresh]);

  // Debounced search over the full history (reuses the Sessions search API).
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    searchTimer.current = setTimeout(async () => {
      const results = await window.hermesAPI.searchSessions(searchQuery, 20);
      setSearchResults(
        results.map((r) => ({
          id: r.sessionId,
          title: r.title || t("sessions.newConversation"),
        })),
      );
    }, 300);
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [searchQuery, t]);

  // Lazily upgrade visible recents to a model-quality summary. The cache
  // already carries an instant offline (extractive) summary; here we request
  // the LLM summary (de-identified → model → re-identified, in main) for any
  // item that isn't model-summarized yet. `summaryRequested` dedupes per mount
  // (keyed by id+count); in-flight requests are never cancelled on re-sync.
  useEffect(() => {
    if (collapsed) return;
    const stale = sessions.filter((s) => {
      // Summarize a session only AFTER it has ended — never the one the user
      // is actively chatting in. Re-summarizing a live session on every new
      // message floods the gateway (each call forks a throwaway session) and
      // produces churning, half-finished titles. The active session gets its
      // summary once the user leaves it and it appears here as a past chat.
      if (s.id === currentSessionId) return false;
      // Skip sessions Hermes already titled — we prefer that stable title and
      // would only override it with a churning gateway summary. Only the
      // desktop's own untitled (api_server) chats actually need summarizing.
      if (s.dbTitle) return false;
      const fresh = s.summaryLlm && (s.summaryAtCount ?? -1) === s.messageCount;
      if (fresh) return false;
      const key = `${s.id}:${s.messageCount}`;
      if (summaryRequested.current.has(key)) return false;
      summaryRequested.current.add(key);
      return true;
    });
    if (stale.length === 0) return;

    // LLM summaries are network calls — cap concurrency to avoid bursts.
    let i = 0;
    const runOne = async (item: CachedSession): Promise<void> => {
      const count = item.messageCount;
      try {
        const summary = await window.hermesAPI.summarizeSession(item.id);
        if (!mountedRef.current || !summary) return;
        setSessions((prev) =>
          prev.map((x) =>
            x.id === item.id
              ? { ...x, summary, summaryAtCount: count, summaryLlm: true }
              : x,
          ),
        );
      } catch {
        // Non-fatal — leave the existing summary/title in place.
      }
    };
    const worker = async (): Promise<void> => {
      while (i < stale.length) await runOne(stale[i++]);
    };
    void Promise.all(
      Array.from({ length: Math.min(3, stale.length) }, () => worker()),
    );
  }, [sessions, collapsed, currentSessionId]);

  // Delete a session's data via the main process, drop it from the local
  // lists, and let the Layout reset Chat if the deleted one was open.
  const handleDelete = useCallback(
    async (id: string): Promise<void> => {
      setConfirmDelete(null);
      try {
        await window.hermesAPI.deleteSession(id);
      } catch {
        // Non-fatal: a failed delete just leaves the item in place.
        return;
      }
      setSessions((prev) => prev.filter((s) => s.id !== id));
      setSearchResults((prev) => prev.filter((r) => r.id !== id));
      onSessionDeleted?.(id);
    },
    [onSessionDeleted],
  );

  // Collapsed (icon-only) sidebar has no room for the list — hide it entirely;
  // the Sessions nav icon still reaches the full screen.
  if (collapsed) return null;

  const isSearching = searchQuery.trim().length > 0;
  const items: ListItem[] = isSearching
    ? searchResults
    : disambiguateLabels(
        sessions.map((s) => ({
          id: s.id,
          label: sessionLabel(s),
          startedAt: s.startedAt,
        })),
      ).map((it) => ({ id: it.id, title: it.label }));

  return (
    <div className="sidebar-sessions">
      <div className="sidebar-sessions-search">
        <Search size={13} aria-hidden />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={t("sessions.searchPlaceholder")}
          aria-label={t("sessions.searchPlaceholder")}
        />
        {searchQuery && (
          <button
            type="button"
            className="sidebar-sessions-search-clear"
            onClick={() => setSearchQuery("")}
            aria-label={t("common.close")}
          >
            <X size={12} aria-hidden />
          </button>
        )}
      </div>

      <div className="sidebar-sessions-label">
        {isSearching ? t("sessions.title") : t("navigation.recent")}
      </div>

      <div className="sidebar-sessions-list">
        {items.length === 0 ? (
          <div className="sidebar-sessions-empty">
            {isSearching ? t("sessions.noResults") : t("sessions.empty")}
          </div>
        ) : (
          items.map((it) => (
            <div key={it.id} className="sidebar-session-row">
              <button
                type="button"
                className={`sidebar-session-item ${
                  it.id === currentSessionId ? "active" : ""
                }`}
                onClick={() => onResumeSession(it.id)}
                title={it.title}
              >
                {it.title}
              </button>
              {confirmDelete === it.id ? (
                <div className="sidebar-session-confirm">
                  <button
                    type="button"
                    className="sidebar-session-confirm-yes"
                    title={t("sessions.deleteYes")}
                    aria-label={t("sessions.deleteYes")}
                    onClick={() => void handleDelete(it.id)}
                  >
                    <Check size={12} aria-hidden />
                  </button>
                  <button
                    type="button"
                    className="sidebar-session-confirm-no"
                    title={t("sessions.deleteNo")}
                    aria-label={t("sessions.deleteNo")}
                    onClick={() => setConfirmDelete(null)}
                  >
                    <X size={12} aria-hidden />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="sidebar-session-delete"
                  title={t("sessions.delete")}
                  aria-label={t("sessions.delete")}
                  onClick={() => setConfirmDelete(it.id)}
                >
                  <Trash size={12} aria-hidden />
                </button>
              )}
            </div>
          ))
        )}
      </div>

      {!isSearching && (
        <button
          type="button"
          className="sidebar-sessions-seeall"
          onClick={onSeeAll}
        >
          {t("navigation.seeAll")}
        </button>
      )}
    </div>
  );
}

export default SidebarSessions;
