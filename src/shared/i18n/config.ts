import type { AppLocale } from "./types";

export const SOURCE_LOCALE: AppLocale = "en";
export const FALLBACK_LOCALE: AppLocale = "en";

/**
 * Korean by default: the team is Korean, every seeded playbook and the whole
 * task catalogue are Korean, and an English first screen makes the app look
 * like it is not for them.
 */
export const DEFAULT_ACTIVE_LOCALE: AppLocale = "ko";

/**
 * Offered in the language picker — Korean and English only.
 *
 * The other seven upstream locales still exist in `resources` (and `t()`
 * reads them directly, so nothing breaks), but they were translated for the
 * general-purpose agent this app was forked from. None of the sales rebrand
 * reached them, so picking Spanish today yields Spanish chrome wrapped around
 * English sales copy — worse than not offering it. Narrowed rather than
 * deleted so re-adding a locale is a translation job, not a code change.
 */
export const APP_LOCALES: AppLocale[] = ["ko", "en"];
