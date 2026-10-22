import { AxiosError } from 'axios';

import { getRetryAfterSeconds } from '../utils';

function rateLimitError(retryAfter?: string | string[]): Partial<AxiosError> {
  return {
    isAxiosError: true,
    response: {
      status: 429,
      statusText: 'Too Many Requests',
      data: {},
      headers: retryAfter === undefined ? {} : { 'retry-after': retryAfter },
      config: {} as any,
    },
    message: 'Rate limited',
    name: 'AxiosError',
    config: {} as any,
    toJSON: () => ({}),
  };
}

describe('getRetryAfterSeconds RFC delay-seconds syntax', () => {
  const invalidHeaderCases: Array<[string, string | string[]]> = [
    ['empty wire value', ''],
    ['malformed HTTP-date', 'Tue, 32 Jun 2026 26:61:00 GMT'],
    ['non-numeric value', 'later'],
    ['negative delay-seconds', '-10'],
    ['empty value list', []],
  ];

  it.each(['10seconds', '1.5', '+10'])(
    'uses the default for malformed delay-seconds %j',
    (retryAfter) => {
      // RFC 9110 §10.2.3 defines delay-seconds as 1*DIGIT. The helper's contract
      // says missing or invalid values use the caller-supplied default.
      expect(getRetryAfterSeconds(rateLimitError(retryAfter), 64)).toBe(64);
    }
  );

  it.each(invalidHeaderCases)('uses the default for %s', (_label, retryAfter) => {
    // Empty lists are a defensive Axios-header input; RFC 9110 defines only a
    // delay-seconds value or HTTP-date for Retry-After.
    expect(getRetryAfterSeconds(rateLimitError(retryAfter), 64)).toBe(64);
  });

  it('returns a valid integer delay-seconds value unchanged', () => {
    expect(getRetryAfterSeconds(rateLimitError('120'), 64)).toBe(120);
  });

  it('uses the supplied default when Retry-After is absent', () => {
    expect(getRetryAfterSeconds(rateLimitError(), 64)).toBe(64);
  });
});
