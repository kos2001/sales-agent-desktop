/**
 * Privacy defaults for the renderer.
 *
 * Kept in its own dependency-free module (same reasoning as
 * `lib/sessionLabel.ts`) so a regression test can assert the default
 * without importing `Chat.tsx` and its whole component tree.
 */

/**
 * Whether personal-info protection starts on for a fresh conversation.
 *
 * ON by default: a sales conversation carries customer data by default, so
 * de-identification is what the user opts *out* of, not something they must
 * remember to switch on for every new conversation. Two call sites have to
 * agree on this — the initial state and the new-chat reset — and a future
 * admin policy ("always on, user cannot disable") reads the same default.
 */
export const PROTECT_DEFAULT = true;
