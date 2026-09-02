// Threshold for collapsing a long user message into a preview. Either
// crossing the line count OR the character count triggers the collapse
// — a 6-line block with very long lines is just as transcript-hogging as
// a 30-line block of short ones.
export const PREVIEW_LINES = 6;
export const COLLAPSE_LINE_THRESHOLD = PREVIEW_LINES;
export const COLLAPSE_CHAR_THRESHOLD = 400;

export interface UserMessageMeta {
  lines: number;
  chars: number;
}

export function shouldCollapse(content: string): boolean {
  if (!content) return false;
  const { lines, chars } = getMeta(content);
  return lines > COLLAPSE_LINE_THRESHOLD || chars > COLLAPSE_CHAR_THRESHOLD;
}

export function getMeta(content: string): UserMessageMeta {
  if (!content) return { lines: 0, chars: 0 };
  // Count actual newline-delimited lines, including the final partial line.
  // Using split('\n') keeps the count predictable for content with or
  // without a trailing newline. chars is the raw length — what the user
  // typed, byte-counts and emoji weirdness ignored.
  return {
    lines: content.split("\n").length,
    chars: content.length,
  };
}

// First `PREVIEW_LINES` lines, joined. Does not append an ellipsis — the
// UI shows a dedicated "Show more" affordance below the preview, which
// is clearer than an inline "...".
export function getPreview(content: string, lines = PREVIEW_LINES): string {
  if (!content) return "";
  return content.split("\n").slice(0, lines).join("\n");
}
