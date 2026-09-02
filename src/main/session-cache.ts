import { existsSync, readFileSync } from "fs";
import { join } from "path";
import {
  profileHome,
  getActiveProfileNameSync,
  activeStateDbPath,
  safeWriteFile,
} from "./utils";
import Database from "better-sqlite3";
import { t } from "../shared/i18n";
import { getAppLocale } from "./locale";
import { decodeContent } from "./session-content";
import { summarizeMessageText, SUMMARY_VERSION } from "./summary-text";

/**
 * The session cache lives alongside its own profile's data so profiles
 * don't share a single cache file. The default profile keeps
 * ~/.hermes/desktop/sessions.json; named profiles use
 * ~/.hermes/profiles/<name>/desktop/sessions.json (issue #311).
 */
function cacheFilePath(): string {
  return join(
    profileHome(getActiveProfileNameSync()),
    "desktop",
    "sessions.json",
  );
}

export interface CachedSession {
  id: string;
  title: string;
  startedAt: number;
  source: string;
  messageCount: number;
  model: string;
  /** The session's own title as set by Hermes (state.db `sessions.title`),
   *  empty/undefined when Hermes never titled it. This is a STABLE, good
   *  title; it is preferred over our gateway LLM summary so a multi-topic chat
   *  doesn't flip titles between runs. `title` above may instead hold a
   *  generated first-message fallback, which is why we keep this separately. */
  dbTitle?: string;
  /** Extractive (non-LLM) conversation summary — see session-summary.ts.
   *  Shown in preference to `title` when present. */
  summary?: string;
  /** The session's messageCount at the time `summary` was generated.
   *  When it diverges from the current messageCount the renderer knows
   *  the summary is stale and re-requests one. */
  summaryAtCount?: number;
  /** Heuristic version the cached `summary` was produced with. A mismatch
   *  with SUMMARY_VERSION means it predates the current logic and is
   *  regenerated on the next sync. */
  summaryVer?: number;
  /** true when `summary` came from the model (session-summary LLM path);
   *  false/absent when it's the offline extractive placeholder, which the
   *  renderer upgrades by requesting a model summary. */
  summaryLlm?: boolean;
}

/** Read a session's first user message (decoded) — used to bake the
 *  noun-form summary into the cache. Returns "" when unavailable. */
function firstUserMessageText(
  db: Database.Database,
  sessionId: string,
): string {
  try {
    const row = db
      .prepare(
        `SELECT content FROM messages
         WHERE session_id = ? AND role = 'user' AND content IS NOT NULL
         ORDER BY timestamp, id LIMIT 1`,
      )
      .get(sessionId) as { content: string } | undefined;
    return row ? decodeContent(row.content, 0).text : "";
  } catch {
    return "";
  }
}

interface CacheData {
  sessions: CachedSession[];
  lastSync: number;
}

// Generate a short, readable title from the first user message (like ChatGPT/Claude)
function generateTitle(message: string): string {
  if (!message || !message.trim())
    return t("sessions.newConversation", getAppLocale());

  // Clean up the message
  let text = message.trim();

  // Remove markdown formatting
  text = text.replace(/[#*_`~[\]()]/g, "");
  // Remove URLs
  text = text.replace(/https?:\/\/\S+/g, "");
  // Remove extra whitespace
  text = text.replace(/\s+/g, " ").trim();

  if (!text) return t("sessions.newConversation", getAppLocale());

  // If short enough, use as-is
  if (text.length <= 50) return text;

  // Take first meaningful chunk — aim for ~40-50 chars at word boundary
  const words = text.split(" ");
  let title = "";
  for (const word of words) {
    if ((title + " " + word).trim().length > 45) break;
    title = (title + " " + word).trim();
  }

  return title || text.slice(0, 45) + "...";
}

function readCache(): CacheData {
  const file = cacheFilePath();
  try {
    if (!existsSync(file)) return { sessions: [], lastSync: 0 };
    return JSON.parse(readFileSync(file, "utf-8"));
  } catch {
    return { sessions: [], lastSync: 0 };
  }
}

function writeCache(data: CacheData): void {
  try {
    safeWriteFile(cacheFilePath(), JSON.stringify(data));
  } catch {
    // non-fatal
  }
}

function getDb(): Database.Database | null {
  const dbPath = activeStateDbPath();
  if (!existsSync(dbPath)) return null;
  return new Database(dbPath, { readonly: true });
}

// Sync from hermes DB to local cache — only fetches new/updated sessions
export function syncSessionCache(): CachedSession[] {
  const cache = readCache();
  const db = getDb();
  if (!db) return cache.sessions;

  try {
    // Fetch sessions newer than last sync, or all if first sync
    const rows = db
      .prepare(
        `SELECT s.id, s.started_at, s.source, s.message_count, s.model, s.title
         FROM sessions s
         WHERE s.started_at > ?
           AND s.message_count > 0
         ORDER BY s.started_at DESC`,
      )
      .all(cache.lastSync > 0 ? cache.lastSync - 300 : 0) as Array<{
      id: string;
      started_at: number;
      source: string;
      message_count: number;
      model: string;
      title: string | null;
    }>;

    // Index existing sessions by id once so the per-row update below is
    // O(1) instead of O(N). Without this, syncing N existing sessions
    // against N new rows is O(N²) and visibly slows app startup once a
    // user has accumulated thousands of sessions (issue #16).
    const existingById = new Map<string, CachedSession>();
    for (const s of cache.sessions) existingById.set(s.id, s);
    const newSessions: CachedSession[] = [];

    const refreshedIds = new Set<string>();
    for (const row of rows) {
      refreshedIds.add(row.id);
      const existing = existingById.get(row.id);
      if (existing) {
        // Update existing entry (message count may have changed). Also keep
        // dbTitle current — Hermes may title a session after we first cached
        // it (channel/api_server chats are titled late or never).
        existing.messageCount = row.message_count;
        existing.dbTitle = row.title || undefined;
        continue;
      }

      // New session: derive both the fallback title and the noun-form summary
      // from the first user message (decoded — hermes stores multimodal
      // content with a \x00json: sentinel that must be unpacked first).
      const firstText = firstUserMessageText(db, row.id);
      // Skip the gateway's summary forks: their only user message is the
      // transcript we POSTed to summarize, which begins "User: ". Real chats
      // don't. Keeps "User: …" junk rows out of the list entirely.
      if (/^\s*User:/.test(firstText)) continue;
      const title =
        row.title ||
        (firstText
          ? generateTitle(firstText)
          : t("sessions.newConversation", getAppLocale()));
      const summary = summarizeMessageText(firstText);

      newSessions.push({
        id: row.id,
        title,
        startedAt: row.started_at,
        source: row.source,
        messageCount: row.message_count,
        model: row.model || "",
        summaryVer: SUMMARY_VERSION,
        ...(row.title ? { dbTitle: row.title } : {}),
        ...(summary ? { summary, summaryAtCount: row.message_count } : {}),
      });
    }

    // Backfill / refresh summaries for cached sessions written by an older
    // heuristic version (or never summarized). One-time cost: once every
    // entry carries the current SUMMARY_VERSION, subsequent syncs skip this.
    for (const s of cache.sessions) {
      if (s.summaryVer === SUMMARY_VERSION) continue;
      const summary = summarizeMessageText(firstUserMessageText(db, s.id));
      if (summary) {
        s.summary = summary;
        s.summaryAtCount = s.messageCount;
      }
      s.summaryVer = SUMMARY_VERSION;
    }

    // Phase 2: refresh message_count for cached sessions that weren't
    // returned by the lastSync-windowed query above. Without this, an
    // old session that's still accumulating messages keeps the stale
    // count it had at first sync — the renderer reads from the cache,
    // so the UI reports e.g. 15 messages when the conversation actually
    // has 200+. Issue #226. Cheap (single column, no joins, batched IN
    // clause), and skipped entirely on a first sync since cache.sessions
    // is empty.
    const staleIds = cache.sessions
      .map((s) => s.id)
      .filter((id) => !refreshedIds.has(id));
    // Cached ids that no longer exist in state.db — pruned below. A bulk
    // delete done outside the app (or the gateway's forked api_server
    // sessions being removed) leaves orphan cache entries that would
    // otherwise linger forever; this is what reconciles the cache with the DB.
    const prunedIds = new Set<string>();
    if (staleIds.length > 0) {
      // SQLite caps prepared-statement parameters; chunk well under
      // SQLITE_MAX_VARIABLE_NUMBER (default 999 on older builds) for
      // portability across the better-sqlite3 versions hermes ships.
      const CHUNK = 500;
      const countsById = new Map<string, number>();
      const titleById = new Map<string, string>();
      for (let i = 0; i < staleIds.length; i += CHUNK) {
        const chunk = staleIds.slice(i, i + CHUNK);
        const placeholders = chunk.map(() => "?").join(", ");
        const refreshed = db
          .prepare(
            `SELECT id, message_count, title FROM sessions WHERE id IN (${placeholders})`,
          )
          .all(...chunk) as Array<{
          id: string;
          message_count: number;
          title: string | null;
        }>;
        for (const r of refreshed) {
          countsById.set(r.id, r.message_count);
          if (r.title) titleById.set(r.id, r.title);
        }
      }
      for (const s of cache.sessions) {
        const fresh = countsById.get(s.id);
        if (fresh !== undefined && fresh !== s.messageCount) {
          s.messageCount = fresh;
        }
        // Backfill dbTitle for entries cached before this field existed, and
        // pick up titles Hermes assigned after we first cached the session.
        if (countsById.has(s.id)) s.dbTitle = titleById.get(s.id) || undefined;
      }
      // Anything we asked about but the DB didn't return is gone — prune it.
      for (const id of staleIds) {
        if (!countsById.has(id)) prunedIds.add(id);
      }
    }

    // Merge: new sessions first (most recent), then existing — minus
    //  • sessions deleted from the DB (prunedIds),
    //  • empty 0-message sessions (channel/aborted starts that all render as
    //    "New conversation" — duplicate-looking junk). messageCount was just
    //    refreshed above, so this reflects the live count,
    //  • summary forks already cached before the skip above existed — their
    //    title/summary begins "User: " (the transcript we POSTed). Prunes the
    //    junk "User: …" rows retroactively.
    // We do NOT drop `api-` ids here: the desktop's own chats are api_server
    // sessions too (gateway-backed).
    const isFork = (s: CachedSession): boolean =>
      /^\s*User:/.test(s.title || "") || /^\s*User:/.test(s.summary || "");
    const allSessions = [...newSessions, ...cache.sessions].filter(
      (s) => !prunedIds.has(s.id) && s.messageCount > 0 && !isFork(s),
    );
    // Sort by startedAt descending
    allSessions.sort((a, b) => b.startedAt - a.startedAt);

    const updated: CacheData = {
      sessions: allSessions,
      lastSync: Math.floor(Date.now() / 1000),
    };
    writeCache(updated);
    return updated.sessions;
  } catch {
    return cache.sessions;
  } finally {
    db.close();
  }
}

// Fast read from cache only (no DB access)
export function listCachedSessions(limit = 50, offset = 0): CachedSession[] {
  const cache = readCache();
  return cache.sessions.slice(offset, offset + limit);
}

// Update title for a specific session
export function updateSessionTitle(sessionId: string, title: string): void {
  const cache = readCache();
  const idx = cache.sessions.findIndex((s) => s.id === sessionId);
  if (idx >= 0) {
    cache.sessions[idx].title = title;
    writeCache(cache);
  }
}

// id → display title for every cached session that has one. Used to enrich
// search results, which otherwise carry only the raw state.db title (often
// null → "New conversation"). Mirrors the renderer's sessionLabel priority:
// Hermes dbTitle > our LLM summary > generated title > extractive summary.
export function getCachedTitleMap(): Map<string, string> {
  const map = new Map<string, string>();
  for (const s of readCache().sessions) {
    const display =
      s.dbTitle || (s.summaryLlm ? s.summary : "") || s.title || s.summary;
    if (display) map.set(s.id, display);
  }
  return map;
}

// Look up a cached session's current messageCount (0 if not cached).
export function getCachedMessageCount(sessionId: string): number {
  const cache = readCache();
  const s = cache.sessions.find((x) => x.id === sessionId);
  return s ? s.messageCount : 0;
}

// Persist an extractive (non-LLM) summary for a session, tagged with the
// messageCount it was generated against so the renderer can detect when
// it goes stale. Mirrors updateSessionTitle.
export function setSessionSummary(
  sessionId: string,
  summary: string,
  msgCount: number,
  llm = false,
): void {
  const cache = readCache();
  const idx = cache.sessions.findIndex((s) => s.id === sessionId);
  if (idx >= 0) {
    cache.sessions[idx].summary = summary;
    cache.sessions[idx].summaryAtCount = msgCount;
    cache.sessions[idx].summaryVer = SUMMARY_VERSION;
    cache.sessions[idx].summaryLlm = llm;
    writeCache(cache);
  }
}

// Remove a session entry from the local cache. Called after the underlying
// row in state.db is deleted so the renderer's fast-path cache doesn't keep
// surfacing a session that no longer exists.
export function removeSessionFromCache(sessionId: string): void {
  const cache = readCache();
  const next = cache.sessions.filter((s) => s.id !== sessionId);
  if (next.length !== cache.sessions.length) {
    cache.sessions = next;
    writeCache(cache);
  }
}
