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
