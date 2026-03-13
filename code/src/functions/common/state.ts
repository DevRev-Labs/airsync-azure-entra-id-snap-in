export interface EntityState {
  completed: boolean;
  nextLink?: string;
  extractedCount: number;
  skipped?: boolean;
}

export interface EntityStateWithIds extends EntityState {
  ids: string[];
}

export interface NestedEntityState {
  completed: boolean;
  currentParentIndex: number;
  currentParentNextLink?: string;
  extractedCount: number;
  skipped?: boolean;
}

export interface State {
  users: EntityStateWithIds;
  groups: EntityStateWithIds;
  groupMembers: NestedEntityState;
  directoryRoles: EntityStateWithIds;
  roleMembers: NestedEntityState;
  applications: EntityState;
  servicePrincipals: EntityStateWithIds;
  devices: EntityState;
  orgContacts: EntityState;

  // NEW ENTITIES
  appRoles: NestedEntityState;
  appRoleAssignments: NestedEntityState;
  authenticationMethods: NestedEntityState;
  authenticationMethodsPolicy: EntityState;
  licenseAssignments: NestedEntityState;
  pimEligibleRoles: EntityState;
  conditionalAccessPolicies: EntityState;
  lifecycleWorkflows: EntityState;
  directoryAuditLogs: EntityState;
  signInLogs: EntityState;

  // Delta links stored after each successful full sync, used for incremental sync
  deltaLinks: {
    users?: string;
    groups?: string;
    directoryRoles?: string;
    applications?: string;
    servicePrincipals?: string;
    devices?: string;
    orgContacts?: string;
  };

  // Incremental sync timestamps
  lastSyncStarted?: string;
  lastSuccessfulSyncStarted?: string;
  lastAuditLogSync?: string;
  lastSignInLogSync?: string;
}

export function getInitialState(): State {
  return {
    users: { completed: false, extractedCount: 0, ids: [] },
    groups: { completed: false, extractedCount: 0, ids: [] },
    groupMembers: { completed: false, currentParentIndex: 0, extractedCount: 0 },
    directoryRoles: { completed: false, extractedCount: 0, ids: [] },
    roleMembers: { completed: false, currentParentIndex: 0, extractedCount: 0 },
    applications: { completed: false, extractedCount: 0 },
    servicePrincipals: { completed: false, extractedCount: 0, ids: [] },
    devices: { completed: false, extractedCount: 0 },
    orgContacts: { completed: false, extractedCount: 0 },
    // NEW ENTITIES
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
  };
}
