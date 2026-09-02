import { execFile } from "child_process";
import { promisify } from "util";
import { join } from "path";
import { homedir } from "os";
import { promises as fs } from "fs";
import { existsSync } from "fs";

const execFileAsync = promisify(execFile);
import {
  HERMES_HOME,
  HERMES_PYTHON,
  hermesCliArgs,
  getEnhancedPath,
} from "./installer";
import {
  getActiveProfileNameSync,
  isValidNamedProfileName,
  isValidProfileName,
  pidIsAliveAs,
  PROFILE_NAME_ERROR,
} from "./utils";
import { HIDDEN_SUBPROCESS_OPTIONS } from "./process-options";

const PROFILES_DIR = join(HERMES_HOME, "profiles");

export interface ProfileInfo {
  name: string;
  path: string;
  isDefault: boolean;
  isActive: boolean;
  model: string;
  provider: string;
  hasEnv: boolean;
  hasSoul: boolean;
  skillCount: number;
  gatewayRunning: boolean;
}

async function readProfileConfig(profilePath: string): Promise<{
  model: string;
  provider: string;
}> {
  const configFile = join(profilePath, "config.yaml");
  try {
    const content = await fs.readFile(configFile, "utf-8");
    const modelMatch = content.match(/^\s*default:\s*["']?([^"'\n#]+)["']?/m);
    const providerMatch = content.match(
      /^\s*provider:\s*["']?([^"'\n#]+)["']?/m,
    );
    return {
      model: modelMatch ? modelMatch[1].trim() : "",
      provider: providerMatch ? providerMatch[1].trim() : "auto",
    };
  } catch {
    return { model: "", provider: "" };
  }
}

async function countSkills(profilePath: string): Promise<number> {
  const skillsDir = join(profilePath, "skills");
  try {
    const dirs = await fs.readdir(skillsDir);
    let count = 0;
    for (const d of dirs) {
      const sub = join(skillsDir, d);
      const stat = await fs.stat(sub);
      if (stat.isDirectory()) {
        const inner = await fs.readdir(sub);
        for (const f of inner) {
          try {
            await fs.access(join(sub, f, "SKILL.md"));
            count++;
          } catch {
            // not a skill
          }
        }
      }
    }
    return count;
  } catch {
    return 0;
  }
}

async function isGatewayRunning(profilePath: string): Promise<boolean> {
  const pidFile = join(profilePath, "gateway.pid");
  try {
    const raw = (await fs.readFile(pidFile, "utf-8")).trim();
    // The Python hermes CLI writes JSON: {"pid": <n>, "kind": ..., ...}.
    // Older builds wrote a bare integer, so fall back to parseInt.
    const parsed = raw.startsWith("{")
      ? (JSON.parse(raw) as { pid?: unknown }).pid
      : parseInt(raw, 10);
    const pid =
      typeof parsed === "number" && Number.isFinite(parsed) ? parsed : NaN;
    if (isNaN(pid)) return false;
    return pidIsAliveAs(pid, ["python", "pythonw"]);
  } catch {
    return false;
  }
}

async function getActiveProfileName(): Promise<string> {
  return getActiveProfileNameSync();
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await fs.access(path);
    return true;
  } catch {
    return false;
  }
}

export async function listProfiles(): Promise<ProfileInfo[]> {
  const activeName = await getActiveProfileName();
  const profiles: ProfileInfo[] = [];

  // Default profile is HERMES_HOME itself
  const [
    defaultConfig,
    defaultHasEnv,
    defaultHasSoul,
    defaultSkills,
    defaultGw,
  ] = await Promise.all([
    readProfileConfig(HERMES_HOME),
    fileExists(join(HERMES_HOME, ".env")),
    fileExists(join(HERMES_HOME, "SOUL.md")),
    countSkills(HERMES_HOME),
    isGatewayRunning(HERMES_HOME),
  ]);

  profiles.push({
    name: "default",
    path: HERMES_HOME,
    isDefault: true,
    isActive: activeName === "default",
    model: defaultConfig.model,
    provider: defaultConfig.provider,
    hasEnv: defaultHasEnv,
    hasSoul: defaultHasSoul,
    skillCount: defaultSkills,
    gatewayRunning: defaultGw,
  });

  // Named profiles under ~/.hermes/profiles/
  if (existsSync(PROFILES_DIR)) {
    try {
      const dirs = await fs.readdir(PROFILES_DIR);
      const profilePromises = dirs.map(async (name) => {
        // Skip dotfiles like .DS_Store so they don't get mistaken for profiles.
        if (name.startsWith(".")) return null;
        if (!isValidNamedProfileName(name)) return null;

        const profilePath = join(PROFILES_DIR, name);
        const stat = await fs.stat(profilePath);
        if (!stat.isDirectory()) return null;

        // Any subdirectory of ~/.hermes/profiles/ is treated as a profile.
        // We deliberately do NOT require config.yaml or .env to exist —
        // a freshly created profile may have neither yet, and filtering on
        // them silently hides it from the UI (issue #19).
        const [config, hasEnvFile, hasSoul, skillCount, gwRunning] =
          await Promise.all([
            readProfileConfig(profilePath),
            fileExists(join(profilePath, ".env")),
            fileExists(join(profilePath, "SOUL.md")),
            countSkills(profilePath),
            isGatewayRunning(profilePath),
          ]);

        return {
          name,
          path: profilePath,
          isDefault: false,
          isActive: activeName === name,
          model: config.model,
          provider: config.provider,
          hasEnv: hasEnvFile,
          hasSoul: hasSoul,
          skillCount,
          gatewayRunning: gwRunning,
        } as ProfileInfo;
      });

      const resolved = await Promise.all(profilePromises);
      for (const p of resolved) {
        if (p) profiles.push(p);
      }
    } catch {
      // ignore
    }
  }

  return profiles;
}

export async function createProfile(
  name: string,
  clone: boolean,
): Promise<{ success: boolean; error?: string }> {
  if (name === "default") {
    return { success: false, error: "Cannot create the default profile" };
  }
  if (!isValidNamedProfileName(name)) {
    return { success: false, error: PROFILE_NAME_ERROR };
  }

  const args = clone
    ? ["profile", "create", name, "--clone"]
    : ["profile", "create", name];
  return runProfileCli(args, 15000);
}

export async function deleteProfile(name: string): Promise<{
  success: boolean;
  error?: string;
}> {
  if (name === "default")
    return { success: false, error: "Cannot delete the default profile" };
  if (!isValidNamedProfileName(name)) {
    return { success: false, error: PROFILE_NAME_ERROR };
  }

  return runProfileCli(["profile", "delete", name, "--yes"], 15000);
}

export async function setActiveProfile(name: string): Promise<void> {
  if (!isValidProfileName(name)) {
    throw new Error(PROFILE_NAME_ERROR);
  }

  // Fire-and-forget semantics preserved from the previous execFileSync
  // call (which swallowed errors). The promise resolves either way;
  // callers in index.ts continue without waiting for completion.
  try {
    await runProfileCli(["profile", "use", name], 10000);
  } catch {
    /* ignore */
  }
}

// Shared subprocess wrapper for hermes-agent CLI calls. Returns the
// same {success, error} shape the IPC handlers were already returning,
// so the call sites only need to add `await`.
async function runProfileCli(
  args: string[],
  timeoutMs: number,
): Promise<{ success: boolean; error?: string }> {
  try {
    await execFileAsync(HERMES_PYTHON, hermesCliArgs(args), {
      cwd: join(HERMES_HOME, "hermes-agent"),
      env: {
        ...process.env,
        PATH: getEnhancedPath(),
        HOME: homedir(),
        HERMES_HOME,
      },
      timeout: timeoutMs,
      ...HIDDEN_SUBPROCESS_OPTIONS,
    });
    return { success: true };
  } catch (err) {
    const msg =
      (err as { stderr?: Buffer | string }).stderr?.toString() ||
      (err as Error).message;
    return { success: false, error: msg.trim() };
  }
}
