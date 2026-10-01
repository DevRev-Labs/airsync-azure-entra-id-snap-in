/**
 * Unit tests for audit-overlay.ts
 *
 * Covers:
 * - `stripGraphQuote`: one-layer double-quote removal and null/empty handling
 * - `accumulateAuditOverlay`: collects modifiedProperties into an AuditOverlay
 * - `overlayAuditedUserFields`: patches a stale EntraUser with audited values
 */

import { stripGraphQuote, accumulateAuditOverlay, overlayAuditedUserFields } from '../audit-overlay';
import { EntraUser } from '../types';

// ══════════════════════════════════════════════════════════════════════════════
// stripGraphQuote
// ══════════════════════════════════════════════════════════════════════════════

describe('stripGraphQuote', () => {
  it('strips one surrounding double-quote layer', () => {
    expect(stripGraphQuote('"Alice"')).toBe('Alice');
    expect(stripGraphQuote('"John Smith"')).toBe('John Smith');
    expect(stripGraphQuote('"alice@contoso.com"')).toBe('alice@contoso.com');
  });

  it('unwraps Graph stringified JSON-array audit values', () => {
    expect(stripGraphQuote('["Alice"]')).toBe('Alice');
    expect(stripGraphQuote('["Dana chen IT"]')).toBe('Dana chen IT');
    expect(stripGraphQuote('["alice@contoso.com"]')).toBe('alice@contoso.com');
  });

  it('unwraps already-parsed JSON-array audit values', () => {
    expect(stripGraphQuote(['Alice'])).toBe('Alice');
    expect(stripGraphQuote(['Dana chen IT'])).toBe('Dana chen IT');
  });

  it('returns null for an empty JSON array', () => {
    expect(stripGraphQuote('[]')).toBeNull();
    expect(stripGraphQuote([])).toBeNull();
  });

  it('returns null for the literal string "null"', () => {
    expect(stripGraphQuote('null')).toBeNull();
  });

  it('returns null for null input', () => {
    expect(stripGraphQuote(null)).toBeNull();
  });

  it('returns null for undefined input', () => {
    expect(stripGraphQuote(undefined)).toBeNull();
  });

  it('returns null for an empty string', () => {
    expect(stripGraphQuote('')).toBeNull();
  });

  it('returns null for quoted empty string', () => {
    expect(stripGraphQuote('""')).toBeNull();
  });

  it('returns the string as-is when it has no surrounding quotes', () => {
    expect(stripGraphQuote('Bob')).toBe('Bob');
  });

  it('does not strip interior quotes', () => {
    expect(stripGraphQuote('"O\'Brien"')).toBe("O'Brien");
    expect(stripGraphQuote('"a\\"b"')).toBe('a\\"b');
  });

  it('coerces non-string values to string before stripping', () => {
    expect(stripGraphQuote(42)).toBe('42');
    expect(stripGraphQuote(true)).toBe('true');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// accumulateAuditOverlay
// ══════════════════════════════════════════════════════════════════════════════

describe('accumulateAuditOverlay', () => {
  it('extracts DisplayName, GivenName, Surname, Mail, UserPrincipalName', () => {
    const props = [
      { displayName: 'DisplayName', oldValue: '"Alice"', newValue: '"Bob"' },
      { displayName: 'GivenName', oldValue: '"Alice"', newValue: '"Robert"' },
      { displayName: 'Surname', oldValue: '"Smith"', newValue: '"Jones"' },
      { displayName: 'Mail', oldValue: '"alice@c.com"', newValue: '"bob@c.com"' },
      { displayName: 'UserPrincipalName', oldValue: '"alice@c.com"', newValue: '"bob@c.com"' },
    ];

    const overlay = accumulateAuditOverlay(props);

    expect(overlay.displayName).toEqual({ oldValue: 'Alice', newValue: 'Bob' });
    expect(overlay.givenName).toEqual({ oldValue: 'Alice', newValue: 'Robert' });
    expect(overlay.surname).toEqual({ oldValue: 'Smith', newValue: 'Jones' });
    expect(overlay.mail).toEqual({ oldValue: 'alice@c.com', newValue: 'bob@c.com' });
    expect(overlay.userPrincipalName).toEqual({ oldValue: 'alice@c.com', newValue: 'bob@c.com' });
  });

  it('unwraps live Graph stringified-array newValue encoding', () => {
    const props = [
      { displayName: 'DisplayName', oldValue: '["Dana chen"]', newValue: '["Dana chen IT"]' },
      { displayName: 'Surname', oldValue: '["Golla"]', newValue: '["Yadav"]' },
    ];

    const overlay = accumulateAuditOverlay(props);

    expect(overlay.displayName).toEqual({ oldValue: 'Dana chen', newValue: 'Dana chen IT' });
    expect(overlay.surname).toEqual({ oldValue: 'Golla', newValue: 'Yadav' });
  });

  it('ignores properties not in the mapped set', () => {
    const props = [
      { displayName: 'JobTitle', oldValue: '"Engineer"', newValue: '"Manager"' },
      { displayName: 'DisplayName', oldValue: '"Alice"', newValue: '"Bob"' },
    ];

    const overlay = accumulateAuditOverlay(props);

    expect(overlay.displayName?.newValue).toBe('Bob');
    expect((overlay as Record<string, unknown>)['jobTitle']).toBeUndefined();
  });

  it('sets a field to null when newValue is "null"', () => {
    const props = [{ displayName: 'Mail', oldValue: '"alice@c.com"', newValue: 'null' }];
    expect(accumulateAuditOverlay(props).mail).toEqual({
      oldValue: 'alice@c.com',
      newValue: null,
    });
  });

  it('sets a field to null when newValue is null', () => {
    const props = [{ displayName: 'GivenName', oldValue: '"Alice"', newValue: null }];
    expect(accumulateAuditOverlay(props).givenName).toEqual({
      oldValue: 'Alice',
      newValue: null,
    });
  });

  it('merges multiple events: later call wins per field by default', () => {
    const first = accumulateAuditOverlay([
      { displayName: 'DisplayName', oldValue: '"Alice"', newValue: '"Bob"' },
    ]);
    const merged = accumulateAuditOverlay(
      [{ displayName: 'DisplayName', oldValue: '"Bob"', newValue: '"Charlie"' }],
      first
    );

    expect(merged.displayName?.newValue).toBe('Charlie');
  });

  it('keeps the newest value when Graph audit events are processed newest-first', () => {
    const newest = accumulateAuditOverlay([
      { displayName: 'DisplayName', oldValue: '"Bob"', newValue: '"Charlie"' },
    ]);
    const merged = accumulateAuditOverlay(
      [{ displayName: 'DisplayName', oldValue: '"Alice"', newValue: '"Bob"' }],
      newest,
      false
    );

    expect(merged.displayName?.newValue).toBe('Charlie');
  });

  it('ignores a mapped property when newValue is absent', () => {
    expect(accumulateAuditOverlay([{ displayName: 'DisplayName', oldValue: '"Alice"' }])).toEqual(
      {}
    );
  });

  it('handles an empty modifiedProperties array without throwing', () => {
    expect(() => accumulateAuditOverlay([])).not.toThrow();
    expect(accumulateAuditOverlay([])).toEqual({});
  });

  it('skips entries without a string displayName', () => {
    const props = [
      { displayName: null, oldValue: '"x"', newValue: '"y"' },
      { displayName: 42, oldValue: '"x"', newValue: '"y"' },
    ] as unknown as Array<Record<string, unknown>>;

    expect(Object.keys(accumulateAuditOverlay(props))).toHaveLength(0);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// overlayAuditedUserFields
// ══════════════════════════════════════════════════════════════════════════════

const baseUser: EntraUser = {
  id: 'user-001',
  displayName: 'Alice Smith',
  givenName: 'Alice',
  surname: 'Smith',
  mail: 'alice@contoso.com',
  userPrincipalName: 'alice@contoso.onmicrosoft.com',
  jobTitle: 'Engineer',
  department: 'Engineering',
  officeLocation: 'Building 1',
  mobilePhone: null,
  businessPhones: [],
  accountEnabled: true,
  userType: 'Member',
  createdDateTime: '2024-01-01T00:00:00Z',
};

describe('overlayAuditedUserFields', () => {
  it('patches a stale displayName when hydrated still equals oldValue', () => {
    const overlay = {
      displayName: { oldValue: 'Alice Smith', newValue: 'Alice Jones' },
    };
    const patched = overlayAuditedUserFields(baseUser, overlay);

    expect(patched.displayName).toBe('Alice Jones');
    expect(baseUser.displayName).toBe('Alice Smith');
  });

  it('patches multiple stale fields in one call', () => {
    const overlay = {
      displayName: { oldValue: 'Alice Smith', newValue: 'Alice Jones' },
      surname: { oldValue: 'Smith', newValue: 'Jones' },
      mail: { oldValue: 'alice@contoso.com', newValue: 'alice.jones@contoso.com' },
    };
    const patched = overlayAuditedUserFields(baseUser, overlay);

    expect(patched.displayName).toBe('Alice Jones');
    expect(patched.surname).toBe('Jones');
    expect(patched.mail).toBe('alice.jones@contoso.com');
    expect(patched.givenName).toBe('Alice');
  });

  it('does NOT patch when the hydrated value already matches newValue', () => {
    const overlay = {
      displayName: { oldValue: 'Alice Smith', newValue: 'Alice Smith' },
    };
    const patched = overlayAuditedUserFields(baseUser, overlay);

    expect(patched.displayName).toBe('Alice Smith');
  });

  it('does NOT patch when hydrated has a newer value than the audit', () => {
    // Lookback can surface an older audit after the directory moved on again.
    const overlay = {
      displayName: { oldValue: 'Alice Smith', newValue: 'Alice Jones' },
    };
    const newerUser: EntraUser = { ...baseUser, displayName: 'Alice Jones Yadav' };
    const patched = overlayAuditedUserFields(newerUser, overlay);

    expect(patched.displayName).toBe('Alice Jones Yadav');
  });

  it('patches to null when the audit cleared a field and hydrated still has oldValue', () => {
    const overlay = { mail: { oldValue: 'alice@contoso.com', newValue: null } };
    const patched = overlayAuditedUserFields(baseUser, overlay);

    expect(patched.mail).toBeNull();
  });

  it('does not touch fields absent from the overlay', () => {
    const overlay = { givenName: { oldValue: 'Alice', newValue: 'Alicia' } };
    const patched = overlayAuditedUserFields(baseUser, overlay);

    expect(patched.givenName).toBe('Alicia');
    expect(patched.displayName).toBe('Alice Smith');
  });

  it('returns the original object when overlay is empty', () => {
    expect(overlayAuditedUserFields(baseUser, {}).displayName).toBe('Alice Smith');
  });

  it('treats undefined hydrated value the same as null for oldValue match', () => {
    const sparseUser: EntraUser = { ...baseUser, surname: undefined as unknown as null };
    const overlay = { surname: { oldValue: null, newValue: 'Brown' } };
    const patched = overlayAuditedUserFields(sparseUser, overlay);

    expect(patched.surname).toBe('Brown');
  });

  it('does not mutate the original user object', () => {
    const original = { ...baseUser };
    overlayAuditedUserFields(baseUser, {
      displayName: { oldValue: 'Alice Smith', newValue: 'Changed' },
    });

    expect(baseUser.displayName).toBe(original.displayName);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// End-to-end: audit modifiedProperties → overlay → normalizeUser result
// ══════════════════════════════════════════════════════════════════════════════

describe('audit overlay end-to-end: stale GET /users/{id} patched before normalizeUser', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { normalizeUser } = require('../data-normalization');

  it('a stale displayName from GET /users/{id} is replaced with the audited newValue', () => {
    const auditProps = [
      { displayName: 'DisplayName', oldValue: '"Alice Smith"', newValue: '"Bob Jones"' },
    ];
    const overlay = accumulateAuditOverlay(auditProps);
    const staleUser: EntraUser = { ...baseUser, displayName: 'Alice Smith' };
    const syncTimestamp = '2026-09-30T12:00:00.000Z';
    const patched = overlayAuditedUserFields(staleUser, overlay);
    const normalized = normalizeUser(patched, syncTimestamp);

    expect(normalized.data.display_name).toBe('Bob Jones');
    expect(normalized.modified_date).toBe(syncTimestamp);
  });

  it('a stale surname is replaced so full_name is composed from the correct parts', () => {
    const auditProps = [{ displayName: 'Surname', oldValue: '"Smith"', newValue: '"Jones"' }];
    const overlay = accumulateAuditOverlay(auditProps);
    const staleUser: EntraUser = { ...baseUser, surname: 'Smith' };
    const patched = overlayAuditedUserFields(staleUser, overlay);
    const normalized = normalizeUser(patched, '2026-09-30T12:00:00.000Z');

    expect(normalized.data.full_name).toBe('Alice Jones');
  });

  it('a stale mail is replaced so email uses the correct address', () => {
    const auditProps = [
      { displayName: 'Mail', oldValue: '"alice@old.com"', newValue: '"alice@new.com"' },
    ];
    const overlay = accumulateAuditOverlay(auditProps);
    const staleUser: EntraUser = { ...baseUser, mail: 'alice@old.com' };
    const patched = overlayAuditedUserFields(staleUser, overlay);
    const normalized = normalizeUser(patched, '2026-09-30T12:00:00.000Z');

    expect(normalized.data.email).toBe('alice@new.com');
  });

  it('when directory has already caught up no overlay is applied', () => {
    const auditProps = [
      { displayName: 'DisplayName', oldValue: '"Alice Smith"', newValue: '"Bob Jones"' },
    ];
    const overlay = accumulateAuditOverlay(auditProps);
    const currentUser: EntraUser = { ...baseUser, displayName: 'Bob Jones' };
    const patched = overlayAuditedUserFields(currentUser, overlay);

    expect(patched.displayName).toBe('Bob Jones');
  });

  it('live Graph array-encoded audit values patch a stale GET without corrupting caught-up reads', () => {
    const auditProps = [
      { displayName: 'DisplayName', oldValue: '["Dana chen"]', newValue: '["Dana chen IT"]' },
      { displayName: 'Surname', oldValue: '["Golla"]', newValue: '["Yadav"]' },
    ];
    const overlay = accumulateAuditOverlay(auditProps);

    const staleUser: EntraUser = {
      ...baseUser,
      displayName: 'Dana chen',
      givenName: 'Hareesh',
      surname: 'Golla',
    };
    const stalePatched = overlayAuditedUserFields(staleUser, overlay);
    const staleNormalized = normalizeUser(stalePatched, '2026-09-30T13:32:28.000Z');
    expect(staleNormalized.data.display_name).toBe('Dana chen IT');
    expect(staleNormalized.data.full_name).toBe('Hareesh Yadav');

    const caughtUp: EntraUser = {
      ...baseUser,
      displayName: 'Dana chen IT',
      givenName: 'Hareesh',
      surname: 'Yadav',
    };
    const caughtUpPatched = overlayAuditedUserFields(caughtUp, overlay);
    expect(caughtUpPatched.displayName).toBe('Dana chen IT');
    expect(caughtUpPatched.surname).toBe('Yadav');
  });
});
