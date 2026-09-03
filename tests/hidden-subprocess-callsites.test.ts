/**
 * Every child process the main process starts must be launched with a hidden
 * console window on Windows.
 *
 * Why this test exists: `process-options.test.ts` only checks that the
 * `hiddenSubprocessOptions` helper sets the flag. Nothing checked that the
 * ~40 spawn/exec call sites actually use it, so the "console window flashes"
 * bug was fixed once, regressed, and was fixed again — three call sites
 * (`pii-gateway.ts`, `kanban.ts`, `sudoCreds.ts`) had drifted back to
 * spawning without `windowsHide`. The pii-gateway one ran on every protected
 * message, so a window flashed on every single send.
 *
 * A unit test on the helper cannot catch that. This walks the call sites.
 */

import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";

const MAIN_DIR = join(__dirname, "..", "src", "main");
const PRELOAD_DIR = join(__dirname, "..", "src", "preload");

/** child_process functions that create an OS process. */
const SPAWNING_FNS = [
  "spawn",
  "spawnSync",
  "exec",
  "execSync",
  "execFile",
  "execFileSync",
  "fork",
];

/** Any of these in the options makes the console window hidden. */
const COVERAGE_MARKERS = [
  "windowsHide",
  "HIDDEN_SUBPROCESS_OPTIONS",
  "hiddenSubprocessOptions",
];

interface CallSite {
  file: string;
  line: number;
  fn: string;
  args: string;
}

/**
 * Text of the call's arguments, from the opening paren to its match.
 * Tracks quotes so a ")" inside a string literal does not close the call.
 */
function argumentSpan(src: string, openParen: number): string {
  let depth = 0;
  let quote: string | null = null;
  for (let i = openParen; i < src.length; i++) {
    const ch = src[i];
    if (quote) {
      if (ch === "\\") i++;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch;
      continue;
    }
    if (ch === "(") depth++;
    else if (ch === ")") {
      depth--;
      if (depth === 0) return src.slice(openParen + 1, i);
    }
  }
  return src.slice(openParen + 1);
}

/** Names imported from "child_process" in this file. */
function childProcessImports(src: string): Set<string> {
  const names = new Set<string>();
  const re = /import\s*\{([^}]*)\}\s*from\s*["'](?:node:)?child_process["']/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    for (const raw of m[1].split(",")) {
      // Handles `execFile`, `ExecFileOptions`, and `spawn as spawnProc`.
      const name = raw.split(" as ").pop()?.trim();
      if (name) names.add(name);
    }
  }
  return names;
}

/**
 * Block-comment ranges, so a `spawn(...)` quoted inside a doc comment is not
 * reported as an unguarded call site (hermes.ts does exactly that).
 */
function blockCommentRanges(src: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  const re = /\/\*[\s\S]*?\*\//g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    ranges.push([m.index, m.index + m[0].length]);
  }
  return ranges;
}

/**
 * True when `index` sits in a comment. Deliberately simple: a line whose
 * first non-space characters are `//`, `*` or `/*`, an inline `//` earlier on
 * the same line, or a position inside a block comment. Only text BEFORE the
 * match is considered, so a URL in a call's own arguments cannot mask it.
 */
function isInComment(
  src: string,
  index: number,
  blocks: Array<[number, number]>,
): boolean {
  if (blocks.some(([start, end]) => index >= start && index < end)) return true;
  const lineStart = src.lastIndexOf("\n", index) + 1;
  const before = src.slice(lineStart, index);
  const trimmed = before.trimStart();
  if (
    trimmed.startsWith("//") ||
    trimmed.startsWith("*") ||
    trimmed.startsWith("/*")
  ) {
    return true;
  }
  return before.includes("//");
}

function collectCallSites(file: string, src: string): CallSite[] {
  const imported = childProcessImports(src);
  const spawning = SPAWNING_FNS.filter((fn) => imported.has(fn));
  if (spawning.length === 0) return [];

  const sites: CallSite[] = [];
  const blocks = blockCommentRanges(src);
  // Negative lookbehind on "." and word chars keeps `someRegex.exec(...)` and
  // `foo.spawn(...)` out — this repo calls the imported bindings directly.
  const re = new RegExp(`(?<![.\\w])(${spawning.join("|")})\\s*\\(`, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    if (isInComment(src, m.index, blocks)) continue;
    const openParen = src.indexOf("(", m.index);
    sites.push({
      file,
      line: src.slice(0, m.index).split("\n").length,
      fn: m[1],
      args: argumentSpan(src, openParen),
    });
  }
  return sites;
}

/**
 * Comments must not count as coverage. A comment explaining *why*
 * `windowsHide` matters contains the word `windowsHide`, which made an early
 * version of this guard pass a call site that had lost the flag — caught by
 * deliberately reintroducing the bug. Errs toward reporting: dropping a line
 * at `//` can only remove markers, never invent them.
 */
function stripComments(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .split("\n")
    .map((line) => {
      const i = line.indexOf("//");
      return i === -1 ? line : line.slice(0, i);
    })
    .join("\n");
}

/**
 * Options may be passed as a variable (`execFile(bin, args, execOpts, cb)`),
 * so when the span itself has no marker, resolve one level: does any
 * identifier in the span belong to a `const <id> ... = { … }` in this file
 * whose initializer carries a marker?
 */
function coveredByLocalOptions(src: string, span: string): boolean {
  const identifiers = new Set(span.match(/\b[A-Za-z_$][\w$]*\b/g) ?? []);
  for (const id of identifiers) {
    const decl = new RegExp(
      `\\b(?:const|let|var)\\s+${id}\\b[^=]*=\\s*\\{`,
      "g",
    ).exec(src);
    if (!decl) continue;
    const braceStart = src.indexOf("{", decl.index);
    // The declaration's object literal, brace-matched.
    let depth = 0;
    for (let i = braceStart; i < src.length; i++) {
      if (src[i] === "{") depth++;
      else if (src[i] === "}") {
        depth--;
        if (depth === 0) {
          const body = src.slice(braceStart, i + 1);
          if (COVERAGE_MARKERS.some((mk) => body.includes(mk))) return true;
          break;
        }
      }
    }
  }
  return false;
}

/**
 * Recursive on purpose. `src/main` is flat today, so a top-level read would
 * pass — but this guard exists because the bug keeps coming back, and a
 * scanner that silently skips a new subdirectory is how it would come back
 * again. Preload is included for the same reason: it runs in Node too.
 */
function scannedFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string, prefix: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(join(dir, entry.name), rel);
      else if (entry.name.endsWith(".ts")) out.push(rel);
    }
  };
  for (const [dir, prefix] of [
    [MAIN_DIR, ""],
    [PRELOAD_DIR, "../preload"],
  ] as const) {
    walk(dir, prefix);
  }
  return out.sort();
}

describe("child processes never flash a console window on Windows", () => {
  const sites = scannedFiles().flatMap((name) =>
    collectCallSites(name, readFileSync(join(MAIN_DIR, name), "utf-8")),
  );

  it("finds the spawn call sites it is meant to guard", () => {
    // A refactor that moves every shell-out behind a wrapper would silently
    // empty this suite, so assert the scanner still sees the real surface.
    expect(sites.length).toBeGreaterThan(20);
    expect(sites.map((s) => s.file)).toContain("hermes.ts");
    expect(sites.map((s) => s.file)).toContain("pii-gateway.ts");
  });

  it("passes hidden-window options at every call site", () => {
    const uncovered = sites.filter((site) => {
      const src = readFileSync(join(MAIN_DIR, site.file), "utf-8");
      const args = stripComments(site.args);
      if (COVERAGE_MARKERS.some((mk) => args.includes(mk))) return false;
      return !coveredByLocalOptions(stripComments(src), args);
    });

    expect(
      uncovered.map((s) => `${s.file}:${s.line} ${s.fn}()`),
      "these spawn a visible console window on Windows — add " +
        "...HIDDEN_SUBPROCESS_OPTIONS to the options object",
    ).toEqual([]);
  });
});
