// ── Shared Types ────────────────────────────────────────

export interface FieldDef {
  key: string;
  label: string;
  type: string;
  hint: string;
}

export interface SectionDef {
  title: string;
  items: FieldDef[];
}

// ── Providers ───────────────────────────────────────────

/**
 * The single LLM provider this build is configured for.
 *
 * Swap this one object to point the product at an in-house gateway; the
 * provider dropdown, the setup wizard and the API-key field all read from it,
 * so nothing else needs editing. `configProvider` must name a provider that
 * hermes-agent recognises (see hermes_cli/auth.py) — use "custom" with an
 * explicit baseUrl for an internal OpenAI-compatible endpoint.
 */
export const ACTIVE_PROVIDER = {
  id: "openrouter",
  value: "openrouter",
  name: "constants.openrouterName",
  label: "constants.openrouterName",
  desc: "constants.openrouterDesc",
  tag: "constants.openrouterTag",
  envKey: "OPENROUTER_API_KEY",
  url: "https://openrouter.ai/keys",
  placeholder: "sk-or-v1-...",
  configProvider: "openrouter",
  baseUrl: "https://openrouter.ai/api/v1",
  needsKey: true,
} as const;

export const PROVIDERS = {
  // Ordered for the Providers / model-picker dropdown.  Each value must
  // match a provider name `hermes-agent` recognises (see
  // hermes_cli/auth.py::resolve_provider — _PROVIDER_ALIASES + PROVIDER_REGISTRY)
  // so the gateway routes correctly when the user picks the entry.  The
  // catch-all `custom` stays last for unlisted OpenAI-compatible endpoints.
  // ── The one provider this build offers ──────────────────────────
  //
  // Narrowed from twenty-plus entries to a single choice. A salesperson has
  // no basis for picking between Fireworks and Cerebras, and every extra row
  // is a way to misconfigure the app. To move onto an in-house gateway,
  // change ACTIVE_PROVIDER below and this list follows.
  //
  // `labels` deliberately keeps the full map: a profile configured before
  // this change still renders a human name instead of a raw id.
  options: [{ value: ACTIVE_PROVIDER.value, label: ACTIVE_PROVIDER.label }],

  labels: {
    openrouter: "constants.openrouterName",
    anthropic: "constants.anthropicName",
    openai: "constants.openaiName",
    "openai-codex": "constants.openaiCodexName",
    google: "constants.googleName",
    xai: "constants.xaiName",
    mistral: "Mistral",
    deepseek: "DeepSeek",
    groq: "Groq",
    together: "Together AI",
    fireworks: "Fireworks AI",
    cerebras: "Cerebras",
    perplexity: "Perplexity",
    huggingface: "Hugging Face",
    nvidia: "NVIDIA NIM",
    zai: "Z.ai / GLM",
    qwen: "Qwen",
    minimax: "MiniMax",
    nous: "constants.nousName",
    "xai-oauth": "xAI Grok (OAuth)",
    "qwen-oauth": "Qwen (OAuth)",
    "google-gemini-cli": "Gemini (CLI OAuth)",
    "minimax-oauth": "MiniMax (OAuth)",
    "kimi-coding": "Kimi (Coding Plan)",
    custom: "OpenAI Compatible / Local",
  } as Record<string, string>,

  // Setup wizard shows exactly the provider the app supports.
  setup: [ACTIVE_PROVIDER],
};

// Subscription / OAuth-plan providers — these authenticate through an
// interactive browser login (`hermes auth add <id> --type oauth`) rather
// than a static API key. The Providers screen renders a "Sign in" card
// for each. Values must match hermes-agent's provider registry.
export interface OAuthProviderDef {
  id: string;
  name: string;
  desc: string;
}

// Empty while the app ships a single key-based provider. The Providers
// screen hides the section when this is empty, so a subscription login can be
// reintroduced by adding entries here and nothing else.
export const OAUTH_PROVIDERS: OAuthProviderDef[] = [];

export interface LocalPreset {
  id: string;
  name: string;
  baseUrl: string;
  group: "local" | "remote";
  envKey?: string;
}

export const LOCAL_PRESETS: LocalPreset[] = [
  {
    id: "lmstudio",
    name: "constants.lmstudio",
    baseUrl: "http://localhost:1234/v1",
    group: "local",
  },
  {
    id: "ollama",
    name: "constants.ollama",
    baseUrl: "http://localhost:11434/v1",
    group: "local",
  },
  {
    id: "vllm",
    name: "constants.vllm",
    baseUrl: "http://localhost:8000/v1",
    group: "local",
  },
  {
    id: "llamacpp",
    name: "constants.llamacpp",
    baseUrl: "http://localhost:8080/v1",
    group: "local",
  },
  {
    id: "groq",
    name: "constants.groq",
    baseUrl: "https://api.groq.com/openai/v1",
    group: "remote",
    envKey: "GROQ_API_KEY",
  },
  {
    id: "deepseek",
    name: "constants.deepseek",
    baseUrl: "https://api.deepseek.com/v1",
    group: "remote",
    envKey: "DEEPSEEK_API_KEY",
  },
  {
    id: "together",
    name: "constants.together",
    baseUrl: "https://api.together.xyz/v1",
    group: "remote",
    envKey: "TOGETHER_API_KEY",
  },
  {
    id: "fireworks",
    name: "constants.fireworks",
    baseUrl: "https://api.fireworks.ai/inference/v1",
    group: "remote",
    envKey: "FIREWORKS_API_KEY",
  },
  {
    id: "cerebras",
    name: "constants.cerebras",
    baseUrl: "https://api.cerebras.ai/v1",
    group: "remote",
    envKey: "CEREBRAS_API_KEY",
  },
  {
    id: "mistral",
    name: "constants.mistral",
    baseUrl: "https://api.mistral.ai/v1",
    group: "remote",
    envKey: "MISTRAL_API_KEY",
  },
];

// ── Theme ───────────────────────────────────────────────

/**
 * Bundled-skill categories the Playbooks screen will show.
 *
 * The upstream set is a general-purpose agent's library — ComfyUI,
 * TouchDesigner, p5js, python-debugpy, GitHub PR workflows, MLOps, smart-home
 * lighting, iMessage. Around a hundred skills across sixteen categories, and
 * almost none of it is sales work. Browsing it is how a salesperson ends up
 * installing a debugger.
 *
 * An allowlist rather than a denylist on purpose: upstream adds categories,
 * and the failure mode of a denylist is that new unrelated tooling appears in
 * the product without anyone deciding it should.
 *
 * What is kept is the document, mail, meeting and research work a sales team
 * actually does: docx/xlsx/pptx/pdf, Google Workspace, Notion, inbox triage,
 * meeting action items, competitor monitoring.
 */
export const SALES_SKILL_CATEGORIES = [
  "email",
  "note-taking",
  "productivity",
  "research",
] as const;

export const THEME_OPTIONS = [
  { value: "light" as const, label: "constants.themeLight" },
  { value: "dark" as const, label: "constants.themeDark" },
];

export const THEME_STORAGE_KEY = "hermes-theme";

// ── Settings API Key Sections ───────────────────────────

export const SETTINGS_SECTIONS: SectionDef[] = [
  {
    title: "constants.sectionLlmProviders",
    items: [
      {
        key: "OPENROUTER_API_KEY",
        label: "constants.openrouterApiKey",
        type: "password",
        hint: "constants.openrouterHint",
      },
      {
        key: "OPENAI_API_KEY",
        label: "constants.openaiApiKey",
        type: "password",
        hint: "constants.openaiHint",
      },
      {
        key: "ANTHROPIC_API_KEY",
        label: "constants.anthropicApiKey",
        type: "password",
        hint: "constants.anthropicHint",
      },
      {
        key: "GROQ_API_KEY",
        label: "constants.groqApiKey",
        type: "password",
        hint: "constants.groqHint",
      },
      {
        key: "GLM_API_KEY",
        label: "constants.glmApiKey",
        type: "password",
        hint: "constants.glmHint",
      },
      {
        key: "KIMI_API_KEY",
        label: "constants.kimiApiKey",
        type: "password",
        hint: "constants.kimiHint",
      },
      {
        key: "MINIMAX_API_KEY",
        label: "constants.minimaxApiKey",
        type: "password",
        hint: "constants.minimaxHint",
      },
      {
        key: "MINIMAX_CN_API_KEY",
        label: "constants.minimaxCnApiKey",
        type: "password",
        hint: "constants.minimaxCnHint",
      },
      {
        key: "OPENCODE_ZEN_API_KEY",
        label: "constants.opencodeZenApiKey",
        type: "password",
        hint: "constants.opencodeZenHint",
      },
      {
        key: "OPENCODE_GO_API_KEY",
        label: "constants.opencodeGoApiKey",
        type: "password",
        hint: "constants.opencodeGoHint",
      },
      {
        key: "HF_TOKEN",
        label: "constants.hfToken",
        type: "password",
        hint: "constants.hfHint",
      },
      {
        key: "DEEPSEEK_API_KEY",
        label: "constants.deepseekApiKey",
        type: "password",
        hint: "constants.deepseekHint",
      },
      {
        key: "TOGETHER_API_KEY",
        label: "constants.togetherApiKey",
        type: "password",
        hint: "constants.togetherHint",
      },
      {
        key: "FIREWORKS_API_KEY",
        label: "constants.fireworksApiKey",
        type: "password",
        hint: "constants.fireworksHint",
      },
      {
        key: "CEREBRAS_API_KEY",
        label: "constants.cerebrasApiKey",
        type: "password",
        hint: "constants.cerebrasHint",
      },
      {
        key: "MISTRAL_API_KEY",
        label: "constants.mistralApiKey",
        type: "password",
        hint: "constants.mistralHint",
      },
      {
        key: "PERPLEXITY_API_KEY",
        label: "constants.perplexityApiKey",
        type: "password",
        hint: "constants.perplexityHint",
      },
      {
        key: "NVIDIA_API_KEY",
        label: "constants.nvidiaApiKey",
        type: "password",
        hint: "constants.nvidiaHint",
      },
      {
        key: "CUSTOM_API_KEY",
        label: "constants.customApiKey",
        type: "password",
        hint: "constants.customHint",
      },
      {
        key: "GOOGLE_API_KEY",
        label: "constants.googleApiKey",
        type: "password",
        hint: "constants.googleHint",
      },
      {
        key: "XAI_API_KEY",
        label: "constants.xaiApiKey",
        type: "password",
        hint: "constants.xaiHint",
      },
    ],
  },
  {
    title: "constants.sectionToolApiKeys",
    items: [
      {
        key: "EXA_API_KEY",
        label: "constants.exaApiKey",
        type: "password",
        hint: "constants.exaHint",
      },
      {
        key: "PARALLEL_API_KEY",
        label: "constants.parallelApiKey",
        type: "password",
        hint: "constants.parallelHint",
      },
      {
        key: "TAVILY_API_KEY",
        label: "constants.tavilyApiKey",
        type: "password",
        hint: "constants.tavilyHint",
      },
      {
        key: "FIRECRAWL_API_KEY",
        label: "constants.firecrawlApiKey",
        type: "password",
        hint: "constants.firecrawlHint",
      },
      {
        key: "FAL_KEY",
        label: "constants.falKey",
        type: "password",
        hint: "constants.falHint",
      },
      {
        key: "HONCHO_API_KEY",
        label: "constants.honchoApiKey",
        type: "password",
        hint: "constants.honchoHint",
      },
    ],
  },
  {
    title: "constants.sectionBrowserAutomation",
    items: [
      {
        key: "BROWSERBASE_API_KEY",
        label: "constants.browserbaseApiKey",
        type: "password",
        hint: "constants.browserbaseHint",
      },
      {
        key: "BROWSERBASE_PROJECT_ID",
        label: "constants.browserbaseProjectId",
        type: "text",
        hint: "constants.browserbaseProjectHint",
      },
    ],
  },
  {
    title: "constants.sectionVoiceStt",
    items: [
      {
        key: "VOICE_TOOLS_OPENAI_KEY",
        label: "constants.voiceOpenaiKey",
        type: "password",
        hint: "constants.voiceOpenaiHint",
      },
    ],
  },
  {
    title: "constants.sectionResearchTraining",
    items: [
      {
        key: "TINKER_API_KEY",
        label: "constants.tinkerApiKey",
        type: "password",
        hint: "constants.tinkerHint",
      },
      {
        key: "WANDB_API_KEY",
        label: "constants.wandbKey",
        type: "password",
        hint: "constants.wandbHint",
      },
    ],
  },
  // Custom HTTP headers stamped onto every OpenAI-compatible chat
  // request — used by corporate routers (e.g. internal gateways
  // fronting OpenRouter) that require `Service-Id` / `User-Id` for
  // billing or audit. Stored in the profile's .env; consumed in
  // src/main/config.ts:getCustomRequestHeaders and applied in
  // src/main/hermes.ts before the SSE request is dispatched.
  {
    title: "constants.sectionCustomHeaders",
    items: [
      {
        key: "SERVICE_ID",
        label: "constants.serviceIdLabel",
        type: "text",
        hint: "constants.serviceIdHint",
      },
      {
        key: "USER_ID",
        label: "constants.userIdLabel",
        type: "text",
        hint: "constants.userIdHint",
      },
    ],
  },
];

// ── Gateway Sections ────────────────────────────────────

export const GATEWAY_SECTIONS: SectionDef[] = [
  {
    title: "constants.gatewayMessagingPlatforms",
    items: [
      {
        key: "TELEGRAM_BOT_TOKEN",
        label: "constants.telegramBotToken",
        type: "password",
        hint: "constants.telegramBotHint",
      },
      {
        key: "TELEGRAM_ALLOWED_USERS",
        label: "constants.telegramAllowedUsers",
        type: "text",
        hint: "constants.telegramUsersHint",
      },
      {
        key: "DISCORD_BOT_TOKEN",
        label: "constants.discordBotToken",
        type: "password",
        hint: "constants.discordBotHint",
      },
      {
        key: "DISCORD_ALLOWED_CHANNELS",
        label: "constants.discordAllowedChannels",
        type: "text",
        hint: "constants.discordChannelsHint",
      },
      {
        key: "SLACK_BOT_TOKEN",
        label: "constants.slackBotToken",
        type: "password",
        hint: "constants.slackBotHint",
      },
      {
        key: "SLACK_APP_TOKEN",
        label: "constants.slackAppToken",
        type: "password",
        hint: "constants.slackAppHint",
      },
      {
        key: "WHATSAPP_API_URL",
        label: "constants.whatsappApiUrl",
        type: "text",
        hint: "constants.whatsappUrlHint",
      },
      {
        key: "WHATSAPP_API_TOKEN",
        label: "constants.whatsappApiToken",
        type: "password",
        hint: "constants.whatsappTokenHint",
      },
      {
        key: "SIGNAL_PHONE_NUMBER",
        label: "constants.signalPhoneNumber",
        type: "text",
        hint: "constants.signalPhoneHint",
      },
      {
        key: "MATRIX_HOMESERVER",
        label: "constants.matrixHomeserver",
        type: "text",
        hint: "constants.matrixHomeHint",
      },
      {
        key: "MATRIX_USER_ID",
        label: "constants.matrixUserId",
        type: "text",
        hint: "constants.matrixUserHint",
      },
      {
        key: "MATRIX_ACCESS_TOKEN",
        label: "constants.matrixAccessToken",
        type: "password",
        hint: "constants.matrixTokenHint",
      },
      {
        key: "MATTERMOST_URL",
        label: "constants.mattermostUrl",
        type: "text",
        hint: "constants.mattermostUrlHint",
      },
      {
        key: "MATTERMOST_TOKEN",
        label: "constants.mattermostToken",
        type: "password",
        hint: "constants.mattermostTokenHint",
      },
      {
        key: "EMAIL_IMAP_SERVER",
        label: "constants.emailImapServer",
        type: "text",
        hint: "constants.emailImapHint",
      },
      {
        key: "EMAIL_SMTP_SERVER",
        label: "constants.emailSmtpServer",
        type: "text",
        hint: "constants.emailSmtpHint",
      },
      {
        key: "EMAIL_ADDRESS",
        label: "constants.emailAddress",
        type: "text",
        hint: "constants.emailAddrHint",
      },
      {
        key: "EMAIL_PASSWORD",
        label: "constants.emailPassword",
        type: "password",
        hint: "constants.emailPassHint",
      },
      {
        key: "SMS_PROVIDER",
        label: "constants.smsProvider",
        type: "text",
        hint: "constants.smsProviderHint",
      },
      {
        key: "TWILIO_ACCOUNT_SID",
        label: "constants.twilioAccountSid",
        type: "text",
        hint: "constants.twilioSidHint",
      },
      {
        key: "TWILIO_AUTH_TOKEN",
        label: "constants.twilioAuthToken",
        type: "password",
        hint: "constants.twilioTokenHint",
      },
      {
        key: "TWILIO_PHONE_NUMBER",
        label: "constants.twilioPhoneNumber",
        type: "text",
        hint: "constants.twilioPhoneHint",
      },
      {
        key: "BLUEBUBBLES_URL",
        label: "constants.bluebubblesUrl",
        type: "text",
        hint: "constants.bluebubblesUrlHint",
      },
      {
        key: "BLUEBUBBLES_PASSWORD",
        label: "constants.bluebubblesPassword",
        type: "password",
        hint: "constants.bluebubblesPassHint",
      },
      {
        key: "DINGTALK_APP_KEY",
        label: "constants.dingtalkAppKey",
        type: "password",
        hint: "constants.dingtalkKeyHint",
      },
      {
        key: "DINGTALK_APP_SECRET",
        label: "constants.dingtalkAppSecret",
        type: "password",
        hint: "constants.dingtalkSecretHint",
      },
      {
        key: "FEISHU_APP_ID",
        label: "constants.feishuAppId",
        type: "text",
        hint: "constants.feishuIdHint",
      },
      {
        key: "FEISHU_APP_SECRET",
        label: "constants.feishuAppSecret",
        type: "password",
        hint: "constants.feishuSecretHint",
      },
      {
        key: "WECOM_CORP_ID",
        label: "constants.wecomCorpId",
        type: "text",
        hint: "constants.wecomCorpHint",
      },
      {
        key: "WECOM_AGENT_ID",
        label: "constants.wecomAgentId",
        type: "text",
        hint: "constants.wecomAgentHint",
      },
      {
        key: "WECOM_SECRET",
        label: "constants.wecomSecret",
        type: "password",
        hint: "constants.wecomSecretHint",
      },
      {
        key: "WEIXIN_BOT_TOKEN",
        label: "constants.weixinBotToken",
        type: "password",
        hint: "constants.weixinTokenHint",
      },
      {
        key: "WEBHOOK_SECRET",
        label: "constants.webhookSecret",
        type: "password",
        hint: "constants.webhookHint",
      },
      {
        key: "HASS_URL",
        label: "constants.haUrl",
        type: "text",
        hint: "constants.haUrlHint",
      },
      {
        key: "HASS_TOKEN",
        label: "constants.haToken",
        type: "password",
        hint: "constants.haTokenHint",
      },
    ],
  },
];

export interface PlatformDef {
  key: string;
  label: string;
  description: string;
  fields: string[]; // env keys that belong to this platform
}

export const GATEWAY_PLATFORMS: PlatformDef[] = [
  {
    key: "telegram",
    label: "constants.platformTelegram",
    description: "constants.platformTelegramDesc",
    fields: ["TELEGRAM_BOT_TOKEN", "TELEGRAM_ALLOWED_USERS"],
  },
  {
    key: "discord",
    label: "constants.platformDiscord",
    description: "constants.platformDiscordDesc",
    fields: ["DISCORD_BOT_TOKEN", "DISCORD_ALLOWED_CHANNELS"],
  },
  {
    key: "slack",
    label: "constants.platformSlack",
    description: "constants.platformSlackDesc",
    fields: ["SLACK_BOT_TOKEN", "SLACK_APP_TOKEN"],
  },
  {
    key: "whatsapp",
    label: "constants.platformWhatsapp",
    description: "constants.platformWhatsappDesc",
    fields: ["WHATSAPP_API_URL", "WHATSAPP_API_TOKEN"],
  },
  {
    key: "signal",
    label: "constants.platformSignal",
    description: "constants.platformSignalDesc",
    fields: ["SIGNAL_PHONE_NUMBER"],
  },
  {
    key: "matrix",
    label: "constants.platformMatrix",
    description: "constants.platformMatrixDesc",
    fields: ["MATRIX_HOMESERVER", "MATRIX_USER_ID", "MATRIX_ACCESS_TOKEN"],
  },
  {
    key: "mattermost",
    label: "constants.platformMattermost",
    description: "constants.platformMattermostDesc",
    fields: ["MATTERMOST_URL", "MATTERMOST_TOKEN"],
  },
  {
    key: "email",
    label: "constants.platformEmail",
    description: "constants.platformEmailDesc",
    fields: [
      "EMAIL_IMAP_SERVER",
      "EMAIL_SMTP_SERVER",
      "EMAIL_ADDRESS",
      "EMAIL_PASSWORD",
    ],
  },
  {
    key: "sms",
    label: "constants.platformSms",
    description: "constants.platformSmsDesc",
    fields: [
      "SMS_PROVIDER",
      "TWILIO_ACCOUNT_SID",
      "TWILIO_AUTH_TOKEN",
      "TWILIO_PHONE_NUMBER",
    ],
  },
  {
    key: "bluebubbles",
    label: "constants.platformImessage",
    description: "constants.platformImessageDesc",
    fields: ["BLUEBUBBLES_URL", "BLUEBUBBLES_PASSWORD"],
  },
  {
    key: "dingtalk",
    label: "constants.platformDingtalk",
    description: "constants.platformDingtalkDesc",
    fields: ["DINGTALK_APP_KEY", "DINGTALK_APP_SECRET"],
  },
  {
    key: "feishu",
    label: "constants.platformFeishu",
    description: "constants.platformFeishuDesc",
    fields: ["FEISHU_APP_ID", "FEISHU_APP_SECRET"],
  },
  {
    key: "wecom",
    label: "constants.platformWecom",
    description: "constants.platformWecomDesc",
    fields: ["WECOM_CORP_ID", "WECOM_AGENT_ID", "WECOM_SECRET"],
  },
  {
    key: "weixin",
    label: "constants.platformWeixin",
    description: "constants.platformWeixinDesc",
    fields: ["WEIXIN_BOT_TOKEN"],
  },
  {
    key: "webhooks",
    label: "constants.platformWebhooks",
    description: "constants.platformWebhooksDesc",
    fields: ["WEBHOOK_SECRET"],
  },
  {
    key: "home_assistant",
    label: "constants.platformHomeAssistant",
    description: "constants.platformHomeAssistantDesc",
    fields: ["HASS_URL", "HASS_TOKEN"],
  },
];

// ── Install ─────────────────────────────────────────────

export const UNIX_INSTALL_CMD =
  "curl -fsSL https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.sh | bash";
export const INSTALL_CMD_UNIX = UNIX_INSTALL_CMD;
export const WINDOWS_INSTALL_CMD =
  "powershell -NoProfile -ExecutionPolicy Bypass -c \"$hermesHome = Join-Path $env:USERPROFILE '.hermes'; $installDir = Join-Path $hermesHome 'hermes-agent'; $installer = [ScriptBlock]::Create((irm https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.ps1 -UseBasicParsing)); & $installer -SkipSetup -HermesHome $hermesHome -InstallDir $installDir\"";
export const INSTALL_CMD =
  typeof window !== "undefined" &&
  window.electron?.process?.platform === "win32"
    ? WINDOWS_INSTALL_CMD
    : UNIX_INSTALL_CMD;

export const INSTALL_CMD_WIN = WINDOWS_INSTALL_CMD;

export function getInstallCmd(): string {
  return window.electron?.process?.platform === "win32"
    ? WINDOWS_INSTALL_CMD
    : UNIX_INSTALL_CMD;
}

// Helper to resolve i18n key or return as-is
export function tk(t: (key: string) => string, value: string): string {
  if (value.startsWith("constants.")) {
    return t(value);
  }
  return value;
}
