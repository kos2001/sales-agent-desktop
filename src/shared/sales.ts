/**
 * Shapes shared across the process boundary for the sales harness.
 * Kept here — alongside `attachments.ts` — because main, preload and the
 * renderer all need the same definition and none of them may import from
 * another process's tree.
 */

/**
 * One entry in the curated connector catalogue.
 *
 * Every field is descriptive. Nothing in this type can turn a connector on:
 * `enabledByDefault` is normalised to false when the catalogue is read, and
 * a connector only starts once the user configures it themselves.
 */
export interface SalesConnector {
  id: string;
  label: string;
  vendor: string;
  /** "first-party" — the vendor that owns the data also publishes the server. */
  trust: string;
  hosting: string;
  transport: string;
  /** null when the endpoint is tenant-specific and must come from the user's console. */
  url: string | null;
  urlSource?: string;
  auth: string;
  dataAccess: string;
  whySafe?: string;
  requires?: string;
  docs: string;
  salesUse: string[];
  caution?: string;
  enabledByDefault: boolean;
}
