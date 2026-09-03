import { useEffect, useState, useRef, useCallback, memo } from "react";
import { Plus, Search, X, ChatBubble, Trash } from "../../assets/icons";
import { useI18n } from "../../components/useI18n";
import { sessionLabel, disambiguateLabels } from "../../lib/sessionLabel";
import {
  PLAYBOOK_GROUPS,
  type PlaybookGroup,
} from "../../../../shared/sales-playbooks";
import { classifySession } from "../../../../shared/session-category";

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

interface SearchResult {
  sessionId: string;
  title: string | null;
  startedAt: number;
  source: string;
  messageCount: number;
  model: string;
  snippet: string;
}

interface SessionsProps {
  onResumeSession: (sessionId: string) => void;
  onNewChat: () => void;
  currentSessionId: string | null;
  visible: boolean;
}

function formatTime(ts: number): string {
  const d = new Date(ts * 1000);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatFullDate(ts: number): string {
  const d = new Date(ts * 1000);
  return (
    d.toLocaleDateString([], { month: "short", day: "numeric" }) +
    ", " +
    d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  );
}

type DateGroup = "today" | "yesterday" | "thisWeek" | "earlier";

function getDateGroup(ts: number): DateGroup {
  const d = new Date(ts * 1000);
  const now = new Date();

  const isToday =
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear();
  if (isToday) return "today";

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday =
    d.getDate() === yesterday.getDate() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getFullYear() === yesterday.getFullYear();
  if (isYesterday) return "yesterday";

  const weekAgo = new Date(now);
  weekAgo.setDate(weekAgo.getDate() - 7);
  if (d >= weekAgo) return "thisWeek";

  return "earlier";
}

function groupSessions(
  sessions: CachedSession[],
): Array<{ label: DateGroup; sessions: CachedSession[] }> {
  const groups = new Map<DateGroup, CachedSession[]>();
  for (const s of sessions) {
    const group = getDateGroup(s.startedAt);
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group)!.push(s);
  }
  const order: DateGroup[] = ["today", "yesterday", "thisWeek", "earlier"];
  return order
    .filter((label) => groups.has(label))
    .map((label) => ({ label, sessions: groups.get(label)! }));
}

/**
 * Grouping by work area rather than by date. Sessions the classifier cannot
 * place with confidence land in a trailing "기타" bucket instead of being
 * guessed into a group — a conversation filed under the wrong heading is one
 * the user will never look for.
 */
const UNCATEGORIZED = "uncategorized" as const;
type CategoryKey = PlaybookGroup | typeof UNCATEGORIZED;

function groupSessionsByCategory(
  sessions: CachedSession[],
): Array<{ key: CategoryKey; sessions: CachedSession[] }> {
  const groups = new Map<CategoryKey, CachedSession[]>();
  for (const s of sessions) {
    const key: CategoryKey = classifySession(s) ?? UNCATEGORIZED;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(s);
  }
  // Catalogue order, so the headings read in the same order as the Tasks
  // screen; "기타" always last.
  const order: CategoryKey[] = [
    ...PLAYBOOK_GROUPS.map((g) => g.id),
    UNCATEGORIZED,
  ];
  return order
    .filter((key) => groups.has(key))
    .map((key) => ({ key, sessions: groups.get(key)! }));
}

const GROUP_TITLE_BY_ID = new Map(PLAYBOOK_GROUPS.map((g) => [g.id, g.title]));

export const GROUP_MODE_KEY = "sessions-group-mode";

function highlightSnippet(snippet: string): React.JSX.Element {
  const parts = snippet.split(/(<<.*?>>)/g);
  return (
    <span>
      {parts.map((part, i) => {
        if (part.startsWith("<<") && part.endsWith(">>")) {
          return <mark key={i}>{part.slice(2, -2)}</mark>;
        }
        return <span key={i}>{part}</span>;
      })}
    </span>
  );
}

function formatModel(model: string): string {
  const name = model.split("/").pop() || model;
  // Shorten common patterns: "gpt-oss-20b:free" → "gpt-oss-20b"
  return name.split(":")[0];
}

// Hover/confirm delete control shared by the grouped list and search results.
// Rendered as a sibling of the (button) card — never nested inside it — so the
// markup stays valid and clicks don't bubble into "open session".
function DeleteControl({
  confirming,
  onRequest,
  onConfirm,
  onCancel,
}: {
  confirming: boolean;
  onRequest: () => void;
  onConfirm: () => void;
  onCancel: () => void;
}): React.JSX.Element {
  const { t } = useI18n();
  if (confirming) {
    return (
      <div
        className="sessions-card-confirm"
        onClick={(e) => e.stopPropagation()}
      >
        <span>{t("sessions.deleteConfirm")}</span>
        <button
          type="button"
          className="btn btn-sm btn-danger-text"
          onClick={onConfirm}
        >
          {t("sessions.deleteYes")}
        </button>
        <button type="button" className="btn btn-sm" onClick={onCancel}>
          {t("sessions.deleteNo")}
        </button>
      </div>
    );
  }
  return (
    <button
      type="button"
      className="btn-ghost sessions-card-delete"
      title={t("sessions.delete")}
      aria-label={t("sessions.delete")}
      onClick={(e) => {
        e.stopPropagation();
        onRequest();
      }}
    >
      <Trash size={14} />
    </button>
  );
}

// Memoized session card
const SessionCard = memo(function SessionCard({
  session,
  label,
  isActive,
  showFullDate,
  confirming,
  onClick,
  onRequestDelete,
  onConfirmDelete,
  onCancelDelete,
}: {
  session: CachedSession;
  label: string;
  isActive: boolean;
  showFullDate: boolean;
  confirming: boolean;
  onClick: () => void;
  onRequestDelete: () => void;
  onConfirmDelete: () => void;
  onCancelDelete: () => void;
}) {
  return (
    <div className="sessions-card-wrap">
      <button
        className={`sessions-card ${isActive ? "sessions-card--active" : ""}`}
        onClick={onClick}
      >
        <div className="sessions-card-main">
          <span className="sessions-card-title">{label}</span>
          <span className="sessions-card-time">
            {showFullDate
              ? formatFullDate(session.startedAt)
              : formatTime(session.startedAt)}
          </span>
        </div>
        <div className="sessions-card-tags">
          <span className="sessions-tag sessions-tag--source">
            {session.source}
          </span>
          <span className="sessions-tag">
            {session.messageCount} msg{session.messageCount !== 1 ? "s" : ""}
          </span>
          {session.model && (
            <span className="sessions-tag sessions-tag--model">
              {formatModel(session.model)}
            </span>
          )}
        </div>
      </button>
      <DeleteControl
        confirming={confirming}
        onRequest={onRequestDelete}
        onConfirm={onConfirmDelete}
        onCancel={onCancelDelete}
      />
    </div>
  );
});

// How often the Sessions tab re-syncs from state.db while it is open, so
// sessions created in the background (cron jobs, gateway platforms, another
// device) surface without the user navigating away and back. (refs #322)
export const SESSIONS_REFRESH_MS = 30_000;

function Sessions({
  onResumeSession,
  onNewChat,
  currentSessionId,
  visible,
}: SessionsProps): React.JSX.Element {
  const { t } = useI18n();
  const [sessions, setSessions] = useState<CachedSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  // Grouped by work area by default — that is what a rep looks for ("어디에
  // EOL 얘기했더라"). Date grouping stays one click away for "what did I do
  // yesterday". Persisted so the choice survives a relaunch.
  const [groupMode, setGroupMode] = useState<"category" | "date">(() => {
    try {
      return localStorage.getItem(GROUP_MODE_KEY) === "date"
        ? "date"
        : "category";
    } catch {
      return "category";
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(GROUP_MODE_KEY, groupMode);
    } catch {
      // Private window / quota — in-session state still works.
    }
  }, [groupMode]);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  // Dedupe model-summary requests (id+count) across re-renders this mount.
  const summaryRequested = useRef<Set<string>>(new Set());
  const mountedRef = useRef(true);
  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Quiet re-sync from state.db — refreshes the list WITHOUT flipping the
  // loading state, so it can run on a timer or on focus with no spinner flash.
  const refreshSessions = useCallback(async (): Promise<void> => {
    const synced = await window.hermesAPI.syncSessionCache();
    setSessions(synced.slice(0, 50));
  }, []);

  const loadSessions = useCallback(async (): Promise<void> => {
    setLoading(true);
    try {
      const cached = await window.hermesAPI.listCachedSessions(50);
      if (cached.length > 0) {
        setSessions(cached);
      }

      const synced = await window.hermesAPI.syncSessionCache();
      setSessions(synced.slice(0, 50));
    } catch (error) {
      console.error("Failed to load sessions", error);
    } finally {
      setLoading(false);
    }
    await refreshSessions();
    setLoading(false);
  }, [refreshSessions]);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  // Delete a session's data (messages + cache entry) via the main process,
  // then drop it from the local lists. If it's the conversation currently open
  // in Chat, start a fresh one so the UI doesn't point at deleted data.
  const handleDelete = useCallback(
    async (id: string): Promise<void> => {
      setConfirmDelete(null);
      try {
        await window.hermesAPI.deleteSession(id);
      } catch (error) {
        console.error("Failed to delete session", error);
      }
      setSessions((prev) => prev.filter((s) => s.id !== id));
      setSearchResults((prev) => prev.filter((r) => r.sessionId !== id));
      if (id === currentSessionId) onNewChat();
    },
    [currentSessionId, onNewChat],
  );

  // Lazily upgrade visible sessions to a model-quality summary (de-identified
  // → model → re-identified, in main). The cache already has an instant
  // offline summary; this requests the LLM one for items not yet
  // model-summarized. Concurrency-capped (network calls) and gated on
  // `visible` so it doesn't run while another screen is showing.
  useEffect(() => {
    if (!visible) return;
    const stale = sessions.filter((s) => {
      // Only summarize ended sessions — never the active conversation (see
      // SidebarSessions for the rationale). Each summary is a gateway call;
      // re-running it on a live, growing session churns and pollutes.
      if (s.id === currentSessionId) return false;
      // Skip sessions Hermes already titled — prefer that stable title.
      if (s.dbTitle) return false;
      const fresh = s.summaryLlm && (s.summaryAtCount ?? -1) === s.messageCount;
      if (fresh) return false;
      const key = `${s.id}:${s.messageCount}`;
      if (summaryRequested.current.has(key)) return false;
      summaryRequested.current.add(key);
      return true;
    });
    if (stale.length === 0) return;
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
        // Non-fatal — keep the existing summary/title.
      }
    };
    const worker = async (): Promise<void> => {
      while (i < stale.length) await runOne(stale[i++]);
    };
    void Promise.all(
      Array.from({ length: Math.min(3, stale.length) }, () => worker()),
    );
  }, [sessions, visible, currentSessionId]);

  // Refresh sessions whenever the Sessions view becomes visible.
  // This ensures new sessions created in the Chat view (via "+")
  // appear immediately when the user navigates back to Sessions,
  // and also fixes stale sessions list after clearing search.
  useEffect(() => {
    if (visible) {
      loadSessions();
    }
  }, [visible, loadSessions]);

  // While the Sessions tab is actually showing, periodically re-sync so
  // sessions created in the background — cron jobs, gateway platforms, or
  // another device writing the same state.db — surface even if the user
  // just leaves this tab open. Also refresh when the window regains focus.
  // Gated on `visible`: no timer and no DB reads while another screen shows.
  useEffect(() => {
    if (!visible) return;
    const timer = setInterval(() => {
      void refreshSessions();
    }, SESSIONS_REFRESH_MS);
    const onFocus = (): void => {
      void refreshSessions();
    };
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [visible, refreshSessions]);

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!searchQuery.trim()) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }
    setIsSearching(true);
    searchTimer.current = setTimeout(async () => {
      const results = await window.hermesAPI.searchSessions(searchQuery);
      setSearchResults(results);
      setIsSearching(false);
    }, 300);
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [searchQuery]);

  const isShowingSearch = searchQuery.trim().length > 0;
  const grouped = groupSessions(sessions);
  const byCategory = groupSessionsByCategory(sessions);

  // Disambiguate labels across the whole list: distinct sessions that resolve
  // to the same label (e.g. two "양자역학 핵심 개념 소개") get a date suffix so
  // they aren't mistaken for duplicates. Computed over all sessions so a
  // collision across date groups is still caught.
  const labelById = new Map(
    disambiguateLabels(
      sessions.map((s) => ({
        id: s.id,
        label: sessionLabel(s, "New conversation"),
        startedAt: s.startedAt,
      })),
    ).map((it) => [it.id, it.label]),
  );
  // Same for search results, which carry their own (cache-enriched) title.
  const searchLabelById = new Map(
    disambiguateLabels(
      searchResults.map((r) => ({
        id: r.sessionId,
        label: r.title || `${t("sessions.title")} ${r.sessionId.slice(-6)}`,
        startedAt: r.startedAt,
      })),
    ).map((it) => [it.id, it.label]),
  );

  return (
    <div className="sessions-container">
      {/* Header with integrated search */}
      <div className="sessions-header">
        <div className="sessions-header-top">
          <h2 className="sessions-title">{t("sessions.title")}</h2>
          <button className="btn btn-primary " onClick={onNewChat}>
            <Plus size={14} />
            {t("sessions.newChat")}
          </button>
        </div>
        <div className="sessions-searchbar">
          <Search size={14} className="sessions-searchbar-icon" />
          <input
            ref={searchRef}
            className="sessions-searchbar-input"
            type="text"
            placeholder={t("sessions.searchPlaceholder")}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              className="btn-ghost sessions-searchbar-clear"
              onClick={() => {
                setSearchQuery("");
                searchRef.current?.focus();
              }}
            >
              <X size={13} />
            </button>
          )}
        </div>
        {!isShowingSearch && sessions.length > 0 && (
          <div
            className="sessions-groupmode"
            role="group"
            aria-label={t("sessions.groupBy")}
          >
            <span className="sessions-groupmode-label">
              {t("sessions.groupBy")}
            </span>
            {(["category", "date"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                className={`sessions-groupmode-btn ${
                  groupMode === mode ? "active" : ""
                }`}
                aria-pressed={groupMode === mode}
                onClick={() => setGroupMode(mode)}
              >
                {t(
                  mode === "category"
                    ? "sessions.groupByCategory"
                    : "sessions.groupByDate",
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Content */}
      {loading ? (
        <div className="sessions-loading">
          <div className="loading-spinner" />
        </div>
      ) : isShowingSearch ? (
        isSearching ? (
          <div className="sessions-loading">
            <div className="loading-spinner" />
          </div>
        ) : searchResults.length === 0 ? (
          <div className="sessions-empty">
            <Search size={32} className="sessions-empty-icon" />
            <p className="sessions-empty-text">{t("sessions.noResults")}</p>
            <p className="sessions-empty-hint">{t("sessions.noResultsHint")}</p>
          </div>
        ) : (
          <div className="sessions-list">
            {searchResults.map((r) => (
              <div className="sessions-card-wrap" key={r.sessionId}>
                <button
                  className={`sessions-card ${currentSessionId === r.sessionId ? "sessions-card--active" : ""}`}
                  onClick={() => onResumeSession(r.sessionId)}
                >
                  <div className="sessions-card-main">
                    <span className="sessions-card-title">
                      {searchLabelById.get(r.sessionId) ||
                        r.title ||
                        `${t("sessions.title")} ${r.sessionId.slice(-6)}`}
                    </span>
                    <span className="sessions-card-time">
                      {formatFullDate(r.startedAt)}
                    </span>
                  </div>
                  {r.snippet && (
                    <div className="sessions-result-snippet">
                      {highlightSnippet(r.snippet)}
                    </div>
                  )}
                  <div className="sessions-card-tags">
                    <span className="sessions-tag sessions-tag--source">
                      {r.source}
                    </span>
                    <span className="sessions-tag">
                      {r.messageCount}{" "}
                      {r.messageCount !== 1
                        ? t("sessions.messages")
                        : t("sessions.messageSingular")}
                    </span>
                    {r.model && (
                      <span className="sessions-tag sessions-tag--model">
                        {formatModel(r.model)}
                      </span>
                    )}
                  </div>
                </button>
                <DeleteControl
                  confirming={confirmDelete === r.sessionId}
                  onRequest={() => setConfirmDelete(r.sessionId)}
                  onConfirm={() => void handleDelete(r.sessionId)}
                  onCancel={() => setConfirmDelete(null)}
                />
              </div>
            ))}
          </div>
        )
      ) : sessions.length === 0 ? (
        <div className="sessions-empty">
          <ChatBubble size={32} className="sessions-empty-icon" />
          <p className="sessions-empty-text">{t("sessions.empty")}</p>
          <p className="sessions-empty-hint">{t("sessions.emptyHint")}</p>
        </div>
      ) : (
        <div className="sessions-list">
          {groupMode === "category"
            ? byCategory.map((group) => (
                <div key={group.key} className="sessions-group">
                  <div className="sessions-group-label">
                    {GROUP_TITLE_BY_ID.get(group.key as PlaybookGroup) ??
                      t("sessions.uncategorized")}
                    <span className="sessions-group-count">
                      {group.sessions.length}
                    </span>
                  </div>
                  {group.sessions.map((s) => (
                    <SessionCard
                      key={s.id}
                      session={s}
                      label={
                        labelById.get(s.id) ??
                        sessionLabel(s, "New conversation")
                      }
                      isActive={currentSessionId === s.id}
                      // Category groups mix dates, so always show the date.
                      showFullDate
                      confirming={confirmDelete === s.id}
                      onClick={() => onResumeSession(s.id)}
                      onRequestDelete={() => setConfirmDelete(s.id)}
                      onConfirmDelete={() => void handleDelete(s.id)}
                      onCancelDelete={() => setConfirmDelete(null)}
                    />
                  ))}
                </div>
              ))
            : grouped.map((group) => (
            <div key={group.label} className="sessions-group">
              <div className="sessions-group-label">
                {t(`sessions.${group.label}`)}
              </div>
              {group.sessions.map((s) => (
                <SessionCard
                  key={s.id}
                  session={s}
                  label={
                    labelById.get(s.id) ?? sessionLabel(s, "New conversation")
                  }
                  isActive={currentSessionId === s.id}
                  showFullDate={
                    group.label === "thisWeek" || group.label === "earlier"
                  }
                  confirming={confirmDelete === s.id}
                  onClick={() => onResumeSession(s.id)}
                  onRequestDelete={() => setConfirmDelete(s.id)}
                  onConfirmDelete={() => void handleDelete(s.id)}
                  onCancelDelete={() => setConfirmDelete(null)}
                />
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default Sessions;
