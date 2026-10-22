// Explicit-input connector functions only. Keep mocked API/worker suites out.
const base = require('./jest.config');

module.exports = {
  ...base,
  testMatch: [
    '**/common/__tests__/utils.test.ts',
    '**/common/__tests__/security.test.ts',
    '**/external-system/__tests__/data-normalization.test.ts',
    '**/external-system/__tests__/audit-overlay.test.ts',
    '**/__tests__/*-unit.test.ts',
  ],
  // Exclude the existing wall-clock delay tests and static EDM/IDM check.
  // This does not suppress failing assertions in the direct-function suite.
  testNamePattern: '^(?!wait |.*EDM and IDM define)',
};
