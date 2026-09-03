/**
 * Korean is the default language, so an untranslated string is not a cosmetic
 * gap — it is an English sentence in the middle of a Korean screen.
 *
 * `i18n-sales-copy.test.ts` already asserts ko has every *key* en has. That
 * passes even when the ko value is still the English sentence copied over,
 * which is how 658 of 883 strings sat untranslated. This asserts the *values*
 * are actually Korean, with an explicit allowlist for the ones that should
 * stay in Latin script.
 *
 * When you add a key, translate it. If it genuinely must stay English, add it
 * to the allowlist below with the reason — that keeps the exception a
 * decision rather than an oversight.
 */

import { describe, expect, it } from "vitest";
import { resources } from "../src/shared/i18n";

type Node = Record<string, unknown>;

function flatten(node: Node, prefix = ""): Array<[string, string]> {
  return Object.entries(node).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object") {
      return flatten(value as Node, path);
    }
    return [[path, String(value)] as [string, string]];
  });
}

/**
 * Namespaces for screens that were removed when the app was cut down to the
 * work a sales team does. `GATEWAY_SECTIONS` / `GATEWAY_PLATFORMS` in
 * constants.ts are still exported but nothing imports them, and the Office
 * screen is gone. Translating dead copy is work with no reader.
 */
const DEAD_SCREEN_PREFIXES = ["office.", "gateway."];

/** constants.ts keys that belong to the removed messaging-gateway screen. */
const DEAD_CONSTANT_PATTERNS = [
  /^constants\.platform/,
  /^constants\.gatewayMessagingPlatforms$/,
  /^constants\.(telegram|discord|slack|whatsapp|signal|matrix|mattermost|email|sms|twilio|bluebubbles|dingtalk|feishu|wecom|weixin|webhook|ha)[A-Z]/,
];

/**
 * Values that stay in Latin script on purpose. Grouped by why, so a future
 * addition has to pick a reason it belongs to.
 */
const ALLOWED = new Set<string>([
  // Product and vendor names — translating these would make them unfindable.
  "common.appName",
  "versionCheck.desktopName",
  "constants.openrouterName",
  "constants.anthropicName",
  "constants.openaiName",
  "constants.openaiCodexName",
  "constants.googleName",
  "constants.xaiName",
  "constants.nousName",
  "constants.localName",
  "constants.customOpenAICompatibleName",
  "constants.lmstudio",
  "constants.ollama",
  "constants.vllm",
  "constants.llamacpp",
  "constants.groq",
  "constants.deepseek",
  "constants.together",
  "constants.fireworks",
  "constants.cerebras",
  "constants.mistral",
  "setup.providerCards.openrouter.name",
  "setup.providerCards.anthropic.name",
  "setup.providerCards.openai.name",
  "setup.localPresets.lmstudio",
  "setup.localPresets.ollama",
  "setup.localPresets.vllm",
  "setup.localPresets.llamacpp",
  "setup.localPresets.groq",
  "setup.localPresets.deepseek",
  "setup.localPresets.together",
  "setup.localPresets.fireworks",
  "setup.localPresets.cerebras",
  "setup.localPresets.mistral",

  // Model-name strings that are lists of vendor names.
  "constants.anthropicDesc",
  "constants.openaiDesc",
  "constants.openaiCodexDesc",
  "constants.googleDesc",
  "constants.xaiDesc",
  "constants.nousDesc",
  "constants.localDesc",
  "setup.providerCards.local.desc",

  // URLs, protocol names and format strings — not prose.
  "setup.modelBaseUrlPlaceholder",
  "settings.modelBaseUrlPlaceholder",
  "models.baseUrlPlaceholder",
  "settings.version",
  "tools.http",
  "tools.stdio",

  // Language names are written in their own language, by convention.
  "settings.language.english",
  "settings.language.indonesian",
  "settings.language.japanese",
  "settings.language.spanish",
  "settings.language.chinese",
  "settings.language.portuguese",
]);

function isDead(key: string): boolean {
  return (
    DEAD_SCREEN_PREFIXES.some((p) => key.startsWith(p)) ||
    DEAD_CONSTANT_PATTERNS.some((re) => re.test(key))
  );
}

describe("Korean UI copy", () => {
  const en = new Map(flatten(resources.en.translation as Node));
  const ko = new Map(flatten(resources.ko.translation as Node));

  it("translates every live string a user can read", () => {
    const hangul = /[가-힣]/;
    const untranslated: string[] = [];

    for (const [key, value] of ko) {
      if (isDead(key) || ALLOWED.has(key)) continue;
      if (!value.trim()) continue;
      // Still identical to English AND carrying no Hangul => never translated.
      if (value === en.get(key) && !hangul.test(value)) untranslated.push(key);
    }

    expect(
      untranslated,
      "these render as English on a Korean screen — translate them in " +
        "src/shared/i18n/locales/ko/, or allowlist with a reason",
    ).toEqual([]);
  });

  it("keeps the allowlist honest — every entry must still exist", () => {
    // A renamed key would otherwise leave a dead exemption behind, quietly
    // widening the allowlist for whatever takes that name next.
    const stale = [...ALLOWED].filter((key) => !ko.has(key));
    expect(stale, "allowlisted keys that no longer exist").toEqual([]);
  });

  it("does not allowlist anything that is already translated", () => {
    const hangul = /[가-힣]/;
    const pointless = [...ALLOWED].filter((key) => {
      const value = ko.get(key);
      return value !== undefined && hangul.test(value);
    });
    expect(pointless, "allowlisted but already Korean — drop them").toEqual([]);
  });
});
