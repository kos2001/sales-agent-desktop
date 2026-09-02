/**
 * Desktop-side PII de-identification gateway (approach B).
 *
 * Wraps the pii-encryption-gateway toolkit's deterministic Python scripts
 * (stdlib-only, no LLM) so the desktop can de-identify an outgoing chat
 * message BEFORE it is dispatched to the Hermes gateway / cloud model, then
 * re-identify the tokens in the response — all on the local PC.
 *
 * This is the hard, deterministic guarantee for the per-conversation
 * "personal-info protection" mode: when it's on, identifiers (이름·주민번호·
 * 사번·계좌·전화·이메일·카드·사업자번호·IP) are replaced with stable tokens
 * (`[[EMAIL:…]]`) before egress and restored locally afterward.
 *
 * The scripts are BUNDLED with the desktop app (resources/pii-gateway/scripts),
 * NOT read from $HERMES_HOME/skills — so a `hermes` engine update or a skill
 * removal can't break this security path. No change to the Hermes CLI itself.
 */
import { execFile } from "child_process";
import {
  mkdtempSync,
  writeFileSync,
  readFileSync,
  rmSync,
  existsSync,
} from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { HERMES_PYTHON, getEnhancedPath } from "./installer";

// The toolkit scripts are BUNDLED into the desktop app under
// resources/pii-gateway/scripts (electron-builder ships resources/**), NOT
// read from $HERMES_HOME/skills. That deliberately decouples this security
// path from the Hermes engine: a `hermes update` (which only touches
// ~/.hermes/hermes-agent) or a skill removal can't break de-identification.
// Mirrors installer.ts's bundledResourceCandidates (prod resourcesPath + dev
// repo resources/).
function resolveScriptsDir(): string {
  const resourcesPath =
    (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath ??
    "";
  const rel = join("pii-gateway", "scripts");
  const candidates = [
    resourcesPath ? join(resourcesPath, "resources", rel) : "",
    resourcesPath ? join(resourcesPath, rel) : "",
    join(__dirname, "..", "..", "resources", rel),
    join(process.cwd(), "resources", rel),
  ].filter(Boolean);
  for (const c of candidates) {
    try {
      if (existsSync(join(c, "deidentify.py"))) return c;
    } catch {
      /* ignore */
    }
  }
  return candidates[candidates.length - 1] || "";
}

const SCRIPTS_DIR = resolveScriptsDir();

export interface DeidResult {
  /** Text with identifier spans replaced by stable tokens. */
  text: string;
  /** token → original-value map (kept ONLY in the local main process). */
  map: Record<string, string>;
  /** Number of identifier values tokenized. */
  count: number;
}

// ASYNC on purpose: a synchronous spawn (spawnSync) would block the main
// process event loop for the whole Python run, freezing all IPC — including
// session search — while summaries are generated in the background. execFile
// runs the script off the event loop and resolves a boolean.
function runScript(script: string, args: string[]): Promise<boolean> {
  return new Promise((resolve) => {
    execFile(
      HERMES_PYTHON,
      [join(SCRIPTS_DIR, script), ...args],
      {
        env: { ...process.env, PATH: getEnhancedPath() },
        encoding: "utf-8",
        timeout: 20_000,
        maxBuffer: 10 * 1024 * 1024,
      },
      (err) => resolve(!err),
    );
  });
}

/**
 * De-identify free text via the toolkit. Returns null on ANY failure — the
 * caller MUST treat null as "do not send" (fail-safe: never forward raw text
 * when protection was requested but couldn't be applied). Empty/whitespace
 * input returns an empty result (nothing to protect).
 */
export async function deidentifyText(text: string): Promise<DeidResult | null> {
  if (!text || !text.trim()) return { text, map: {}, count: 0 };
  let dir: string | null = null;
  try {
    dir = mkdtempSync(join(tmpdir(), "hermes-pii-"));
    const inPath = join(dir, "in.txt");
    const outPath = join(dir, "out.txt");
    const mapPath = join(dir, "map.json");
    writeFileSync(inPath, text, "utf-8");
    if (
      !(await runScript("deidentify.py", [
        "--in",
        inPath,
        "--out",
        outPath,
        "--map",
        mapPath,
      ]))
    ) {
      return null;
    }
    const out = readFileSync(outPath, "utf-8");
    const map = JSON.parse(readFileSync(mapPath, "utf-8")) as Record<
      string,
      string
    >;
    return { text: out, map, count: Object.keys(map).length };
  } catch {
    return null;
  } finally {
    if (dir) {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        /* best-effort temp cleanup */
      }
    }
  }
}

/**
 * Restore identifier tokens in `text` using a de-id map. On failure the text
 * is returned unchanged — that only leaves tokens visible (no raw value
 * leaks), so it's safe to be lenient here.
 */
export async function reidentifyText(
  text: string,
  map: Record<string, string>,
): Promise<string> {
  if (!text || !map || Object.keys(map).length === 0) return text;
  let dir: string | null = null;
  try {
    dir = mkdtempSync(join(tmpdir(), "hermes-pii-"));
    const inPath = join(dir, "in.txt");
    const outPath = join(dir, "out.txt");
    const mapPath = join(dir, "map.json");
    writeFileSync(inPath, text, "utf-8");
    writeFileSync(mapPath, JSON.stringify(map), "utf-8");
    if (
      !(await runScript("reidentify.py", [
        "--map",
        mapPath,
        "--in",
        inPath,
        "--out",
        outPath,
      ]))
    ) {
      return text;
    }
    return readFileSync(outPath, "utf-8");
  } catch {
    return text;
  } finally {
    if (dir) {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        /* best-effort temp cleanup */
      }
    }
  }
}
