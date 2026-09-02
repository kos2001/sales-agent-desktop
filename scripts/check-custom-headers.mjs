// One-off diagnostic — reads ~/.hermes/.env and reproduces the exact
// logic of src/main/config.ts:resolveCustomRequestHeaders so we can
// verify which headers will be sent on the next chat request without
// actually firing one. Prints HEADER NAMES + value LENGTHS only — no
// secret values leak into the transcript.
import { readFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";

function readEnv(path) {
  try {
    const raw = readFileSync(path, "utf8");
    const out = {};
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq < 0) continue;
      out[trimmed.slice(0, eq)] = trimmed.slice(eq + 1);
    }
    return out;
  } catch {
    return {};
  }
}

function suffixToHeader(suffix) {
  return suffix
    .split("_")
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
    .join("-");
}

function resolveCustomRequestHeaders(profileEnv, defaultEnv) {
  const out = {};
  for (const src of [defaultEnv, profileEnv]) {
    for (const [key, raw] of Object.entries(src)) {
      const value = String(raw ?? "").trim();
      if (!value) continue;
      if (key === "SERVICE_ID") {
        out["Service-Id"] = value;
        continue;
      }
      if (key === "USER_ID") {
        out["User-Id"] = value;
        continue;
      }
      if (key.startsWith("OPENAI_HEADER_")) {
        const suffix = key.slice("OPENAI_HEADER_".length);
        if (!suffix) continue;
        out[suffixToHeader(suffix)] = value;
      }
    }
  }
  return out;
}

const defaultEnv = readEnv(join(homedir(), ".hermes", ".env"));
const headers = resolveCustomRequestHeaders({}, defaultEnv);

console.log("Headers that will be attached to outgoing chat requests:");
console.log("");
const names = Object.keys(headers);
if (names.length === 0) {
  console.log("  (none)");
} else {
  for (const name of names) {
    console.log(`  ${name}: <${headers[name].length} chars>`);
  }
}
console.log("");
console.log(
  `Total: ${names.length} custom header(s) — Authorization, Content-Type, X-Hermes-Session-Id added separately.`,
);
