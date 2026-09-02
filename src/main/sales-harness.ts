/**
 * Seeds the sales skill set into HERMES_HOME and exposes the curated
 * connector catalogue.
 *
 * Why the skills ship in the app bundle rather than being pulled from the
 * skill registry at first run: the same reasoning as `pii-gateway.ts`. A
 * bundled copy survives `hermes update` (which only replaces
 * ~/.hermes/hermes-agent), needs no network on first launch — corporate
 * machines often have none — and cannot be swapped underneath us by a
 * registry change. These skills are plain Markdown we wrote; nothing here
 * executes.
 *
 * Seeding is versioned rather than one-shot. `SALES_HARNESS_VERSION` bumps
 * whenever the shipped skills change, and only then are existing files
 * rewritten, so a user's own edits survive every launch in between.
 */

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "fs";
import { join } from "path";
import { profileHome, PRIVATE_DIR_MODE } from "./utils";
import type { SalesConnector } from "../shared/sales";

/**
 * Bump when the bundled skills change. Seeding compares this against the
 * marker written into the skills directory and rewrites only on mismatch.
 */
export const SALES_HARNESS_VERSION = 2;

/** Category directory the skills live under, per the layout skills.ts scans. */
export const SALES_CATEGORY = "sales";

const MARKER_FILE = ".harness-version";

export interface SeedResult {
  /** Skills written this run. Empty when already current. */
  seeded: string[];
  /** True when the marker matched and nothing was rewritten. */
  upToDate: boolean;
  /** Set when seeding could not run at all; the app continues regardless. */
  error?: string;
}

/**
 * Locate a bundled resource across the production layout
 * (process.resourcesPath) and the dev layout (repo resources/). Mirrors
 * `resolveScriptsDir` in pii-gateway.ts and `bundledResourceCandidates` in
 * installer.ts — same problem, same candidate order.
 */
function resolveBundled(relative: string, sentinel: string): string {
  const resourcesPath =
    (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath ??
    "";
  const candidates = [
    resourcesPath ? join(resourcesPath, "resources", relative) : "",
    resourcesPath ? join(resourcesPath, relative) : "",
    join(__dirname, "..", "..", "resources", relative),
    join(process.cwd(), "resources", relative),
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      if (existsSync(join(candidate, sentinel))) return candidate;
    } catch {
      /* candidate not readable — try the next */
    }
  }
  return "";
}

/** Root of the bundled skills, or "" when the bundle is missing. */
export function salesSkillsSource(): string {
  return resolveBundled(
    join("sales-skills", SALES_CATEGORY),
    join("discovery-notes", "SKILL.md"),
  );
}

/** Where the skills are installed for a profile. */
export function salesSkillsTarget(profile?: string): string {
  return join(profileHome(profile), "skills", SALES_CATEGORY);
}

function readMarker(dir: string): number | null {
  try {
    const raw = readFileSync(join(dir, MARKER_FILE), "utf-8").trim();
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Copy the bundled sales skills into the profile's skills directory.
 *
 * Idempotent: returns early once the installed marker matches
 * `SALES_HARNESS_VERSION`. Never throws — a desktop that cannot seed its
 * skills should still start, so failures come back on the result.
 */
export function seedSalesSkills(profile?: string): SeedResult {
  const source = salesSkillsSource();
  if (!source) {
    return {
      seeded: [],
      upToDate: false,
      error: "Bundled sales skills not found.",
    };
  }

  const target = salesSkillsTarget(profile);

  try {
    if (readMarker(target) === SALES_HARNESS_VERSION) {
      return { seeded: [], upToDate: true };
    }

    mkdirSync(target, { recursive: true, mode: PRIVATE_DIR_MODE });

    const seeded: string[] = [];
    for (const name of readdirSync(source)) {
      const skillDir = join(source, name);
      if (!statSync(skillDir).isDirectory()) continue;

      const skillFile = join(skillDir, "SKILL.md");
      if (!existsSync(skillFile)) continue;

      const outDir = join(target, name);
      mkdirSync(outDir, { recursive: true });
      copyFileSync(skillFile, join(outDir, "SKILL.md"));
      seeded.push(name);
    }

    // Marker last: a crash mid-copy leaves it stale, so the next launch
    // retries rather than declaring a half-written set current.
    writeFileSync(join(target, MARKER_FILE), String(SALES_HARNESS_VERSION), {
      encoding: "utf-8",
    });

    return { seeded, upToDate: false };
  } catch (err) {
    return {
      seeded: [],
      upToDate: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * The curated connector catalogue. Metadata only — reading it neither
 * enables nor launches anything. See the `note` field in the JSON for why
 * every entry is first-party.
 */
export function salesMcpCatalog(): SalesConnector[] {
  const dir = resolveBundled(".", "sales-mcp-catalog.json");
  if (!dir) return [];
  try {
    const raw = readFileSync(join(dir, "sales-mcp-catalog.json"), "utf-8");
    const parsed = JSON.parse(raw) as { servers?: SalesConnector[] };
    const servers = Array.isArray(parsed.servers) ? parsed.servers : [];
    // Defence in depth: the catalogue is ours, but nothing downstream
    // should be able to ship an entry that arrives pre-enabled.
    return servers.map((server) => ({ ...server, enabledByDefault: false }));
  } catch {
    return [];
  }
}
