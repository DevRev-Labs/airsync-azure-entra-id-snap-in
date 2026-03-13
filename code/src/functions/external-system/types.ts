export interface GraphPagedResponse<T> {
  '@odata.context'?: string;
  '@odata.nextLink'?: string;
  '@odata.deltaLink'?: string;
  value: T[];
}

export interface EntraUser {
  id: string;
  displayName: string | null;
  mail: string | null;
  userPrincipalName: string | null;
  givenName: string | null;
  surname: string | null;
  jobTitle: string | null;
  department: string | null;
  officeLocation: string | null;
  mobilePhone: string | null;
  businessPhones: string[];
  accountEnabled: boolean | null;
  userType: string | null;
  createdDateTime: string | null;
  '@removed'?: { reason: string };
  // Extension attributes (dynamic — populated at runtime)
  [key: string]: unknown;
}

export interface EntraGroup {
  id: string;
  displayName: string | null;
  description: string | null;
  mail: string | null;
  groupTypes: string[];
  securityEnabled: boolean | null;
  mailEnabled: boolean | null;
  createdDateTime: string | null;
  '@removed'?: { reason: string };
}

export interface EntraDirectoryRoleMember {
  id: string;
  '@odata.type'?: string;
  displayName?: string | null;
}

export interface EntraDirectoryRole {
  id: string;
  displayName: string | null;
  description: string | null;
  roleTemplateId: string | null;
  '@removed'?: { reason: string };
}

export interface EntraApplication {
  id: string;
  appId: string;
  displayName: string | null;
  signInAudience: string | null;
  createdDateTime: string | null;
  publisherDomain: string | null;
  identifierUris: string[];
  '@removed'?: { reason: string };
}

export interface EntraServicePrincipal {
  id: string;
  appId: string;
  displayName: string | null;
  servicePrincipalType: string | null;
  accountEnabled: boolean | null;
  appOwnerOrganizationId: string | null;
  createdDateTime?: string | null;
  '@removed'?: { reason: string };
}

export interface EntraDevice {
  id: string;
  displayName: string | null;
  operatingSystem: string | null;
  operatingSystemVersion: string | null;
  trustType: string | null;
  isCompliant: boolean | null;
  isManaged: boolean | null;
  registrationDateTime: string | null;
  approximateLastSignInDateTime: string | null;
  deviceId: string | null;
  '@removed'?: { reason: string };
  // NEW: Additional device details (populated via API call)
  manufacturer?: string | null;
  model?: string | null;
  profileType?: string | null;
  // NEW: Owner information (populated via API call)
  registeredOwnerId?: string | null;
  registeredOwnerEmail?: string | null;
  registeredOwnerDisplayName?: string | null;
}

export interface EntraOrgContact {
  id: string;
  displayName: string | null;
  mail: string | null;
  givenName: string | null;
  surname: string | null;
  jobTitle: string | null;
  department: string | null;
  companyName: string | null;
  createdDateTime?: string | null;
  '@removed'?: { reason: string };
}

export interface EntraOrganization {
  id: string;
  displayName: string | null;
}

export interface EntraExtensionProperty {
  id: string;
  name: string;
  dataType: string;
  targetObjects: string[];
  appDisplayName?: string | null;
}

// NEW: App Roles (Entitlements)
export interface EntraAppRole {
  id: string;
  displayName: string | null;
  description: string | null;
  value: string | null;
  isEnabled: boolean | null;
  allowedMemberTypes: string[];
}

// NEW: App Role Assignments
export interface EntraAppRoleAssignment {
  id: string;
  principalId: string;
  principalType: string | null;
  principalDisplayName: string | null;
  resourceId: string;
  resourceDisplayName: string | null;
  appRoleId: string;
  createdDateTime: string | null;
}

// NEW: Authentication Methods
export interface EntraAuthenticationMethod {
  id: string;
  '@odata.type': string;
  displayName?: string | null;
  deviceTag?: string | null;
  phoneAppVersion?: string | null;
  phoneNumber?: string | null;
  phoneType?: string | null;
  createdDateTime?: string | null;
}

// NEW: Authentication Methods Policy
export interface EntraAuthenticationMethodsPolicy {
  id: string;
  displayName: string | null;
  registrationEnforcement: {
    authenticationMethodsRegistrationCampaign?: {
      snoozeDurationInDays?: number;
      state?: string;
      excludeTargets?: Array<unknown>;
      includeTargets?: Array<{
        id?: string;
        targetType?: string;
        targetedAuthenticationMethod?: string;
      }>;
    };
  } | null;
  authenticationMethodConfigurations: Array<{
    '@odata.type'?: string;
    id?: string;
    state?: string;
    [key: string]: unknown;
  }>;
}

// NEW: License Details
export interface EntraLicenseDetails {
  id: string;
  skuId: string;
  skuPartNumber: string | null;
  servicePlans: Array<{
    servicePlanId: string;
    servicePlanName: string | null;
    provisioningStatus: string | null;
  }>;
}

// NEW: PIM Role Eligibility Schedule
export interface EntraPIMRoleEligibilitySchedule {
  id: string;
  principalId: string;
  roleDefinitionId: string;
  directoryScopeId: string | null;
  scheduleInfo: {
    startDateTime: string | null;
    expiration: Record<string, unknown> | null;
  } | null;
  status: string | null;
  createdDateTime?: string | null;
}

// NEW: Conditional Access Policy
export interface EntraConditionalAccessPolicy {
  id: string;
  displayName: string | null;
  state: string | null;
  conditions: Record<string, unknown> | null;
  grantControls: Record<string, unknown> | null;
  sessionControls: Record<string, unknown> | null;
  createdDateTime: string | null;
  modifiedDateTime: string | null;
}

// NEW: Lifecycle Workflow
export interface EntraLifecycleWorkflow {
  id: string;
  displayName: string | null;
  description: string | null;
  category: string | null;
  isEnabled: boolean | null;
  executionConditions: Record<string, unknown> | null;
  tasks: Array<Record<string, unknown>>;
  createdDateTime: string | null;
  lastModifiedDateTime: string | null;
}

// NEW: Directory Audit Log
export interface EntraDirectoryAudit {
  id: string;
  activityDateTime: string;
  activityDisplayName: string | null;
  category: string | null;
  result: string | null;
  resultReason: string | null;
  initiatedBy: {
    user?: { id?: string; displayName?: string; userPrincipalName?: string } | null;
    app?: { appId?: string; displayName?: string } | null;
  } | null;
  targetResources: Array<{
    id?: string;
    displayName?: string;
    type?: string;
    userPrincipalName?: string;
    groupType?: string | null;
    modifiedProperties?: Array<Record<string, unknown>>;
  }>;
  additionalDetails: Array<{
    key?: string;
    value?: string;
  }>;
}

// NEW: Sign-In Log
export interface EntraSignIn {
  id: string;
  createdDateTime: string;
  userPrincipalName: string | null;
  userId: string | null;
  userDisplayName: string | null;
  appDisplayName: string | null;
  appId: string | null;
  ipAddress: string | null;
  clientAppUsed: string | null;
  status: {
    errorCode?: number;
    failureReason?: string | null;
    additionalDetails?: string | null;
  } | null;
  location: {
    city?: string | null;
    state?: string | null;
    countryOrRegion?: string | null;
    geoCoordinates?: { latitude?: number; longitude?: number } | null;
  } | null;
  deviceDetail: {
    deviceId?: string | null;
    displayName?: string | null;
    operatingSystem?: string | null;
    browser?: string | null;
    isCompliant?: boolean | null;
    isManaged?: boolean | null;
    trustType?: string | null;
  } | null;
  conditionalAccessStatus: string | null;
  riskDetail: string | null;
  riskLevelAggregated: string | null;
  riskLevelDuringSignIn: string | null;
  riskState: string | null;
}
