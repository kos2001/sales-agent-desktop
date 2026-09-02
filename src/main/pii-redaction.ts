/**
 * Local PII / secret redaction (approach B).
 *
 * Runs entirely in the desktop main process — no LLM, no network, and no
 * change to the Hermes CLI. The desktop send path (hermes.ts `sendMessage`)
 * calls `redactPii` on the outgoing message (and history) BEFORE anything
 * is dispatched to the Hermes gateway / cloud model, so sensitive spans
 * never leave the machine. Non-sensitive text passes through untouched.
 *
 * Detectors are deliberately HIGH-PRECISION (specific shapes, Luhn-checked
 * cards) to minimize false positives — masking normal prose would degrade
 * everyday use. The trade-off is recall: this catches well-formed secrets,
 * not free-form sensitive prose. It is a transport guard, not a classifier.
 *
 * Irreversible by design: matches are replaced with a typed placeholder
 * (`[EMAIL]`, `[CARD]`, …). The cloud model reasons about structure without
 * ever seeing the value. (A reversible token→restore variant — the
 * "PII gateway" pattern — is a possible future extension.)
 */

export interface RedactionResult {
  /** The text with sensitive spans replaced by typed placeholders. */
  text: string;
  /** How many matches of each type were masked, e.g. { EMAIL: 2, CARD: 1 }. */
  counts: Record<string, number>;
  /** Total number of masked spans. 0 means the text was untouched. */
  total: number;
}

/** Luhn checksum — used to confirm a digit run is a plausible card number
 *  before masking, which removes almost all false positives from ordinary
 *  long numbers (order ids, timestamps, …). */
function passesLuhn(digits: string): boolean {
  let sum = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (d < 0 || d > 9) return false;
    if (alt) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    alt = !alt;
  }
  return sum % 10 === 0;
}

// Detectors run in this order; earlier (more specific) ones win, and their
// placeholders contain no digits/@ so later detectors can't re-match them.
interface Detector {
  type: string;
  re: RegExp;
  /** Optional extra guard — return false to skip a candidate match. */
  accept?: (match: string) => boolean;
}

const DETECTORS: Detector[] = [
  // Provider/API secrets & tokens (OpenAI, AWS, GitHub, Slack, Google, JWT).
  {
    type: "SECRET",
    re: /\b(?:sk-[A-Za-z0-9_-]{16,}|AKIA[0-9A-Z]{16}|gh[posu]_[A-Za-z0-9]{20,}|xox[baprs]-[A-Za-z0-9-]{10,}|AIza[0-9A-Za-z_-]{20,}|eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,})\b/g,
  },
  // Email addresses.
  {
    type: "EMAIL",
    re: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
  },
  // Korean resident registration number (주민등록번호): 6 digits - 7 digits.
  {
    type: "RRN",
    re: /\b\d{6}-\d{7}\b/g,
  },
  // Credit-card-like runs (13–19 digits, optional space/dash groups),
  // confirmed by Luhn so ordinary long numbers aren't masked.
  {
    type: "CARD",
    re: /\b(?:\d[ -]?){13,19}\b/g,
    accept: (m) => {
      const digits = m.replace(/\D/g, "");
      return digits.length >= 13 && digits.length <= 19 && passesLuhn(digits);
    },
  },
  // Korean mobile numbers (010-1234-5678 and variants).
  {
    type: "PHONE",
    re: /\b01[016789]-?\d{3,4}-?\d{4}\b/g,
  },
  // IPv4 addresses with valid octets (0–255).
  {
    type: "IP",
    re: /\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b/g,
  },
];

/**
 * Replace well-formed secrets / PII in `text` with typed placeholders.
 * Returns the redacted text plus per-type counts. Pure and synchronous.
 */
export function redactPii(text: string): RedactionResult {
  const counts: Record<string, number> = {};
  let out = String(text ?? "");

  for (const det of DETECTORS) {
    out = out.replace(det.re, (match) => {
      if (det.accept && !det.accept(match)) return match;
      counts[det.type] = (counts[det.type] || 0) + 1;
      return `[${det.type}]`;
    });
  }

  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  return { text: out, counts, total };
}
