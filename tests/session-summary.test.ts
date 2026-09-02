import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { join } from "path";
import { mkdirSync, rmSync, existsSync } from "fs";

// vi.hoisted runs before module imports — use bare Node modules via require.
const { TEST_HOME } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const path = require("path");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const os = require("os");
  return {
    TEST_HOME: path.join(
      os.tmpdir(),
      `hermes-session-summary-test-${Date.now()}`,
    ),
  };
});

// installer.ts is the source of HERMES_HOME (read by utils.ts/config.ts)
// and of expectedEnvKeyForModel (the real mapping). Provide both, plus the
// extra fields model-discovery.ts pulls from installer at import time.
vi.mock("../src/main/installer", () => ({
  HERMES_HOME: TEST_HOME,
  HERMES_PYTHON: "/usr/bin/python3",
  HERMES_REPO: TEST_HOME,
  getEnhancedPath: () => process.env.PATH || "",
  // Real-enough mapping: openai → OPENAI_API_KEY, anthropic →
  // ANTHROPIC_API_KEY. Returns null for unknown providers.
  expectedEnvKeyForModel: (provider: string) => {
    const map: Record<string, string> = {
      openai: "OPENAI_API_KEY",
      anthropic: "ANTHROPIC_API_KEY",
      groq: "GROQ_API_KEY",
    };
    return map[provider.trim().toLowerCase()] ?? null;
  },
}));

vi.mock("../src/shared/i18n", () => ({
  t: (key: string) => key,
}));
vi.mock("../src/main/locale", () => ({
  getAppLocale: () => "en",
}));

// Force the offline extractive path deterministically: report the gateway as
// unreachable so summarizeSession never makes a real network/model call (and
// the test doesn't depend on a live gateway on :8642).
vi.mock("../src/main/hermes", () => ({
  getApiUrl: () => "http://127.0.0.1:8642",
  getRemoteAuthHeader: () => ({}),
  isRemoteMode: () => false,
  isApiServerReady: () => Promise.resolve(false),
}));

// Minimal better-sqlite3 fake — just enough for getSessionTranscript's
// SELECT over user+assistant messages.
vi.mock("better-sqlite3", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require("fs");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const path = require("path");

  interface MessageRow {
    id: number;
    session_id: string;
    role: string;
    content: string | null;
    timestamp: number;
  }
  interface Store {
    messages: MessageRow[];
    nextId: number;
  }
  const stores = new Map<string, Store>();
  function getStore(dbPath: string): Store {
    if (!fs.existsSync(dbPath)) {
      fs.mkdirSync(path.dirname(dbPath), { recursive: true });
      fs.writeFileSync(dbPath, "");
    }
    let store = stores.get(dbPath);
    if (!store) {
      store = { messages: [], nextId: 1 };
      stores.set(dbPath, store);
    }
    return store;
  }

  class FakeStatement {
    constructor(
      private readonly sql: string,
      private readonly store: Store,
    ) {}

    run(...args: unknown[]): { changes: number } {
      if (this.sql.includes("INSERT INTO messages")) {
        const [sessionId, role, content, timestamp] = args;
        this.store.messages.push({
          id: this.store.nextId++,
          session_id: String(sessionId),
          role: String(role),
          content: content === null ? null : String(content),
          timestamp: Number(timestamp),
        });
        return { changes: 1 };
      }
      throw new Error(`Unhandled fake run SQL: ${this.sql}`);
    }

    all(...args: unknown[]): MessageRow[] {
      // getSessionTranscript: user+assistant messages, ordered.
      if (
        this.sql.includes("FROM messages") &&
        this.sql.includes("role IN ('user', 'assistant')")
      ) {
        const sessionId = String(args[0]);
        return this.store.messages
          .filter(
            (m) =>
              m.session_id === sessionId &&
              (m.role === "user" || m.role === "assistant") &&
              m.content !== null,
          )
          .sort((a, b) => a.timestamp - b.timestamp || a.id - b.id);
      }
      // liveness check used by sessions.getDb pool
      if (this.sql.includes("SELECT 1")) return [];
      throw new Error(`Unhandled fake all SQL: ${this.sql}`);
    }

    get(): unknown {
      // sessions.getDb does `prepare("SELECT 1").get()` for liveness.
      if (this.sql.includes("SELECT 1")) return { "1": 1 };
      return undefined;
    }
  }

  class FakeDatabase {
    private readonly store: Store;
    constructor(dbPath: string) {
      this.store = getStore(dbPath);
    }
    exec(): void {
      /* schema creation is a no-op for the in-memory fake */
    }
    prepare(sql: string): FakeStatement {
      return new FakeStatement(sql, this.store);
    }
    transaction<T extends (...a: never[]) => unknown>(fn: T): T {
      return fn;
    }
    close(): void {
      /* no-op */
    }
  }

  return { default: FakeDatabase };
});

import Database from "better-sqlite3";
import { getSessionTranscript } from "../src/main/sessions";
import {
  cleanSummary,
  toNounForm,
  summarizeSession,
} from "../src/main/session-summary";

const DB_PATH = join(TEST_HOME, "state.db");

function seedMessages(
  rows: Array<{ sessionId: string; role: string; content: string }>,
): void {
  const db = new Database(DB_PATH);
  const ins = db.prepare(
    `INSERT INTO messages (session_id, role, content, timestamp) VALUES (?, ?, ?, ?)`,
  );
  let ts = 1000;
  for (const r of rows) ins.run(r.sessionId, r.role, r.content, ts++);
  db.close();
}

beforeEach(() => {
  mkdirSync(TEST_HOME, { recursive: true });
});

afterEach(() => {
  if (existsSync(TEST_HOME)) {
    rmSync(TEST_HOME, { recursive: true, force: true });
  }
});

describe("cleanSummary", () => {
  it("strips surrounding straight quotes", () => {
    expect(cleanSummary('"Fixing the build pipeline"')).toBe(
      "Fixing the build pipeline",
    );
    expect(cleanSummary("'Rust ownership question'")).toBe(
      "Rust ownership question",
    );
  });

  it("strips surrounding smart quotes", () => {
    expect(cleanSummary("“Chat about Python”")).toBe("Chat about Python");
  });

  it("collapses internal whitespace and newlines", () => {
    expect(cleanSummary("Title   with\nnewlines\tand   spaces")).toBe(
      "Title with newlines and spaces",
    );
  });

  it("caps the result to ~80 chars", () => {
    const long = "word ".repeat(40).trim();
    const out = cleanSummary(long);
    expect(out.length).toBeLessThanOrEqual(80);
  });

  it("returns empty string for blank/whitespace input", () => {
    expect(cleanSummary("")).toBe("");
    expect(cleanSummary("   \n  ")).toBe("");
  });

  it("peels leading greetings and politeness filler", () => {
    expect(cleanSummary("Can you please refactor the auth module")).toBe(
      "Refactor the auth module",
    );
    expect(cleanSummary("hi, how do I reverse a list in Python")).toBe(
      "Reverse a list in Python",
    );
    expect(cleanSummary("I want to set up a corporate proxy")).toBe(
      "Set up a corporate proxy",
    );
  });

  it("capitalizes the first character of the result", () => {
    expect(cleanSummary("explain RAII in Rust")).toBe("Explain RAII in Rust");
  });

  it("strips markdown and code fences", () => {
    expect(cleanSummary("**Fix** the `build`")).toBe("Fix the build");
  });
});

describe("toNounForm", () => {
  it("converts a leading imperative verb to its gerund", () => {
    expect(toNounForm("Refactor the auth module")).toBe(
      "Refactoring the auth module",
    );
    expect(toNounForm("Reverse a list in Python")).toBe(
      "Reversing a list in Python",
    );
    expect(toNounForm("Explain RAII in Rust")).toBe("Explaining RAII in Rust");
  });

  it("handles two-word phrasal verbs", () => {
    expect(toNounForm("Set up a corporate proxy")).toBe(
      "Setting up a corporate proxy",
    );
  });

  it("leaves text unchanged when the first word isn't a known verb", () => {
    expect(toNounForm("Corporate proxy configuration")).toBe(
      "Corporate proxy configuration",
    );
    expect(toNounForm("")).toBe("");
  });
});

describe("getSessionTranscript", () => {
  it("builds a decoded User/Assistant transcript, skipping tool/empty turns", () => {
    seedMessages([
      { sessionId: "s1", role: "user", content: "How do I reverse a list?" },
      { sessionId: "s1", role: "tool", content: "tool noise" },
      { sessionId: "s1", role: "assistant", content: "Use reversed()." },
      { sessionId: "s1", role: "user", content: "   " }, // empty after trim
    ]);

    const transcript = getSessionTranscript("s1");
    expect(transcript).toContain("User: How do I reverse a list?");
    expect(transcript).toContain("Assistant: Use reversed().");
    expect(transcript).not.toContain("tool noise");
    // The whitespace-only user turn is dropped.
    expect(transcript.match(/User:/g)?.length).toBe(1);
  });

  it("decodes the multimodal JSON sentinel before building the line", () => {
    const encoded =
      "\x00json:" +
      JSON.stringify([{ type: "text", text: "Summarize this image" }]);
    seedMessages([{ sessionId: "s2", role: "user", content: encoded }]);

    const transcript = getSessionTranscript("s2");
    expect(transcript).toContain("User: Summarize this image");
    expect(transcript).not.toContain("json");
    expect(transcript).not.toContain("type");
  });

  it("respects the maxChars cap", () => {
    seedMessages([
      { sessionId: "s3", role: "user", content: "x".repeat(500) },
      { sessionId: "s3", role: "assistant", content: "y".repeat(500) },
    ]);
    const transcript = getSessionTranscript("s3", 100);
    expect(transcript.length).toBeLessThanOrEqual(100);
  });
});

describe("summarizeSession (extractive fallback — no model configured)", () => {
  it("returns null when the transcript is empty (no messages)", async () => {
    const result = await summarizeSession("no-such-session");
    expect(result).toBeNull();
  });

  it("extracts and cleans the first substantive user request", async () => {
    // Distinct session id — the better-sqlite3 fake's store persists across
    // tests (keyed by db path), so reusing "s1"/"s2" would pick up the
    // getSessionTranscript block's seeded messages.
    seedMessages([
      {
        sessionId: "sum-refactor",
        role: "user",
        content: "Can you please refactor the auth module?",
      },
      {
        sessionId: "sum-refactor",
        role: "assistant",
        content: "Sure, here's a plan.",
      },
    ]);
    const result = await summarizeSession("sum-refactor");
    expect(result?.summary).toBe("Refactoring the auth module?");
    expect(result?.llm).toBe(false);
  });

  it("skips a bare greeting and uses the next substantive user turn", async () => {
    seedMessages([
      { sessionId: "sum-greet", role: "user", content: "hi" },
      {
        sessionId: "sum-greet",
        role: "assistant",
        content: "Hello! How can I help?",
      },
      {
        sessionId: "sum-greet",
        role: "user",
        content: "How do I set up a corporate proxy",
      },
    ]);
    const result = await summarizeSession("sum-greet");
    expect(result?.summary).toBe("Setting up a corporate proxy");
  });
});
