import Database from "better-sqlite3";
import { existsSync } from "fs";
import { activeStateDbPath } from "./utils";
import type { Attachment } from "../shared/attachments";
import { removeSessionFromCache } from "./session-cache";
import { decodeContent } from "./session-content";

// Re-exported for existing importers/tests that reach decodeContent through
// this module; the implementation now lives in ./session-content (a
// dependency-light seam shared with session-cache.ts).
export { decodeContent } from "./session-content";

export interface SessionSummary {
  id: string;
  source: string;
  startedAt: number;
  endedAt: number | null;
  messageCount: number;
  model: string;
  title: string | null;
  preview: string;
}

export interface SessionMessage {
  id: number;
  role: "user" | "assistant" | "tool";
  content: string;
  timestamp: number;
  attachments?: Attachment[];
}

/**
 * Renderer-facing union of timeline items reconstructed from the DB.
 *
 * `user` / `assistant` are visible message bubbles. `reasoning`,
 * `tool_call`, and `tool_result` are surfaced as collapsible sub-rows
 * — they exist in the agent's state DB but were dropped on read until
 * this change. We emit them inline at the position they originally
 * occurred so the resumed transcript matches the live conversation.
 */
export type HistoryItem =
  | {
      kind: "user";
      id: number;
      content: string;
      timestamp: number;
      attachments?: Attachment[];
    }
  | {
      kind: "assistant";
      id: number;
      content: string;
      timestamp: number;
      attachments?: Attachment[];
    }
  | {
      kind: "reasoning";
      id: number;
      assistantId: number;
      text: string;
      timestamp: number;
    }
  | {
      kind: "tool_call";
      id: number;
      assistantId: number;
      callId: string;
      name: string;
      args: string; // pretty-printed JSON when possible, otherwise raw
      timestamp: number;
    }
  | {
      kind: "tool_result";
      id: number;
      callId: string;
      name: string;
      content: string;
      timestamp: number;
      attachments?: Attachment[];
    };

export interface SearchResult {
  sessionId: string;
  title: string | null;
  startedAt: number;
  source: string;
  messageCount: number;
  model: string;
  snippet: string;
}

// Cached connections keyed by `<absolute path>|<r|rw>`. Opening a
// SQLite connection costs 2–5ms; the Sessions / History UI calls
// listSessions/searchSessions/getSessionMessages dozens of times per
// session. Keep one writable + one readonly handle alive per profile
// path; when the profile switches, `activeStateDbPath()` returns a new
// path so we naturally allocate a fresh entry (and leak nothing — the
// old profile's handle is GC'd next quit).
const _dbCache = new Map<string, Database.Database>();

function getDb(readonly = true): Database.Database | null {
  // Open the active profile's session DB — named profiles keep their
  // sessions under ~/.hermes/profiles/<name>/state.db (issue #311).
  const dbPath = activeStateDbPath();
  if (!existsSync(dbPath)) return null;
  const key = `${dbPath}|${readonly ? "r" : "rw"}`;
  const cached = _dbCache.get(key);
  if (cached) {
    // Cheap liveness check — the underlying file could have been
    // deleted between calls (profile-delete flow). On any error, drop
    // the cached handle and reopen.
    try {
      cached.prepare("SELECT 1").get();
      return cached;
    } catch {
      try {
        cached.close();
      } catch {
        /* already closed */
      }
      _dbCache.delete(key);
    }
  }
  const db = new Database(dbPath, readonly ? { readonly: true } : {});
  _dbCache.set(key, db);
  return db;
}

/**
 * Close every cached sessions DB connection. Call from `before-quit`
 * (so the WAL gets checkpointed) or from a profile-switch handler if
 * you want the old profile's handles released immediately.
 */
export function closeSessionsDbs(): void {
  for (const db of _dbCache.values()) {
    try {
      db.close();
    } catch {
      /* already closed */
    }
  }
  _dbCache.clear();
}

export function listSessions(limit = 30, offset = 0): SessionSummary[] {
  const db = getDb();
  if (!db) return [];

  // No try/finally — connection is pooled in _dbCache and released on
  // quit (closeSessionsDbs). Letting exceptions propagate matches the
  // pre-pooled behaviour: the prior `finally { db.close() }` did not
  // swallow the error either.
  // Drop empty (0-message) sessions only. Channels (telegram) and aborted
  // starts leave message-less rows that all render as "New conversation",
  // looking like duplicate junk in the list.
  //
  // NOTE: we deliberately do NOT filter by the `api-` id prefix here. The
  // desktop's own chats also go through the gateway and get `api-` ids
  // (source api_server) — filtering them out hides real conversations.
  //
  // We DO exclude the gateway's summary forks by CONTENT: a fork's only user
  // message is the transcript we POSTed to summarize, which begins "User: ".
  // Real user messages don't. (Forks are also delete-polled after summarizing
  // and never re-summarized; this is the display-side safety net for any that
  // slip through and would otherwise show as a "User: …" row.)
  const rows = db
    .prepare(
      `SELECT
        s.id,
        s.source,
        s.started_at,
        s.ended_at,
        s.message_count,
        s.model,
        s.title
      FROM sessions s
      WHERE s.message_count > 0
        AND s.id NOT IN (
          SELECT session_id FROM messages
          WHERE role = 'user' AND content LIKE 'User:%'
        )
      ORDER BY s.started_at DESC
      LIMIT ? OFFSET ?`,
    )
    .all(limit, offset) as Array<{
    id: string;
    source: string;
    started_at: number;
    ended_at: number | null;
    message_count: number;
    model: string;
    title: string | null;
  }>;

  return rows.map((r) => ({
    id: r.id,
    source: r.source,
    startedAt: r.started_at,
    endedAt: r.ended_at,
    messageCount: r.message_count,
    model: r.model || "",
    title: r.title,
    preview: "",
  }));
}

export function searchSessions(query: string, limit = 20): SearchResult[] {
  const db = getDb();
  if (!db) return [];

  try {
    // Check if FTS table exists
    const tableCheck = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='messages_fts'",
      )
      .get() as { name: string } | undefined;

    if (!tableCheck) return [];

    // Sanitize query for FTS5: wrap each word with quotes for safety, add * for prefix
    const sanitized = query
      .trim()
      .split(/\s+/)
      .filter((w) => w.length > 0)
      .map((w) => `"${w.replace(/"/g, "")}"*`)
      .join(" ");

    if (!sanitized) return [];

    const rows = db
      .prepare(
        `SELECT DISTINCT
          m.session_id,
          s.title,
          s.started_at,
          s.source,
          s.message_count,
          s.model,
          snippet(messages_fts, 0, '<<', '>>', '...', 40) as snippet
        FROM messages_fts
        JOIN messages m ON m.id = messages_fts.rowid
        JOIN sessions s ON s.id = m.session_id
        WHERE messages_fts MATCH ?
          AND s.message_count > 0
          AND s.id NOT IN (
            SELECT session_id FROM messages
            WHERE role = 'user' AND content LIKE 'User:%'
          )
        ORDER BY rank
        LIMIT ?`,
      )
      .all(sanitized, limit) as Array<{
      session_id: string;
      title: string | null;
      started_at: number;
      source: string;
      message_count: number;
      model: string;
      snippet: string;
    }>;

    return rows.map((r) => ({
      sessionId: r.session_id,
      title: r.title,
      startedAt: r.started_at,
      source: r.source,
      messageCount: r.message_count,
      model: r.model || "",
      snippet: r.snippet || "",
    }));
  } catch {
    return [];
  }
}

/**
 * Try hard to extract human-readable reasoning text from one of the three
 * provider-specific columns the agent stores it in. Returns "" when nothing
 * usable is present.
 *
 * Priority: `reasoning` (plain text from most providers) >
 *           `reasoning_content` (legacy mirror) >
 *           `reasoning_details` (Anthropic / OpenRouter signed-block JSON;
 *            we flatten its `text` fields when present, otherwise drop it).
 */
export function pickReasoning(row: {
  reasoning: string | null;
  reasoning_content: string | null;
  reasoning_details: string | null;
}): string {
  const direct = (row.reasoning || "").trim();
  if (direct) return direct;
  const legacy = (row.reasoning_content || "").trim();
  if (legacy) return legacy;
  const details = (row.reasoning_details || "").trim();
  if (!details) return "";
  try {
    const parsed = JSON.parse(details);
    if (typeof parsed === "string") return parsed;
    if (Array.isArray(parsed)) {
      const texts: string[] = [];
      for (const entry of parsed) {
        if (!entry || typeof entry !== "object") continue;
        const e = entry as Record<string, unknown>;
        if (typeof e.text === "string" && e.text) texts.push(e.text);
        else if (typeof e.thinking === "string" && e.thinking)
          texts.push(e.thinking);
      }
      if (texts.length) return texts.join("\n\n");
    }
  } catch {
    /* fall through */
  }
  return "";
}

/**
 * Parse the assistant row's `tool_calls` JSON. Each entry from the agent
 * looks like `{id, call_id, type:"function", function:{name, arguments}}`.
 * `arguments` is itself a JSON-encoded string the agent sent to the model.
 * We pretty-print it for display when it parses, leave it raw otherwise.
 *
 * Returns `[]` on any parse failure — the caller silently skips bad rows
 * so a malformed tool_calls cell never blocks history rendering.
 */
export function parseToolCalls(
  raw: string | null,
): Array<{ callId: string; name: string; args: string }> {
  if (!raw || !raw.trim()) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const out: Array<{ callId: string; name: string; args: string }> = [];
  for (const entry of parsed) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    const fn = (e.function || {}) as Record<string, unknown>;
    const name = typeof fn.name === "string" ? fn.name : "";
    if (!name) continue;
    const callId =
      (typeof e.call_id === "string" && e.call_id) ||
      (typeof e.id === "string" && e.id) ||
      "";
    const rawArgs = typeof fn.arguments === "string" ? fn.arguments : "";
    let args = rawArgs;
    try {
      args = JSON.stringify(JSON.parse(rawArgs), null, 2);
    } catch {
      // arguments wasn't JSON — leave as-is
    }
    out.push({ callId, name, args });
  }
  return out;
}

/**
 * Row shape as returned by the widened SELECT inside getSessionMessages,
 * exported so the unit tests can build fixture rows without going through
 * sqlite (better-sqlite3 is an Electron-only native module).
 */
export interface RawMessageRow {
  id: number;
  role: string;
  content: string | null;
  timestamp: number;
  tool_call_id: string | null;
  tool_calls: string | null;
  tool_name: string | null;
  reasoning: string | null;
  reasoning_content: string | null;
  reasoning_details: string | null;
}

/**
 * Pure expansion of DB rows → renderer-facing HistoryItem list. Kept pure
 * (no I/O) so we can exercise the ordering and edge-case logic directly
 * without booting sqlite.
 */
export function expandRowsToHistory(rows: RawMessageRow[]): HistoryItem[] {
  const items: HistoryItem[] = [];
  for (const r of rows) {
    const decoded = decodeContent(r.content || "", r.id);

    if (r.role === "user") {
      if (!decoded.text && decoded.attachments.length === 0) continue;
      items.push({
        kind: "user",
        id: r.id,
        content: decoded.text,
        timestamp: r.timestamp,
        ...(decoded.attachments.length > 0
          ? { attachments: decoded.attachments }
          : {}),
      });
      continue;
    }

    if (r.role === "assistant") {
      const reasoningText = pickReasoning(r);
      if (reasoningText) {
        items.push({
          kind: "reasoning",
          id: r.id,
          assistantId: r.id,
          text: reasoningText,
          timestamp: r.timestamp,
        });
      }

      if (decoded.text || decoded.attachments.length > 0) {
        items.push({
          kind: "assistant",
          id: r.id,
          content: decoded.text,
          timestamp: r.timestamp,
          ...(decoded.attachments.length > 0
            ? { attachments: decoded.attachments }
            : {}),
        });
      }

      for (const tc of parseToolCalls(r.tool_calls)) {
        items.push({
          kind: "tool_call",
          id: r.id,
          assistantId: r.id,
          callId: tc.callId,
          name: tc.name,
          args: tc.args,
          timestamp: r.timestamp,
        });
      }
      continue;
    }

    if (r.role === "tool") {
      const name = r.tool_name || "tool";
      items.push({
        kind: "tool_result",
        id: r.id,
        callId: r.tool_call_id || "",
        name,
        content: decoded.text,
        timestamp: r.timestamp,
        ...(decoded.attachments.length > 0
          ? { attachments: decoded.attachments }
          : {}),
      });
      continue;
    }
  }
  return items;
}

/**
 * Build a compact, decoded transcript of a session's user+assistant turns
 * for feeding to an LLM summarizer. Tool messages, reasoning, and empty
 * turns are skipped. The result is capped at `maxChars` total (truncated
 * on a whole-line boundary where possible) so we never send an unbounded
 * conversation to the provider.
 *
 * Returns "" when the session has no DB, no usable messages, or only
 * empty/tool turns — callers should treat "" as "nothing to summarize".
 */
export function getSessionTranscript(
  sessionId: string,
  maxChars = 3000,
): string {
  const db = getDb();
  if (!db) return "";

  const rows = db
    .prepare(
      `SELECT id, role, content
       FROM messages
       WHERE session_id = ? AND role IN ('user', 'assistant')
         AND content IS NOT NULL
       ORDER BY timestamp, id`,
    )
    .all(sessionId) as Array<{
    id: number;
    role: string;
    content: string | null;
  }>;

  let transcript = "";
  for (const r of rows) {
    const text = decodeContent(r.content || "", r.id).text.trim();
    if (!text) continue;
    const label = r.role === "user" ? "User" : "Assistant";
    const line = `${label}: ${text}\n`;
    if (transcript.length + line.length > maxChars) {
      // Take whatever still fits of this line so a long final turn doesn't
      // get dropped entirely, then stop.
      const remaining = maxChars - transcript.length;
      if (remaining > 0) transcript += line.slice(0, remaining);
      break;
    }
    transcript += line;
  }
  return transcript;
}

export function getSessionMessages(sessionId: string): HistoryItem[] {
  const db = getDb();
  if (!db) return [];

  const rows = db
    .prepare(
      `SELECT id, role, content, timestamp,
              tool_call_id, tool_calls, tool_name,
              reasoning, reasoning_content, reasoning_details
       FROM messages
       WHERE session_id = ? AND role IN ('user', 'assistant', 'tool')
       ORDER BY timestamp, id`,
    )
    .all(sessionId) as RawMessageRow[];

  return expandRowsToHistory(rows);
}

export function deleteSession(sessionId: string): void {
  const db = getDb(false);
  if (!db) return;

  const tx = db.transaction((id: string) => {
    db.prepare("DELETE FROM messages WHERE session_id = ?").run(id);
    db.prepare("DELETE FROM sessions WHERE id = ?").run(id);
  });
  tx(sessionId);

  removeSessionFromCache(sessionId);
}
