import { getInitialState } from '../state';

describe('getInitialState', () => {
  it('starts every entity incomplete with zero progress and no prior cursors', () => {
    // Contract source: getInitialState's declaration says a fresh state has
    // incomplete entities, empty ID lists, and empty delta links.
    expect(getInitialState()).toEqual({
      users: { completed: false, extractedCount: 0, ids: [] },
      groups: { completed: false, extractedCount: 0, ids: [] },
      groupMembers: { completed: false, currentParentIndex: 0, extractedCount: 0 },
      directoryRoles: { completed: false, extractedCount: 0, ids: [] },
      roleMembers: { completed: false, currentParentIndex: 0, extractedCount: 0 },
      applications: { completed: false, extractedCount: 0 },
      servicePrincipals: { completed: false, extractedCount: 0, ids: [] },
      devices: { completed: false, extractedCount: 0 },
      orgContacts: { completed: false, extractedCount: 0 },
      appRoles: { completed: false, currentParentIndex: 0, extractedCount: 0 },
      appRoleAssignments: { completed: false, currentParentIndex: 0, extractedCount: 0 },
      authenticationMethods: { completed: false, currentParentIndex: 0, extractedCount: 0 },
      authenticationMethodsPolicy: { completed: false, extractedCount: 0 },
      licenseAssignments: { completed: false, currentParentIndex: 0, extractedCount: 0 },
      pimEligibleRoles: { completed: false, extractedCount: 0 },
      conditionalAccessPolicies: { completed: false, extractedCount: 0 },
      lifecycleWorkflows: { completed: false, extractedCount: 0 },
      directoryAuditLogs: { completed: false, extractedCount: 0 },
      signInLogs: { completed: false, extractedCount: 0 },
      deltaLinks: {},
    });
  });

  it('returns independent fresh progress objects on separate initializations', () => {
    const first = getInitialState();
    first.users.ids.push('user-1');
    first.deltaLinks.users = 'saved-delta-link';

    const second = getInitialState();

    expect(second.users.ids).toEqual([]);
    expect(second.deltaLinks).toEqual({});
    expect(second.users).not.toBe(first.users);
    expect(second.deltaLinks).not.toBe(first.deltaLinks);
  });
});
