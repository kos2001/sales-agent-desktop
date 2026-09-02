/**
 * Pure (no DB / no network / no LLM) text helpers for session-title
 * summaries. Shared by `session-summary.ts` (transcript → summary, used by the
 * summarize-session IPC) and `session-cache.ts` (first-message → summary,
 * baked into the cached session info on sync). Keeping these dependency-free
 * avoids a sessions ↔ session-cache import cycle.
 */

/** Bump when the summarization heuristic changes so cached summaries written
 *  by an older version are detected as stale and regenerated. */
export const SUMMARY_VERSION = 1;

const MAX_SUMMARY_CHARS = 80;

// Leading politeness/filler we peel off so the actual request shows.
const FILLER_PREFIXES: RegExp[] = [
  /^(hi|hello|hey|yo)\b[\s,!.]*/i,
  /^(please|pls)\b[\s,]*/i,
  /^(could|can|would|will)\s+(you|u)\b[\s,]*(please\b[\s,]*)?/i,
  /^(i\s+want\s+to|i'?d\s+like\s+to|i\s+would\s+like\s+to|i\s+need\s+to|i'?m\s+trying\s+to)\b[\s,]*/i,
  /^help\s+me\b[\s,]*(to\b[\s,]*)?/i,
  /^(let'?s|lets)\b[\s,]*/i,
  /^(how\s+(do|can)\s+(i|we)|how\s+to)\b[\s,]*/i,
];

// Bare greetings/acknowledgements that aren't worth surfacing as a title.
const GREETING_ONLY =
  /^(hi|hey|hello|thanks|thank you|ok|okay|yes|no|sure|yep|nope|cool|nice)[\s!.?]*$/i;

/**
 * Normalize raw text into a clean one-line title: drop code/markdown/URLs,
 * collapse whitespace, strip surrounding quotes, peel leading filler,
 * capitalize, and cap to ~80 chars at a word boundary. Returns "" for
 * blank input.
 */
export function cleanSummary(raw: string): string {
  let s = String(raw ?? "")
    .replace(/```[\s\S]*?```/g, " ") // fenced code blocks
    .replace(/[#*_`~[\]()]/g, "") // markdown punctuation
    .replace(/https?:\/\/\S+/g, "") // URLs
    .replace(/\s+/g, " ")
    .trim();
  if (!s) return "";

  // Strip surrounding matching quotes (straight or smart), repeatedly.
  let changed = true;
  while (changed && s.length >= 2) {
    const first = s[0];
    const last = s[s.length - 1];
    if (
      (first === '"' && last === '"') ||
      (first === "'" && last === "'") ||
      (first === "“" && last === "”") ||
      (first === "‘" && last === "’")
    ) {
      s = s.slice(1, -1).trim();
    } else {
      changed = false;
    }
  }

  // Peel leading filler, repeatedly in case prefixes stack ("hi, can you …").
  for (let pass = 0; pass < 3; pass++) {
    let stripped = false;
    for (const re of FILLER_PREFIXES) {
      const next = s.replace(re, "").trim();
      if (next !== s && next.length >= 3) {
        s = next;
        stripped = true;
      }
    }
    if (!stripped) break;
  }
  if (!s) return "";

  s = s.charAt(0).toUpperCase() + s.slice(1);

  if (s.length > MAX_SUMMARY_CHARS) {
    const cut = s.slice(0, MAX_SUMMARY_CHARS);
    const lastSpace = cut.lastIndexOf(" ");
    s = (lastSpace > 20 ? cut.slice(0, lastSpace) : cut).trim() + "…";
  }
  return s;
}

// Leading action verbs → their gerund (-ing) form, so an opening imperative
// ("Refactor the auth module") reads as a noun phrase ("Refactoring the auth
// module"). Curated map avoids irregular -ing spelling rules.
const GERUND_MAP: Record<string, string> = {
  add: "Adding",
  build: "Building",
  check: "Checking",
  compare: "Comparing",
  configure: "Configuring",
  convert: "Converting",
  create: "Creating",
  debug: "Debugging",
  delete: "Deleting",
  deploy: "Deploying",
  describe: "Describing",
  design: "Designing",
  draft: "Drafting",
  explain: "Explaining",
  find: "Finding",
  fix: "Fixing",
  generate: "Generating",
  get: "Getting",
  handle: "Handling",
  implement: "Implementing",
  improve: "Improving",
  install: "Installing",
  list: "Listing",
  make: "Making",
  merge: "Merging",
  migrate: "Migrating",
  move: "Moving",
  optimize: "Optimizing",
  parse: "Parsing",
  plan: "Planning",
  refactor: "Refactoring",
  remove: "Removing",
  rename: "Renaming",
  return: "Returning",
  reverse: "Reversing",
  review: "Reviewing",
  run: "Running",
  set: "Setting",
  show: "Showing",
  split: "Splitting",
  summarize: "Summarizing",
  test: "Testing",
  translate: "Translating",
  update: "Updating",
  use: "Using",
  write: "Writing",
};

// Two-word phrasal verbs handled before the single-word map.
const PHRASAL_GERUND: Record<string, string> = {
  "set up": "Setting up",
  "look up": "Looking up",
  "figure out": "Figuring out",
  "clean up": "Cleaning up",
  "back up": "Backing up",
};

/**
 * Convert a leading imperative verb to its gerund so the title reads as a
 * noun phrase. Unknown opening words (or non-English text) are returned
 * unchanged.
 */
export function toNounForm(s: string): string {
  if (!s) return s;
  const lower = s.toLowerCase();
  for (const [verb, gerund] of Object.entries(PHRASAL_GERUND)) {
    if (lower.startsWith(verb + " ")) {
      return gerund + s.slice(verb.length);
    }
  }
  const m = s.match(/^([a-z]+)(\b[\s\S]*)$/i);
  if (m) {
    const gerund = GERUND_MAP[m[1].toLowerCase()];
    if (gerund) return gerund + m[2];
  }
  return s;
}

/** First substantive user line from a "User: …\nAssistant: …" transcript. */
function firstUserRequest(transcript: string): string {
  const lines = transcript.split("\n");
  for (const line of lines) {
    if (!line.startsWith("User:")) continue;
    const text = line.slice("User:".length).trim();
    if (text.replace(/[^a-z0-9]/gi, "").length < 6) continue;
    if (GREETING_ONLY.test(text)) continue;
    return text;
  }
  for (const line of lines) {
    if (line.startsWith("User:")) return line.slice("User:".length).trim();
  }
  return "";
}

/** Noun-form summary from a "User:/Assistant:" transcript, or null. */
export function summarizeTranscript(transcript: string): string | null {
  if (!transcript || !transcript.trim()) return null;
  const cleaned = cleanSummary(firstUserRequest(transcript));
  return cleaned ? toNounForm(cleaned) : null;
}

/** Noun-form summary from a single (already-decoded) user message, or null.
 *  Used at the cache layer where only the first user message is on hand. */
export function summarizeMessageText(text: string): string | null {
  if (!text || !text.trim()) return null;
  const cleaned = cleanSummary(text);
  return cleaned ? toNounForm(cleaned) : null;
}
