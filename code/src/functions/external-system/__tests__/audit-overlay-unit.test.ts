import { stripGraphQuote, accumulateAuditOverlay, overlayAuditedUserFields } from '../audit-overlay';
import { EntraUser } from '../types';

const user: EntraUser = {
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

describe('audit overlay documented edge behavior', () => {
  it('unwraps only the first value from an array-encoded audit property', () => {
    // Contract source: stripGraphQuote rules 2–3 explicitly unwrap the first
    // element from parsed arrays and stringified JSON arrays.
    expect(stripGraphQuote(['Alice', 'ignored'])).toBe('Alice');
    expect(stripGraphQuote('["Alice", "ignored"]')).toBe('Alice');
  });

  it('updates and returns the supplied overlay object when accumulating changes', () => {
    // Contract source: accumulateAuditOverlay documents that it mutates and
    // returns the existing overlay so successive audit events can be merged.
    const existing = { surname: { oldValue: 'Smith', newValue: 'Jones' } };
    const result = accumulateAuditOverlay(
      [{ displayName: 'DisplayName', oldValue: 'Alice Smith', newValue: 'Alice Jones' }],
      existing
    );

    expect(result).toBe(existing);
    expect(existing).toEqual({
      surname: { oldValue: 'Smith', newValue: 'Jones' },
      displayName: { oldValue: 'Alice Smith', newValue: 'Alice Jones' },
    });
  });

  it('preserves a fresher user when the audit oldValue does not match', () => {
    // Contract source: the oldValue guard prevents a lookback audit from
    // overwriting a directory value that has already advanced.
    const result = overlayAuditedUserFields(user, {
      displayName: { oldValue: 'Previous Name', newValue: 'Audited Name' },
    });

    expect(result).toEqual(user);
    expect(user.displayName).toBe('Alice Smith');
  });
});
