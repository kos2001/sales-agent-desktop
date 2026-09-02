/**
 * Session title summaries — via the Hermes gateway, with local PII
 * de-identification, and no junk sessions left behind.
 *
 * The configured model is often an OAuth/subscription provider (e.g.
 * openai-codex) that can't be called with a static API key. So instead of
 * hitting the provider directly, we ask the Hermes gateway (which holds the
 * OAuth credentials) to summarize — exactly the same OpenAI-compatible
 * endpoint the chat uses.
 *
 * Two safeguards:
 *  - PII: the transcript is de-identified locally BEFORE the request and the
 *    reply is re-identified locally after, so raw identifiers never leave the
 *    machine (the gateway/model only sees `[[NAME:…]]` tokens).
 *  - No junk session: a request sent WITHOUT an `X-Hermes-Session-Id` makes the
 *    gateway fork a fresh server-side session and echo its id back in the
 *    `x-hermes-session-id` response header. We capture that id and delete the
 *    session immediately, so summarizing never pollutes the session list.
 *
 * Fails soft to the offline extractive heuristic whenever the gateway path
 * can't be used (gateway down, network error, empty reply, de-id unavailable).
 * No change to the Hermes CLI.
 */
import http from "http";
import https from "https";
import { URL } from "url";
import { getSessionTranscript, deleteSession } from "./sessions";
import { summarizeTranscript, cleanSummary } from "./summary-text";
import { deidentifyText, reidentifyText } from "./pii-gateway";
import {
  getModelConfig,
  getApiServerKey,
  getCustomRequestHeaders,
} from "./config";
import {
  getApiUrl,
  getRemoteAuthHeader,
  isRemoteMode,
  isApiServerReady,
} from "./hermes";

// Re-exported so existing importers/tests reach these through this module.
export {
  cleanSummary,
  toNounForm,
  summarizeTranscript,
  SUMMARY_VERSION,
} from "./summary-text";

export interface SummaryResult {
  summary: string;
  /** true when produced by the model (via gateway); false when it fell back
   *  to the offline extractive heuristic. */
  llm: boolean;
}

const REQUEST_TIMEOUT_MS = 20_000;
const SYSTEM_PROMPT =
  "Summarize the conversation as a concise title of at most 8 words, in the " +
  "same language as the conversation. Identifiers may appear as opaque tokens " +
  "like [[NAME:xxxx]] — keep such tokens verbatim. Reply with ONLY the title — " +
  "no quotes, no trailing punctuation, no tool use.";

interface CompletionResponse {
  content: string;
  /** Session id the gateway forked for this request (to be deleted). */
  sessionId: string;
}

/** POST to the gateway's OpenAI-compatible /v1/chat/completions; resolves the
 *  assistant content plus the forked session id (from the response header).
 *  Resolves empty content on any error/non-2xx/timeout. */
function postCompletion(
  url: string,
  headers: Record<string, string>,
  payload: string,
): Promise<CompletionResponse> {
  return new Promise((resolve) => {
    let u: URL;
    try {
      u = new URL(url);
    } catch {
      resolve({ content: "", sessionId: "" });
      return;
    }
    const mod = u.protocol === "https:" ? https : http;
    const req = mod.request(
      {
        method: "POST",
        protocol: u.protocol,
        hostname: u.hostname,
        port: u.port || undefined,
        path: `${u.pathname}${u.search}`,
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
          ...headers,
        },
        timeout: REQUEST_TIMEOUT_MS,
      },
      (res) => {
        const sidHeader = res.headers["x-hermes-session-id"];
        const sessionId = typeof sidHeader === "string" ? sidHeader : "";
        if (!res.statusCode || res.statusCode >= 400) {
          res.resume();
          resolve({ content: "", sessionId });
          return;
        }
        let body = "";
        res.setEncoding("utf-8");
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => {
          let content = "";
          try {
            const json = JSON.parse(body) as {
              choices?: Array<{ message?: { content?: string } }>;
            };
            const c = json?.choices?.[0]?.message?.content;
            content = typeof c === "string" ? c : "";
          } catch {
            content = "";
          }
          resolve({ content, sessionId });
        });
        res.on("error", () => resolve({ content: "", sessionId }));
      },
    );
    req.on("error", () => resolve({ content: "", sessionId: "" }));
    req.on("timeout", () => {
      req.destroy();
      resolve({ content: "", sessionId: "" });
    });
    req.write(payload);
    req.end();
  });
}

/** Offline fallback: extractive non-LLM summary over the raw transcript. */
function extractive(transcript: string): SummaryResult | null {
  const s = summarizeTranscript(transcript);
  return s ? { summary: s, llm: false } : null;
}

/**
 * Summarize a session into a short title via the gateway (de-identified
 * request, re-identified reply, forked session deleted). Falls back to the
 * offline extractive heuristic when the gateway path can't be used. Returns
 * null only when there's nothing to summarize.
 */
export async function summarizeSession(
  sessionId: string,
  profile?: string,
): Promise<SummaryResult | null> {
  let transcript = "";
  try {
    transcript = getSessionTranscript(sessionId);
  } catch {
    return null;
  }
  if (!transcript.trim()) return null;

  // Never summarize the gateway's own forked sessions. A headerless
  // /v1/chat/completions (which is how this very function reaches the model)
  // makes the gateway fork a session whose single user message is the
  // transcript we sent — i.e. it starts with "User: ". getSessionTranscript
  // then renders it as "User: User: …". Re-summarizing that would feed the
  // transcript into yet another fork, cascading into endless "User: User: …"
  // junk. Detect it by content (NOT the `api-` id prefix — real desktop chats
  // are api_server sessions too and must still be summarized).
  if (/^\s*User:\s+User:/.test(transcript)) return null;

  try {
    // Use the gateway only if it's actually REACHABLE (health probe) — not
    // merely "did this app instance start it". A gateway up from a prior
    // session is reachable too. Don't spin one up just to summarize; if it's
    // down, fall back to the offline extractive summary.
    if (!(await isApiServerReady())) return extractive(transcript);

    // De-identify BEFORE the request. If it can't run, never send raw.
    const deid = await deidentifyText(transcript);
    if (!deid) return extractive(transcript);

    const mc = getModelConfig(profile);
    const headers: Record<string, string> = {
      ...getCustomRequestHeaders(profile),
      ...getRemoteAuthHeader(),
    };
    // Local gateway auth (API_SERVER_KEY); remote uses the header above.
    if (!isRemoteMode()) {
      const key = getApiServerKey(profile);
      if (key) headers.Authorization = `Bearer ${key}`;
    }
    // Deliberately NO X-Hermes-Session-Id → the gateway forks a fresh session
    // we delete right after.

    const payload = JSON.stringify({
      model: mc.model || "hermes-agent",
      stream: false,
      max_tokens: 48,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: deid.text },
      ],
    });

    const { content, sessionId: forkedId } = await postCompletion(
      `${getApiUrl()}/v1/chat/completions`,
      headers,
      payload,
    );

    // Clean up the throwaway session the gateway created for this request.
    // The gateway flushes the forked session to state.db slightly AFTER it
    // sends the response, so an immediate delete races and misses it. Poll a
    // few times over several seconds so a later attempt lands once the row
    // exists. Forks that slip through are also hidden from the list by content
    // (their user message starts "User: "), so this is just housekeeping.
    //
    // SAFETY: only ever delete an `api-`-prefixed id. Forked sessions always
    // get an `api-` id; real cli/telegram chats use timestamp ids. This
    // guarantees we never delete a real conversation even if the gateway
    // echoes back an unexpected session id.
    if (forkedId && forkedId !== sessionId && forkedId.startsWith("api-")) {
      const purge = (): void => {
        try {
          deleteSession(forkedId);
        } catch {
          /* best-effort */
        }
      };
      purge();
      for (const delay of [800, 2_000, 4_000, 7_000]) {
        setTimeout(purge, delay).unref?.();
      }
    }

    if (!content.trim()) return extractive(transcript);

    const summary = cleanSummary(await reidentifyText(content, deid.map));
    return summary ? { summary, llm: true } : extractive(transcript);
  } catch {
    return extractive(transcript);
  }
}
