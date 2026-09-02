import type { SlashCommand } from "./slashCommands";

/**
 * Decide whether a slash command matches the user's filter text. Three rules,
 * in order of preference:
 *
 *   1. Empty filter → match everything (initial menu open).
 *   2. Filter starts with `/` → match the command name as a prefix (preserves
 *      the legacy fast-path for typing `/cl` to find `/clear`).
 *   3. Anything else → case-insensitive substring match against the command
 *      name *or* its description, so `cost` finds `/usage` and `memory`
 *      finds whichever command's description mentions it.
 *
 * Kept pure so it can be unit-tested without React.
 */
export function matchesSlashFilter(
  cmd: SlashCommand,
  filter: string,
): boolean {
  const q = filter.trim().toLowerCase();
  if (!q) return true;

  const name = cmd.name.toLowerCase();
  const desc = cmd.description.toLowerCase();

  // When the user types `/something`, prefer prefix-on-name. This keeps
  // the keystroke-fast experience for users who already know the
  // command they want.
  if (q.startsWith("/")) return name.startsWith(q);

  return name.includes(q) || desc.includes(q);
}

/** Filter + preserve relative ordering. */
export function filterSlashCommands(
  cmds: readonly SlashCommand[],
  filter: string,
): SlashCommand[] {
  return cmds.filter((c) => matchesSlashFilter(c, filter));
}
