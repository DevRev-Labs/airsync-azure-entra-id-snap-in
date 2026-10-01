/**
 * Audit Overlay Utilities for Incremental User Sync
 *
 * Microsoft Graph's `/users/{id}` read endpoint can briefly lag behind a
 * successful directory write. When an incremental sync hydrates a user with a
 * stale read, the real profile change is already present in the directory audit
 * log as `modifiedProperties[].newValue`, but the connector would persist the
 * old name or email and stamp it with the current `modified_date`. Both the
 * delta cursor and the next audit window then move past the event, so the edit
 * would be skipped permanently.
 *
 * This module provides two utilities that work together to close that gap:
 *
 * - `stripGraphQuote`: strips the one layer of surrounding double-quotes that
 *   Graph serialises into `oldValue`/`newValue` strings, and maps null/empty
 *   representations to `null`.
 *
 * - `overlayAuditedUserFields`: accepts a hydrated `EntraUser` and an overlay
 *   map built from `modifiedProperties`, and returns a patched copy where any
 *   field whose directory read is still stale is replaced with the audited
 *   `newValue`. Only the five fields that map onto DevRev's `devu`
 *   (DisplayName, GivenName, Surname, Mail, UserPrincipalName) are patched.
 */

import { EntraUser } from './types';

/**
 * Profile fields that can be updated by an "Update user" audit event and are
 * forwarded to the DevRev `devu` mapping.  The map key is the `displayName`
 * property of a `modifiedProperty` entry (as Graph returns it), and the value
 * is the corresponding `EntraUser` field name.
 */
const AUDIT_FIELD_MAP: ReadonlyMap<
  string,
  keyof Pick<EntraUser, 'displayName' | 'givenName' | 'surname' | 'mail' | 'userPrincipalName'>
> = new Map([
  ['DisplayName', 'displayName'],
  ['GivenName', 'givenName'],
  ['Surname', 'surname'],
  ['Mail', 'mail'],
  ['UserPrincipalName', 'userPrincipalName'],
]);

/** One audited field change: Graph old/new values after `stripGraphQuote`. */
export type AuditFieldChange = {
  newValue: string | null;
  oldValue: string | null;
};

/**
 * Per-user overlay keyed by EntraUser field name. Stores both old and new
 * audited values so `overlayAuditedUserFields` only patches when the hydrated
 * directory read still matches `oldValue` (true replication lag). Without the
 * oldValue guard, a lookback window can re-apply a stale audit over a newer
 * directory value and regress the profile.
 */
export type AuditOverlay = Partial<
  Record<
    keyof Pick<EntraUser, 'displayName' | 'givenName' | 'surname' | 'mail' | 'userPrincipalName'>,
    AuditFieldChange
  >
>;

/**
 * Strip Graph audit-value encoding from a `modifiedProperty` `oldValue` /
 * `newValue`.
 *
 * Microsoft Graph serialises directory audit property values in one of these
 * forms (all observed in production tenants):
 *
 * - Stringified JSON array: `'["Alice"]'` (most common for Update user)
 * - Parsed JSON array: `["Alice"]`
 * - Quote-wrapped string: `'"Alice"'`
 * - Literal `"null"` / `null` / `""` when the property was cleared
 *
 * Without unwrapping the array form, an audit overlay would write the literal
 * brackets into `displayName` (e.g. `["Dana chen IT"]`) and either corrupt a
 * caught-up directory read or fail to match the real profile value — so the
 * incremental update is dropped or mangled permanently once the delta cursor
 * advances.
 *
 * Rules (applied in order):
 * 1. `null` / `undefined` → `null`
 * 2. Array → unwrap first element (empty array → `null`) and recurse
 * 3. String that parses as a JSON array → unwrap first element and recurse
 * 4. String `"null"` or empty string → `null`
 * 5. Surrounded by `"…"` → remove the outer quotes; if the result is empty
 *    → `null`
 * 6. Otherwise → return as-is (no encoding to strip)
 *
 * @param val - Raw `oldValue` or `newValue` from a `modifiedProperty` entry.
 * @returns The unquoted string value, or `null` when the property is empty /
 *   null / blank.
 *
 * @example
 * stripGraphQuote('["Alice"]')      // → 'Alice'   (Graph Update user form)
 * stripGraphQuote('"Alice"')        // → 'Alice'
 * stripGraphQuote('"John Smith"')   // → 'John Smith'
 * stripGraphQuote('null')           // → null
 * stripGraphQuote('""')             // → null  (empty after stripping)
 * stripGraphQuote(null)             // → null
 * stripGraphQuote('')               // → null
 */
export function stripGraphQuote(val: unknown): string | null {
  if (val === null || val === undefined) return null;

  // Graph may return the value as a parsed array (SDK/JSON already decoded).
  if (Array.isArray(val)) {
    if (val.length === 0) return null;
    return stripGraphQuote(val[0]);
  }

  if (typeof val === 'string') {
    const trimmed = val.trim();

    // Most common Update-user encoding: a stringified single-element JSON array.
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      try {
        const parsed: unknown = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          return stripGraphQuote(parsed);
        }
      } catch {
        // Not valid JSON — fall through to quote stripping / raw return.
      }
    }

    if (trimmed === 'null' || trimmed === '') return null;

    if (trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2) {
      const inner = trimmed.slice(1, -1);
      return inner === '' ? null : inner;
    }

    return trimmed;
  }

  // Numbers / booleans are unexpected for profile fields but must not throw.
  return String(val);
}

/**
 * Build an `AuditOverlay` from the `modifiedProperties` of one or more
 * "Update user" audit events that target the same user.
 *
 * Call this once per user while iterating `targetResources[].modifiedProperties`
 * entries. Pass the accumulated `existing` overlay so that multiple audit
 * events for the same user merge their changes.
 *
 * @param modifiedProperties - The `modifiedProperties` array from a single
 *   audit `targetResources` entry.
 * @param existing - The overlay accumulated from previous audit events for
 *   this user (mutated in place and returned).
 * @param overwriteExisting - Whether values in this event replace fields that
 *   are already present. Set to `false` while processing newest-first results.
 * @returns The updated overlay.
 */
export function accumulateAuditOverlay(
  modifiedProperties: Array<Record<string, unknown>>,
  existing: AuditOverlay = {},
  overwriteExisting = true
): AuditOverlay {
  for (const prop of modifiedProperties) {
    const propName = typeof prop['displayName'] === 'string' ? prop['displayName'] : null;
    if (!propName || !Object.prototype.hasOwnProperty.call(prop, 'newValue')) continue;

    const userField = AUDIT_FIELD_MAP.get(propName);
    if (!userField || (!overwriteExisting && userField in existing)) continue;

    existing[userField] = {
      newValue: stripGraphQuote(prop['newValue']),
      oldValue: Object.prototype.hasOwnProperty.call(prop, 'oldValue')
        ? stripGraphQuote(prop['oldValue'])
        : null,
    };
  }
  return existing;
}

/**
 * Apply an `AuditOverlay` onto a hydrated `EntraUser`, replacing any field
 * whose directory read is still stuck on the audited `oldValue`.
 *
 * Only patch when `hydrated === oldValue` (true replication lag). If the
 * directory already shows `newValue`, or any newer third value, leave it
 * alone — lookback windows can otherwise regress a fresher profile with an
 * older audit's `newValue`.
 *
 * The function returns a shallow copy of `user` so that the original is not
 * mutated.  Logs a structured event for every patched field.
 *
 * @param user - The `EntraUser` returned by `GET /users/{id}`.
 * @param overlay - Audited old/new values derived from `modifiedProperties`.
 * @returns A patched copy of `user`, or the original if nothing was changed.
 */
export function overlayAuditedUserFields(user: EntraUser, overlay: AuditOverlay): EntraUser {
  const FIELDS = ['displayName', 'givenName', 'surname', 'mail', 'userPrincipalName'] as const;

  let overlaidCount = 0;
  const patched: EntraUser = { ...user };

  for (const field of FIELDS) {
    const change = overlay[field];
    if (!change) continue;

    const hydratedValue = user[field] as string | null | undefined;
    const hydratedNorm: string | null = hydratedValue === undefined ? null : hydratedValue;

    if (hydratedNorm === change.newValue) continue; // directory already up-to-date
    // Only treat as stale when the read still matches the audited pre-change value.
    // Unknown oldValue (null) is intentionally not overlaid onto a non-null read.
    if (hydratedNorm !== change.oldValue) continue;

    (patched as Record<string, unknown>)[field] = change.newValue;
    overlaidCount++;
  }

  if (overlaidCount > 0) {
    console.log(
      JSON.stringify({
        event: 'entra_user_audit_overlay_applied',
        user_id: user.id,
        fields_overlaid: overlaidCount,
      })
    );
  }

  return patched;
}
