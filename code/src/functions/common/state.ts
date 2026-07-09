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

// Devices are enriched with per-device Graph calls (owner + details), so we
// need a resume cursor inside the current page in addition to the outer
// nextLink. currentDeviceIndex tracks how many devices in the current page
// have already been enriched, so a timeout mid-page doesn't restart the
// enrichment from device 0 on the next invocation.
export interface DevicesState extends EntityState {
  currentDeviceIndex?: number;
}

export interface State {
  users: EntityStateWithIds;
  groups: EntityStateWithIds;
  groupMembers: NestedEntityState;
  directoryRoles: EntityStateWithIds;
  roleMembers: NestedEntityState;
  applications: EntityState;
  servicePrincipals: EntityStateWithIds;
  devices: DevicesState;
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

  // Connector-owned time-window cursors for endpoints that don't support
  // delta queries (audit logs, sign-in logs). lastSyncStarted and
  // lastSuccessfulSyncStarted are SDK-managed (see @devrev/ts-adaas SdkState)
  // and must not be redeclared or written to here.
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
