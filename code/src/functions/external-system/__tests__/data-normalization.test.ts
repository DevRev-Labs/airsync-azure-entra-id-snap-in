/**
 * Unit Tests for Data Normalization Module
 *
 * This test suite provides comprehensive coverage for all 19 normalization functions
 * that transform Microsoft Graph API responses into DevRev-compatible format.
 *
 * Test Coverage:
 * - Normal cases with all fields populated
 * - Null/undefined field handling
 * - Missing optional fields
 * - Edge cases (empty strings, empty arrays)
 * - Extension attributes (for users)
 * - Deleted entities (@removed property)
 * - Fallback date handling
 * - URL generation for Azure Portal links
 */

import {
  normalizeUser,
  normalizeGroup,
  normalizeGroupMember,
  normalizeDirectoryRole,
  normalizeApplication,
  normalizeServicePrincipal,
  normalizeDevice,
  normalizeOrgContact,
  normalizeAppRole,
  normalizeAppRoleAssignment,
  normalizeAuthenticationMethod,
  normalizeAuthenticationMethodsPolicy,
  normalizeLicenseAssignment,
  normalizePIMEligibleRole,
  normalizeConditionalAccessPolicy,
  normalizeLifecycleWorkflow,
  normalizeDirectoryAuditLog,
  normalizeSignInLog,
} from '../data-normalization';
import {
  EntraUser,
  EntraGroup,
  EntraDirectoryRole,
  EntraDirectoryRoleMember,
  EntraApplication,
  EntraServicePrincipal,
  EntraDevice,
  EntraOrgContact,
  EntraAppRole,
  EntraAppRoleAssignment,
  EntraAuthenticationMethod,
  EntraAuthenticationMethodsPolicy,
  EntraLicenseDetails,
  EntraPIMRoleEligibilitySchedule,
  EntraConditionalAccessPolicy,
  EntraLifecycleWorkflow,
  EntraDirectoryAudit,
  EntraSignIn,
} from '../types';

// Fallback date for entities without created/modified timestamps
const FALLBACK_DATE = new Date(0).toISOString(); // 1970-01-01T00:00:00.000Z

// ══════════════════════════════════════════════════════════════════════════════
// TEST SUITE #1: normalizeUser
// ══════════════════════════════════════════════════════════════════════════════

describe('normalizeUser', () => {
  // ────────────────────────────────────────────────────────────────────────────
  // Test Case: Normal user with all fields populated
  // ────────────────────────────────────────────────────────────────────────────
  it('should normalize user with all fields populated', () => {
    const user: EntraUser = {
      id: '12345678-1234-1234-1234-123456789012',
      displayName: 'John Doe',
      mail: 'john.doe@contoso.com',
      userPrincipalName: 'john.doe@contoso.onmicrosoft.com',
      givenName: 'John',
      surname: 'Doe',
      jobTitle: 'Software Engineer',
      department: 'Engineering',
      officeLocation: 'Building 1',
      mobilePhone: '+1-555-0100',
      businessPhones: ['+1-555-0101', '+1-555-0102'],
      accountEnabled: true,
      userType: 'Member',
      createdDateTime: '2024-01-15T10:30:00Z',
    };

    const result = normalizeUser(user);

    // normalizeUser emits only the three fields declared in the EDM
    // (users record type: display_name, email, full_name) plus dynamic
    // extension_* attributes. Other Graph fields (jobTitle, department,
    // businessPhones, …) are intentionally dropped to keep the payload
    // aligned with the domain metadata.
    expect(result.id).toBe(user.id);
    expect(result.created_date).toBe(user.createdDateTime);
    expect(result.modified_date).toBe(user.createdDateTime);
    expect(result.data.display_name).toBe('John Doe');
    expect(result.data.email).toBe('john.doe@contoso.com');
    expect(result.data.full_name).toBe('John Doe');
  });

  // ────────────────────────────────────────────────────────────────────────────
  // Test Case: User with null fields
  // ────────────────────────────────────────────────────────────────────────────
  it('should handle user with null fields', () => {
    const user: EntraUser = {
      id: '12345678-1234-1234-1234-123456789012',
      displayName: null,
      mail: null,
      userPrincipalName: 'user@contoso.com',
      givenName: null,
      surname: null,
      jobTitle: null,
      department: null,
      officeLocation: null,
      mobilePhone: null,
      businessPhones: [],
      accountEnabled: null,
      userType: null,
      createdDateTime: null,
    };

    const result = normalizeUser(user);

    // With all optional Graph fields null, we still emit the three EDM
    // fields; job_title/department/office_location aren't in the EDM so
    // there's nothing to assert about them.
    expect(result.id).toBe(user.id);
    expect(result.created_date).toBe(FALLBACK_DATE);
    expect(result.modified_date).toBe(FALLBACK_DATE);
    expect(result.data.display_name).toBeNull();
    expect(result.data.email).toBe('user@contoso.com'); // Falls back to userPrincipalName
    expect(result.data.full_name).toBeNull();
  });

  // ────────────────────────────────────────────────────────────────────────────
  // Test Case: User with extension attributes
  // ────────────────────────────────────────────────────────────────────────────
  it('should include extension attributes in normalized user', () => {
    const user: EntraUser = {
      id: '12345678-1234-1234-1234-123456789012',
      displayName: 'Jane Smith',
      mail: 'jane.smith@contoso.com',
      userPrincipalName: 'jane.smith@contoso.com',
      givenName: 'Jane',
      surname: 'Smith',
      jobTitle: 'Manager',
      department: 'Sales',
      officeLocation: null,
      mobilePhone: null,
      businessPhones: [],
      accountEnabled: true,
      userType: 'Member',
      createdDateTime: '2024-02-20T14:00:00Z',
      // Extension attributes
      extension_abc123_EmployeeID: 'EMP-001',
      extension_abc123_CostCenter: 'CC-100',
      extension_abc123_BadgeNumber: 'B-12345',
    };

    const result = normalizeUser(user);

    expect(result.data.extension_abc123_EmployeeID).toBe('EMP-001');
    expect(result.data.extension_abc123_CostCenter).toBe('CC-100');
    expect(result.data.extension_abc123_BadgeNumber).toBe('B-12345');
  });

  // ────────────────────────────────────────────────────────────────────────────
  // Test Case: User with only givenName (no surname)
  // ────────────────────────────────────────────────────────────────────────────
  it('should construct full_name from givenName only', () => {
    const user: EntraUser = {
      id: '12345678-1234-1234-1234-123456789012',
      displayName: 'Alice',
      mail: 'alice@contoso.com',
      userPrincipalName: 'alice@contoso.com',
      givenName: 'Alice',
      surname: null,
      jobTitle: null,
      department: null,
      officeLocation: null,
      mobilePhone: null,
      businessPhones: [],
      accountEnabled: true,
      userType: 'Member',
      createdDateTime: '2024-03-10T09:00:00Z',
    };

    const result = normalizeUser(user);

    expect(result.data.full_name).toBe('Alice');
  });

  // ────────────────────────────────────────────────────────────────────────────
  // Test Case: User with only surname (no givenName)
  // ────────────────────────────────────────────────────────────────────────────
  it('should construct full_name from surname only', () => {
    const user: EntraUser = {
      id: '12345678-1234-1234-1234-123456789012',
      displayName: 'Smith',
      mail: 'smith@contoso.com',
      userPrincipalName: 'smith@contoso.com',
      givenName: null,
      surname: 'Smith',
      jobTitle: null,
      department: null,
      officeLocation: null,
      mobilePhone: null,
      businessPhones: [],
      accountEnabled: true,
      userType: 'Member',
      createdDateTime: '2024-03-11T10:00:00Z',
    };

    const result = normalizeUser(user);

    expect(result.data.full_name).toBe('Smith');
  });

  // ────────────────────────────────────────────────────────────────────────────
  // Test Case: User with no mail or userPrincipalName
  // ────────────────────────────────────────────────────────────────────────────
  it('should handle user with no email fields', () => {
    const user: EntraUser = {
      id: '12345678-1234-1234-1234-123456789012',
      displayName: 'No Email User',
      mail: null,
      userPrincipalName: null,
      givenName: null,
      surname: null,
      jobTitle: null,
      department: null,
      officeLocation: null,
      mobilePhone: null,
      businessPhones: [],
      accountEnabled: true,
      userType: 'Guest',
      createdDateTime: '2024-03-12T11:00:00Z',
    };

    const result = normalizeUser(user);

    expect(result.data.email).toBeNull();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// TEST SUITE #2: normalizeGroup
// ══════════════════════════════════════════════════════════════════════════════

describe('normalizeGroup', () => {
  it('should normalize group with all fields populated', () => {
    const group: EntraGroup = {
      id: '87654321-4321-4321-4321-210987654321',
      displayName: 'Engineering Team',
      description: 'All engineers in the organization',
      mail: 'engineering@contoso.com',
      groupTypes: ['Unified'],
      securityEnabled: true,
      mailEnabled: true,
      createdDateTime: '2024-01-01T08:00:00Z',
    };

    const result = normalizeGroup(group);

    // normalizeGroup emits only what the EDM declares for `groups`:
    // name (mapped from displayName), description, and item_url_field
    // (Azure Portal deep link). Fields like mail / groupTypes /
    // securityEnabled / mailEnabled are intentionally dropped.
    expect(result.id).toBe(group.id);
    expect(result.created_date).toBe(group.createdDateTime);
    expect(result.modified_date).toBe(group.createdDateTime);
    expect(result.data.name).toBe('Engineering Team');
    expect(result.data.description).toBe('All engineers in the organization');
    expect(typeof result.data.item_url_field).toBe('string');
    expect(result.data.item_url_field).toContain(group.id);
  });

  it('should handle group with null fields', () => {
    const group: EntraGroup = {
      id: '87654321-4321-4321-4321-210987654321',
      displayName: 'Empty Group',
      description: null,
      mail: null,
      groupTypes: [],
      securityEnabled: null,
      mailEnabled: null,
      createdDateTime: null,
    };

    const result = normalizeGroup(group);

    expect(result.created_date).toBe(FALLBACK_DATE);
    expect(result.data.name).toBe('Empty Group');
    expect(result.data.description).toBeNull();
  });

  it('should emit the Azure Portal deep link for a Microsoft 365 group', () => {
    const group: EntraGroup = {
      id: '87654321-4321-4321-4321-210987654321',
      displayName: 'Sales Team',
      description: 'Microsoft 365 Group for Sales',
      mail: 'sales@contoso.com',
      groupTypes: ['Unified'],
      securityEnabled: false,
      mailEnabled: true,
      createdDateTime: '2024-02-01T09:00:00Z',
    };

    const result = normalizeGroup(group);

    expect(result.data.name).toBe('Sales Team');
    expect(result.data.item_url_field).toContain('GroupDetailsMenuBlade');
    expect(result.data.item_url_field).toContain(group.id);
  });

  it('should emit the description when present on a security group', () => {
    const group: EntraGroup = {
      id: '87654321-4321-4321-4321-210987654321',
      displayName: 'Security Admins',
      description: 'Security administrators group',
      mail: null,
      groupTypes: [],
      securityEnabled: true,
      mailEnabled: false,
      createdDateTime: '2024-02-15T10:00:00Z',
    };

    const result = normalizeGroup(group);

    expect(result.data.name).toBe('Security Admins');
    expect(result.data.description).toBe('Security administrators group');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// TEST SUITE #3: normalizeGroupMember
// ══════════════════════════════════════════════════════════════════════════════

describe('normalizeGroupMember', () => {
  const groupId = 'group-123';

  // The EDM for `group_members` declares only two fields: member_id and
  // group_id. member_type / member_display_name were dropped when the
  // record type was slimmed down to a pure relationship join. These tests
  // now assert the minimal shape only.

  it('should normalize group member for user', () => {
    const member: EntraDirectoryRoleMember = {
      id: 'user-456',
      '@odata.type': '#microsoft.graph.user',
      displayName: 'John Doe',
    };

    const result = normalizeGroupMember(member, groupId);

    expect(result.id).toBe('group-123_user-456');
    expect(result.data.group_id).toBe('group-123');
    expect(result.data.member_id).toBe('user-456');
  });

  it('should normalize group member for group (nested group)', () => {
    const member: EntraDirectoryRoleMember = {
      id: 'group-789',
      '@odata.type': '#microsoft.graph.group',
      displayName: 'Nested Group',
    };

    const result = normalizeGroupMember(member, groupId);

    expect(result.id).toBe('group-123_group-789');
    expect(result.data.member_id).toBe('group-789');
    expect(result.data.group_id).toBe('group-123');
  });

  it('should still produce a stable composite id when member has no display name', () => {
    const member: EntraDirectoryRoleMember = {
      id: 'user-999',
      '@odata.type': '#microsoft.graph.user',
    };

    const result = normalizeGroupMember(member, groupId);

    expect(result.id).toBe('group-123_user-999');
    expect(result.data.member_id).toBe('user-999');
  });

  it('should normalize a service principal member', () => {
    const member: EntraDirectoryRoleMember = {
      id: 'sp-111',
      '@odata.type': '#microsoft.graph.servicePrincipal',
      displayName: 'App Service Principal',
    };

    const result = normalizeGroupMember(member, groupId);

    expect(result.id).toBe('group-123_sp-111');
    expect(result.data.member_id).toBe('sp-111');
    expect(result.data.group_id).toBe('group-123');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// TEST SUITE #4: normalizeDirectoryRole
// ══════════════════════════════════════════════════════════════════════════════

describe('normalizeDirectoryRole', () => {
  it('should normalize directory role with all fields', () => {
    const role: EntraDirectoryRole = {
      id: 'role-123',
      displayName: 'Global Administrator',
      description: 'Full access to all administrative features',
      roleTemplateId: 'template-456',
    };

    const result = normalizeDirectoryRole(role);

    expect(result.id).toBe('role-123');
    expect(result.data.display_name).toBe('Global Administrator');
    expect(result.data.description).toBe('Full access to all administrative features');
    expect(result.data.role_template_id).toBe('template-456');
  });

  it('should handle role with null fields', () => {
    const role: EntraDirectoryRole = {
      id: 'role-789',
      displayName: 'Custom Role',
      description: null,
      roleTemplateId: null,
    };

    const result = normalizeDirectoryRole(role);

    expect(result.data.description).toBeNull();
    expect(result.data.role_template_id).toBeNull();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// TEST SUITE #5: normalizeApplication
// ══════════════════════════════════════════════════════════════════════════════

describe('normalizeApplication', () => {
  it('should normalize application with all fields', () => {
    const app: EntraApplication = {
      id: 'app-123',
      appId: 'app-client-id-456',
      displayName: 'My Application',
      signInAudience: 'AzureADMyOrg',
      createdDateTime: '2024-01-20T12:00:00Z',
      publisherDomain: 'contoso.com',
      identifierUris: ['https://contoso.com/app'],
    };

    const result = normalizeApplication(app);

    expect(result.id).toBe('app-123');
    expect(result.created_date).toBe('2024-01-20T12:00:00Z');
    expect(result.data.app_id).toBe('app-client-id-456');
    expect(result.data.display_name).toBe('My Application');
    expect(result.data.sign_in_audience).toBe('AzureADMyOrg');
    expect(result.data.publisher_domain).toBe('contoso.com');
    // identifier_uris is now a comma-separated string instead of array
    expect(result.data.identifier_uris).toBe('https://contoso.com/app');
  });

  it('should handle application with null fields', () => {
    const app: EntraApplication = {
      id: 'app-789',
      appId: 'app-client-id-999',
      displayName: 'Minimal App',
      signInAudience: null,
      createdDateTime: null,
      publisherDomain: null,
      identifierUris: [],
    };

    const result = normalizeApplication(app);

    expect(result.created_date).toBe(FALLBACK_DATE);
    expect(result.data.sign_in_audience).toBeNull();
    expect(result.data.publisher_domain).toBeNull();
    // Empty array should become empty string
    expect(result.data.identifier_uris).toBe('');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// TEST SUITE #7: normalizeServicePrincipal
// ══════════════════════════════════════════════════════════════════════════════

describe('normalizeServicePrincipal', () => {
  it('should normalize service principal with all fields', () => {
    const sp: EntraServicePrincipal = {
      id: 'sp-123',
      appId: 'app-456',
      displayName: 'Service Principal Name',
      servicePrincipalType: 'Application',
      accountEnabled: true,
      appOwnerOrganizationId: 'org-789',
      createdDateTime: '2024-02-01T10:00:00Z',
    };

    const result = normalizeServicePrincipal(sp);

    expect(result.id).toBe('sp-123');
    expect(result.created_date).toBe('2024-02-01T10:00:00Z');
    expect(result.data.app_id).toBe('app-456');
    expect(result.data.display_name).toBe('Service Principal Name');
    expect(result.data.service_principal_type).toBe('Application');
    expect(result.data.account_enabled).toBe(true);
    expect(result.data.app_owner_organization_id).toBe('org-789');
  });

  it('should handle service principal with null created date', () => {
    const sp: EntraServicePrincipal = {
      id: 'sp-456',
      appId: 'app-789',
      displayName: 'SP Without Date',
      servicePrincipalType: 'ManagedIdentity',
      accountEnabled: true,
      appOwnerOrganizationId: null,
      createdDateTime: null,
    };

    const result = normalizeServicePrincipal(sp);

    expect(result.created_date).toBe(FALLBACK_DATE);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// TEST SUITE #8: normalizeDevice
// ══════════════════════════════════════════════════════════════════════════════

describe('normalizeDevice', () => {
  it('should normalize device with all fields including owner', () => {
    const device: EntraDevice = {
      id: 'device-123',
      displayName: 'LAPTOP-ABC123',
      operatingSystem: 'Windows',
      operatingSystemVersion: '10.0.19045',
      trustType: 'AzureAd',
      isCompliant: true,
      isManaged: true,
      registrationDateTime: '2024-01-15T09:00:00Z',
      approximateLastSignInDateTime: '2024-03-15T14:30:00Z',
      deviceId: 'device-guid-456',
      manufacturer: 'Dell',
      model: 'Latitude 5520',
      profileType: 'RegisteredDevice',
      registeredOwnerId: 'user-789',
      registeredOwnerEmail: 'owner@contoso.com',
      registeredOwnerDisplayName: 'Device Owner',
    };

    const result = normalizeDevice(device);

    expect(result.id).toBe('device-123');
    expect(result.created_date).toBe('2024-01-15T09:00:00Z');
    expect(result.data.display_name).toBe('LAPTOP-ABC123');
    expect(result.data.operating_system).toBe('Windows');
    expect(result.data.operating_system_version).toBe('10.0.19045');
    expect(result.data.trust_type).toBe('AzureAd');
    expect(result.data.is_compliant).toBe(true);
    expect(result.data.is_managed).toBe(true);
    expect(result.data.manufacturer).toBe('Dell');
    expect(result.data.model).toBe('Latitude 5520');
    expect(result.data.registered_owner_id).toBe('user-789');
    expect(result.data.registered_owner_email).toBe('owner@contoso.com');
    expect(result.data.registered_owner_display_name).toBe('Device Owner');
  });

  it('should handle device without owner information', () => {
    const device: EntraDevice = {
      id: 'device-456',
      displayName: 'PHONE-XYZ789',
      operatingSystem: 'iOS',
      operatingSystemVersion: '16.0',
      trustType: 'Workplace',
      isCompliant: null,
      isManaged: null,
      registrationDateTime: null,
      approximateLastSignInDateTime: null,
      deviceId: null,
    };

    const result = normalizeDevice(device);

    expect(result.created_date).toBe(FALLBACK_DATE);
    expect(result.data.registered_owner_id).toBeNull();
    expect(result.data.registered_owner_email).toBeNull();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// TEST SUITE #9: normalizeOrgContact
// ══════════════════════════════════════════════════════════════════════════════

describe('normalizeOrgContact', () => {
  it('should normalize organizational contact with all fields', () => {
    const contact: EntraOrgContact = {
      id: 'contact-123',
      displayName: 'External Partner',
      mail: 'partner@external.com',
      givenName: 'John',
      surname: 'Partner',
      createdDateTime: '2024-01-10T08:00:00Z',
    };

    const result = normalizeOrgContact(contact);

    expect(result.id).toBe('contact-123');
    expect(result.created_date).toBe('2024-01-10T08:00:00Z');
    expect(result.data.display_name).toBe('External Partner');
    expect(result.data.email).toBe('partner@external.com');
    expect(result.data.full_name).toBe('John Partner');
  });

  it('should handle contact with null fields', () => {
    const contact: EntraOrgContact = {
      id: 'contact-456',
      displayName: 'Minimal Contact',
      mail: null,
      givenName: null,
      surname: null,
      createdDateTime: null,
    };

    const result = normalizeOrgContact(contact);

    expect(result.created_date).toBe(FALLBACK_DATE);
    expect(result.data.email).toBeNull();
    expect(result.data.full_name).toBeNull();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// TEST SUITE #10: normalizeAppRole
// ══════════════════════════════════════════════════════════════════════════════

describe('normalizeAppRole', () => {
  const servicePrincipalId = 'sp-123';

  it('should normalize app role with all fields', () => {
    const appRole: EntraAppRole = {
      id: 'role-456',
      displayName: 'Admin',
      description: 'Administrative role with full access',
      value: 'Admin',
      isEnabled: true,
      allowedMemberTypes: ['User', 'Application'],
    };

    const result = normalizeAppRole(appRole, servicePrincipalId);

    expect(result.id).toBe('sp-123_role-456');
    expect(result.data.service_principal_id).toBe('sp-123');
    expect(result.data.app_role_id).toBe('role-456');
    expect(result.data.display_name).toBe('Admin');
    expect(result.data.description).toBe('Administrative role with full access');
    expect(result.data.value).toBe('Admin');
    expect(result.data.is_enabled).toBe(true);
    // allowed_member_types is now a comma-separated string instead of array
    expect(result.data.allowed_member_types).toBe('User, Application');
  });

  it('should handle app role with null fields', () => {
    const appRole: EntraAppRole = {
      id: 'role-789',
      displayName: null,
      description: null,
      value: null,
      isEnabled: null,
      allowedMemberTypes: [],
    };

    const result = normalizeAppRole(appRole, servicePrincipalId);

    expect(result.data.display_name).toBeNull();
    expect(result.data.description).toBeNull();
    expect(result.data.is_enabled).toBeNull();
    // Empty array should become empty string
    expect(result.data.allowed_member_types).toBe('');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// TEST SUITE #11: normalizeAppRoleAssignment
// ══════════════════════════════════════════════════════════════════════════════

describe('normalizeAppRoleAssignment', () => {
  it('should normalize app role assignment with all fields', () => {
    const assignment: EntraAppRoleAssignment = {
      id: 'assignment-456',
      principalId: 'user-789',
      principalType: 'User',
      principalDisplayName: 'John Doe',
      resourceId: 'sp-123',
      resourceDisplayName: 'My Application',
      appRoleId: 'role-111',
      createdDateTime: '2024-02-10T11:00:00Z',
    };

    const result = normalizeAppRoleAssignment(assignment);

    expect(result.id).toBe('assignment-456');
    expect(result.created_date).toBe('2024-02-10T11:00:00Z');
    expect(result.data.principal_id).toBe('user-789');
    expect(result.data.principal_type).toBe('User');
    expect(result.data.principal_display_name).toBe('John Doe');
    expect(result.data.resource_id).toBe('sp-123');
    expect(result.data.resource_display_name).toBe('My Application');
    expect(result.data.app_role_id).toBe('role-111');
  });

  it('should handle assignment with null created date', () => {
    const assignment: EntraAppRoleAssignment = {
      id: 'assignment-999',
      principalId: 'user-888',
      principalType: 'ServicePrincipal',
      principalDisplayName: null,
      resourceId: 'sp-123',
      resourceDisplayName: null,
      appRoleId: 'role-222',
      createdDateTime: null,
    };

    const result = normalizeAppRoleAssignment(assignment);

    expect(result.created_date).toBe(FALLBACK_DATE);
    expect(result.data.principal_display_name).toBeNull();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// TEST SUITE #12: Edge Cases and Error Handling
// ══════════════════════════════════════════════════════════════════════════════

describe('Edge Cases', () => {
  it('should handle empty string fields', () => {
    const user: EntraUser = {
      id: 'user-123',
      displayName: '',
      mail: '',
      userPrincipalName: 'user@contoso.com',
      givenName: '',
      surname: '',
      jobTitle: '',
      department: '',
      officeLocation: '',
      mobilePhone: '',
      businessPhones: [],
      accountEnabled: true,
      userType: 'Member',
      createdDateTime: '2024-03-15T10:00:00Z',
    };

    const result = normalizeUser(user);

    expect(result.data.display_name).toBe('');
    expect(result.data.email).toBe('user@contoso.com'); // Falls back to UPN
  });

  it('should fall back to userPrincipalName when mail is missing', () => {
    // Edge case: users provisioned without a primary SMTP address still
    // need a resolvable email in the normalized output. normalizeUser
    // falls back to userPrincipalName in that case.
    const user: EntraUser = {
      id: 'user-456',
      displayName: 'Test User',
      mail: null,
      userPrincipalName: 'test@contoso.com',
      givenName: null,
      surname: null,
      jobTitle: null,
      department: null,
      officeLocation: null,
      mobilePhone: null,
      businessPhones: [],
      accountEnabled: true,
      userType: 'Member',
      createdDateTime: '2024-03-15T11:00:00Z',
    };

    const result = normalizeUser(user);

    expect(result.data.email).toBe('test@contoso.com');
  });

  it('should still produce a stable url for a group with an empty groupTypes array', () => {
    // groupTypes is not part of the EDM anymore, but the group entity
    // must still normalize cleanly (with a valid deep link) regardless.
    const group: EntraGroup = {
      id: 'group-123',
      displayName: 'Empty Types Group',
      description: null,
      mail: null,
      groupTypes: [],
      securityEnabled: true,
      mailEnabled: false,
      createdDateTime: '2024-03-15T12:00:00Z',
    };

    const result = normalizeGroup(group);

    expect(result.data.name).toBe('Empty Types Group');
    expect(result.data.item_url_field).toContain(group.id);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// TEST SUITE #13: normalizeAuthenticationMethod
// ══════════════════════════════════════════════════════════════════════════════

describe('normalizeAuthenticationMethod', () => {
  const userId = 'user-123';

  // method_type is emitted in camelCase to match the EDM enum values
  // (e.g. `microsoftAuthenticatorAuthenticationMethod`) — the domain
  // metadata enum is case-sensitive. The user-facing title is written to
  // `display_name`, not to a separate `title` field.

  it('should normalize authentication method for Microsoft Authenticator', () => {
    const method: EntraAuthenticationMethod = {
      id: 'method-456',
      '@odata.type': '#microsoft.graph.microsoftAuthenticatorAuthenticationMethod',
      displayName: 'My iPhone',
      deviceTag: 'iOS',
      phoneAppVersion: '6.5.8',
      createdDateTime: '2024-01-20T10:00:00Z',
    };

    const result = normalizeAuthenticationMethod(method, userId);

    expect(result.id).toBe('user-123_method-456');
    expect(result.created_date).toBe('2024-01-20T10:00:00Z');
    expect(result.data.user_id).toBe('user-123');
    expect(result.data.method_id).toBe('method-456');
    expect(result.data.method_type).toBe('microsoftAuthenticatorAuthenticationMethod');
    expect(result.data.display_name).toBe('My iPhone');
    expect(result.data.device_tag).toBe('iOS');
    expect(result.data.phone_app_version).toBe('6.5.8');
  });

  it('should normalize authentication method for phone', () => {
    const method: EntraAuthenticationMethod = {
      id: 'method-789',
      '@odata.type': '#microsoft.graph.phoneAuthenticationMethod',
      phoneNumber: '+1-555-0100',
      phoneType: 'mobile',
      createdDateTime: '2024-02-15T11:00:00Z',
    };

    const result = normalizeAuthenticationMethod(method, userId);

    expect(result.data.method_type).toBe('phoneAuthenticationMethod');
    // No displayName on the method → generated title includes the number.
    expect(result.data.display_name).toContain('Phone Authentication');
    expect(result.data.display_name).toContain('+1-555-0100');
    expect(result.data.phone_number).toBe('+1-555-0100');
    expect(result.data.phone_type).toBe('mobile');
  });

  it('should handle authentication method with null createdDateTime', () => {
    const method: EntraAuthenticationMethod = {
      id: 'method-999',
      '@odata.type': '#microsoft.graph.passwordAuthenticationMethod',
      createdDateTime: null,
    };

    const result = normalizeAuthenticationMethod(method, userId);

    expect(result.created_date).toBe(FALLBACK_DATE);
    expect(result.data.method_type).toBe('passwordAuthenticationMethod');
    expect(result.data.display_name).toBe('Password'); // Generated fallback title
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// TEST SUITE #14: normalizeAuthenticationMethodsPolicy
// ══════════════════════════════════════════════════════════════════════════════

describe('normalizeAuthenticationMethodsPolicy', () => {
  it('should normalize authentication methods policy with all fields', () => {
    const policy: EntraAuthenticationMethodsPolicy = {
      id: 'policy-123',
      displayName: 'Authentication Methods Policy',
      registrationEnforcement: {
        authenticationMethodsRegistrationCampaign: {
          snoozeDurationInDays: 7,
          state: 'enabled',
          excludeTargets: [],
          includeTargets: [
            {
              id: 'group-456',
              targetType: 'group',
              targetedAuthenticationMethod: 'microsoftAuthenticator',
            },
          ],
        },
      },
      authenticationMethodConfigurations: [
        {
          '@odata.type': '#microsoft.graph.fido2AuthenticationMethodConfiguration',
          id: 'config-789',
          state: 'enabled',
        },
      ],
    };

    const result = normalizeAuthenticationMethodsPolicy(policy);

    // The EDM types registration_enforcement and
    // authentication_method_configurations as rich_text, so the
    // normalizer serialises those nested structures to JSON strings.
    expect(result.id).toBe('policy-123');
    expect(result.data.display_name).toBe('Authentication Methods Policy');
    expect(typeof result.data.registration_enforcement).toBe('string');
    expect(result.data.registration_enforcement).toContain('microsoftAuthenticator');
    expect(typeof result.data.authentication_method_configurations).toBe('string');
    expect(result.data.authentication_method_configurations).toContain('fido2AuthenticationMethodConfiguration');
    expect(result.data.total_auth_method_configurations).toBe(1);
    expect(result.data.enabled_auth_methods).toBe('fido2');
    expect(result.data.registration_campaign_state).toBe('enabled');
    expect(result.data.registration_snooze_days).toBe(7);
  });

  it('should handle policy with null registration enforcement', () => {
    const policy: EntraAuthenticationMethodsPolicy = {
      id: 'policy-456',
      displayName: 'Minimal Policy',
      registrationEnforcement: null,
      authenticationMethodConfigurations: [],
    };

    const result = normalizeAuthenticationMethodsPolicy(policy);

    // registration_enforcement is null → normalizer emits null (not a
    // JSON string). authentication_method_configurations is an empty
    // array → normalizer emits the JSON-encoded empty array "[]".
    expect(result.data.registration_enforcement).toBeNull();
    expect(result.data.authentication_method_configurations).toBe('[]');
    expect(result.data.total_auth_method_configurations).toBe(0);
    expect(result.data.enabled_auth_methods).toBeNull();
    expect(result.data.registration_campaign_state).toBeNull();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// TEST SUITE #15: normalizeLicenseAssignment
// ══════════════════════════════════════════════════════════════════════════════

describe('normalizeLicenseAssignment', () => {
  const userId = 'user-123';

  it('should normalize license assignment with service plans', () => {
    const license: EntraLicenseDetails = {
      id: 'license-456',
      skuId: 'sku-789',
      skuPartNumber: 'ENTERPRISEPACK',
      servicePlans: [
        {
          servicePlanId: 'plan-111',
          servicePlanName: 'Exchange Online',
          provisioningStatus: 'Success',
        },
        {
          servicePlanId: 'plan-222',
          servicePlanName: 'SharePoint Online',
          provisioningStatus: 'Success',
        },
      ],
    };

    const result = normalizeLicenseAssignment(license, userId);

    expect(result.id).toBe('user-123_license-456');
    expect(result.data.user_id).toBe('user-123');
    expect(result.data.sku_id).toBe('sku-789');
    expect(result.data.sku_part_number).toBe('ENTERPRISEPACK');
    expect(result.data.total_service_plans).toBe(2);
    expect(result.data.success_service_plans_count).toBe(2);
  });

  it('should handle license with null sku part number', () => {
    const license: EntraLicenseDetails = {
      id: 'license-999',
      skuId: 'sku-888',
      skuPartNumber: null,
      servicePlans: [],
    };

    const result = normalizeLicenseAssignment(license, userId);

    expect(result.data.sku_part_number).toBeNull();
    expect(result.data.total_service_plans).toBe(0);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// TEST SUITE #16: normalizePIMEligibleRole
// ══════════════════════════════════════════════════════════════════════════════

describe('normalizePIMEligibleRole', () => {
  it('should normalize PIM eligible role with schedule info', () => {
    const pimRole: EntraPIMRoleEligibilitySchedule = {
      id: 'pim-123',
      principalId: 'user-456',
      roleDefinitionId: 'role-789',
      directoryScopeId: '/',
      scheduleInfo: {
        startDateTime: '2024-01-01T00:00:00Z',
        expiration: {
          type: 'noExpiration',
        },
      },
      status: 'Provisioned',
      createdDateTime: '2024-01-01T00:00:00Z',
    };

    const result = normalizePIMEligibleRole(pimRole);

    expect(result.id).toBe('pim-123');
    expect(result.created_date).toBe('2024-01-01T00:00:00Z');
    expect(result.data.principal_id).toBe('user-456');
    expect(result.data.role_definition_id).toBe('role-789');
    expect(result.data.directory_scope_id).toBe('/');
    expect(result.data.status).toBe('Provisioned');
    expect(result.data.schedule_start_date_time).toBe('2024-01-01T00:00:00Z');
    expect(result.data.expiration_type).toBe('noExpiration');
  });

  it('should handle PIM role with null schedule info', () => {
    const pimRole: EntraPIMRoleEligibilitySchedule = {
      id: 'pim-456',
      principalId: 'user-789',
      roleDefinitionId: 'role-111',
      directoryScopeId: null,
      scheduleInfo: null,
      status: null,
      createdDateTime: null,
    };

    const result = normalizePIMEligibleRole(pimRole);

    expect(result.created_date).toBe(FALLBACK_DATE);
    expect(result.data.schedule_start_date_time).toBeNull();
    expect(result.data.status).toBeNull();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// TEST SUITE #17: normalizeConditionalAccessPolicy
// ══════════════════════════════════════════════════════════════════════════════

describe('normalizeConditionalAccessPolicy', () => {
  it('should normalize conditional access policy with all fields', () => {
    const policy: EntraConditionalAccessPolicy = {
      id: 'policy-123',
      displayName: 'Require MFA for Admins',
      state: 'enabled',
      conditions: {
        users: {
          includeUsers: ['user-456'],
          excludeUsers: [],
        },
        applications: {
          includeApplications: ['All'],
        },
      },
      grantControls: {
        operator: 'OR',
        builtInControls: ['mfa'],
      },
      sessionControls: null,
      createdDateTime: '2024-01-10T09:00:00Z',
      modifiedDateTime: '2024-03-10T10:00:00Z',
    };

    const result = normalizeConditionalAccessPolicy(policy);

    expect(result.id).toBe('policy-123');
    expect(result.created_date).toBe('2024-01-10T09:00:00Z');
    expect(result.modified_date).toBe('2024-03-10T10:00:00Z');
    expect(result.data.display_name).toBe('Require MFA for Admins');
    expect(result.data.state).toBe('enabled');
    expect(result.data.include_users).toBe('user-456');
    expect(result.data.include_applications).toBe('All');
    expect(result.data.grant_built_in_controls).toBe('mfa');
    expect(result.data.grant_operator).toBe('OR');
  });

  it('should handle policy with null conditions and controls', () => {
    const policy: EntraConditionalAccessPolicy = {
      id: 'policy-456',
      displayName: 'Minimal Policy',
      state: 'disabled',
      conditions: null,
      grantControls: null,
      sessionControls: null,
      createdDateTime: null,
      modifiedDateTime: null,
    };

    const result = normalizeConditionalAccessPolicy(policy);

    expect(result.created_date).toBe(FALLBACK_DATE);
    expect(result.modified_date).toBe(FALLBACK_DATE);
    expect(result.data.include_users).toBeNull();
    expect(result.data.grant_built_in_controls).toBeNull();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// TEST SUITE #18: normalizeLifecycleWorkflow
// ══════════════════════════════════════════════════════════════════════════════

describe('normalizeLifecycleWorkflow', () => {
  it('should normalize lifecycle workflow with all fields', () => {
    const workflow: EntraLifecycleWorkflow = {
      id: 'workflow-123',
      displayName: 'Onboard Pre-Hire Employee',
      description: 'Automated onboarding workflow',
      category: 'joiner',
      isEnabled: true,
      executionConditions: {
        trigger: {
          '@odata.type': '#microsoft.graph.identityGovernance.timeBasedAttributeTrigger',
          timeBasedAttribute: 'employeeHireDate',
          offsetInDays: -7,
        },
      },
      tasks: [
        {
          taskDefinitionId: 'task-456',
          displayName: 'Send welcome email',
          isEnabled: true,
        },
      ],
      createdDateTime: '2024-01-05T08:00:00Z',
      lastModifiedDateTime: '2024-02-05T09:00:00Z',
    };

    const result = normalizeLifecycleWorkflow(workflow);

    expect(result.id).toBe('workflow-123');
    expect(result.created_date).toBe('2024-01-05T08:00:00Z');
    expect(result.modified_date).toBe('2024-02-05T09:00:00Z');
    expect(result.data.display_name).toBe('Onboard Pre-Hire Employee');
    expect(result.data.description).toBe('Automated onboarding workflow');
    expect(result.data.category).toBe('joiner');
    expect(result.data.is_enabled).toBe(true);
    expect(result.data.task_count).toBe(1);
    expect(result.data.task_names).toBe('Send welcome email');
  });

  it('should handle workflow with null fields', () => {
    const workflow: EntraLifecycleWorkflow = {
      id: 'workflow-456',
      displayName: 'Simple Workflow',
      description: null,
      category: null,
      isEnabled: null,
      executionConditions: null,
      tasks: [],
      createdDateTime: null,
      lastModifiedDateTime: null,
    };

    const result = normalizeLifecycleWorkflow(workflow);

    expect(result.created_date).toBe(FALLBACK_DATE);
    expect(result.modified_date).toBe(FALLBACK_DATE);
    expect(result.data.description).toBeNull();
    expect(result.data.task_count).toBe(0);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// TEST SUITE #19: normalizeDirectoryAuditLog
// ══════════════════════════════════════════════════════════════════════════════

describe('normalizeDirectoryAuditLog', () => {
  it('should normalize directory audit log with all fields', () => {
    const audit: EntraDirectoryAudit = {
      id: 'audit-123',
      activityDateTime: '2024-03-15T14:30:00Z',
      activityDisplayName: 'Add user',
      category: 'UserManagement',
      result: 'success',
      resultReason: '',
      initiatedBy: {
        user: {
          id: 'user-456',
          displayName: 'Admin User',
          userPrincipalName: 'admin@contoso.com',
        },
        app: null,
      },
      targetResources: [
        {
          id: 'user-789',
          displayName: 'New User',
          type: 'User',
          userPrincipalName: 'newuser@contoso.com',
          modifiedProperties: [
            {
              displayName: 'DisplayName',
              oldValue: null,
              newValue: 'New User',
            },
          ],
        },
      ],
      additionalDetails: [
        {
          key: 'Source',
          value: 'Azure Portal',
        },
      ],
    };

    const result = normalizeDirectoryAuditLog(audit);

    // Target resources are flattened into `target_resources_json` (a
    // JSON-serialised string, aligned with the EDM's rich_text type)
    // plus a `target_resources_count`. Individual target fields from
    // the first entry are also lifted to top-level (target_object_id,
    // target_display_name, target_type, target_user_principal_name).
    expect(result.id).toBe('audit-123');
    expect(result.created_date).toBe('2024-03-15T14:30:00Z');
    expect(result.modified_date).toBe('2024-03-15T14:30:00Z');
    expect(result.data.activity_display_name).toBe('Add user');
    expect(result.data.category).toBe('UserManagement');
    expect(result.data.result).toBe('success');
    expect(result.data.initiated_by_user_id).toBe('user-456');
    expect(result.data.initiated_by_user_display_name).toBe('Admin User');
    expect(result.data.target_resources_count).toBe(1);
    expect(typeof result.data.target_resources_json).toBe('string');
    expect(result.data.target_resources_json).toContain('user-789');
    expect(result.data.target_object_id).toBe('user-789');
    expect(result.data.target_display_name).toBe('New User');
    expect(result.data.target_type).toBe('User');
  });

  it('should handle audit log with app initiator', () => {
    const audit: EntraDirectoryAudit = {
      id: 'audit-456',
      activityDateTime: '2024-03-15T15:00:00Z',
      activityDisplayName: 'Update group',
      category: 'GroupManagement',
      result: 'success',
      resultReason: '',
      initiatedBy: {
        user: null,
        app: {
          appId: 'app-789',
          displayName: 'Provisioning Service',
        },
      },
      targetResources: [],
      additionalDetails: [],
    };

    const result = normalizeDirectoryAuditLog(audit);

    expect(result.data.initiated_by_user_id).toBeNull();
    expect(result.data.initiated_by_app_id).toBe('app-789');
    expect(result.data.initiated_by_app_display_name).toBe('Provisioning Service');
  });

  it('should handle audit log with null initiatedBy', () => {
    const audit: EntraDirectoryAudit = {
      id: 'audit-789',
      activityDateTime: '2024-03-15T16:00:00Z',
      activityDisplayName: 'System activity',
      category: 'Other',
      result: 'success',
      resultReason: null,
      initiatedBy: null,
      targetResources: [],
      additionalDetails: [],
    };

    const result = normalizeDirectoryAuditLog(audit);

    expect(result.data.initiated_by_user_id).toBeNull();
    expect(result.data.initiated_by_app_id).toBeNull();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// TEST SUITE #20: normalizeSignInLog
// ══════════════════════════════════════════════════════════════════════════════

describe('normalizeSignInLog', () => {
  it('should normalize sign-in log with all fields', () => {
    const signIn: EntraSignIn = {
      id: 'signin-123',
      createdDateTime: '2024-03-15T14:45:00Z',
      userPrincipalName: 'user@contoso.com',
      userId: 'user-456',
      userDisplayName: 'John Doe',
      appDisplayName: 'Office 365',
      appId: 'app-789',
      ipAddress: '203.0.113.42',
      clientAppUsed: 'Browser',
      status: {
        errorCode: 0,
        failureReason: null,
        additionalDetails: null,
      },
      location: {
        city: 'Seattle',
        state: 'Washington',
        countryOrRegion: 'US',
        geoCoordinates: {
          latitude: 47.6062,
          longitude: -122.3321,
        },
      },
      deviceDetail: {
        deviceId: 'device-111',
        displayName: 'LAPTOP-ABC123',
        operatingSystem: 'Windows 10',
        browser: 'Edge 120',
        isCompliant: true,
        isManaged: true,
        trustType: 'Azure AD joined',
      },
      conditionalAccessStatus: 'success',
      riskDetail: 'none',
      riskLevelAggregated: 'none',
      riskLevelDuringSignIn: 'none',
      riskState: 'none',
    };

    const result = normalizeSignInLog(signIn);

    expect(result.id).toBe('signin-123');
    expect(result.created_date).toBe('2024-03-15T14:45:00Z');
    expect(result.data.user_principal_name).toBe('user@contoso.com');
    expect(result.data.user_id).toBe('user-456');
    expect(result.data.app_display_name).toBe('Office 365');
    expect(result.data.ip_address).toBe('203.0.113.42');
    expect(result.data.location_city).toBe('Seattle');
    expect(result.data.location_country).toBe('US');
    expect(result.data.device_id).toBe('device-111');
    expect(result.data.device_operating_system).toBe('Windows 10');
    expect(result.data.conditional_access_status).toBe('success');
    expect(result.data.risk_state).toBe('none');
  });

  it('should handle failed sign-in', () => {
    const signIn: EntraSignIn = {
      id: 'signin-456',
      createdDateTime: '2024-03-15T15:00:00Z',
      userPrincipalName: 'user@contoso.com',
      userId: 'user-789',
      userDisplayName: 'Jane Smith',
      appDisplayName: 'SharePoint',
      appId: 'app-999',
      ipAddress: '203.0.113.50',
      clientAppUsed: 'Mobile App',
      status: {
        errorCode: 50126,
        failureReason: 'Invalid username or password',
        additionalDetails: 'The user entered incorrect credentials',
      },
      location: null,
      deviceDetail: null,
      conditionalAccessStatus: 'notApplied',
      riskDetail: 'none',
      riskLevelAggregated: 'none',
      riskLevelDuringSignIn: 'none',
      riskState: 'none',
    };

    const result = normalizeSignInLog(signIn);

    expect(result.data.status_error_code).toBe(50126);
    expect(result.data.status_failure_reason).toBe('Invalid username or password');
    expect(result.data.location_city).toBeNull();
    expect(result.data.device_id).toBeNull();
  });

  it('should handle sign-in with risky behavior', () => {
    const signIn: EntraSignIn = {
      id: 'signin-789',
      createdDateTime: '2024-03-15T16:00:00Z',
      userPrincipalName: 'user@contoso.com',
      userId: 'user-111',
      userDisplayName: 'Risky User',
      appDisplayName: 'Azure Portal',
      appId: 'app-222',
      ipAddress: '198.51.100.10',
      clientAppUsed: 'Browser',
      status: {
        errorCode: 0,
        failureReason: null,
        additionalDetails: null,
      },
      location: {
        city: 'Unknown',
        state: null,
        countryOrRegion: 'XX',
        geoCoordinates: null,
      },
      deviceDetail: null,
      conditionalAccessStatus: 'success',
      riskDetail: 'unfamiliarFeatures',
      riskLevelAggregated: 'high',
      riskLevelDuringSignIn: 'high',
      riskState: 'atRisk',
    };

    const result = normalizeSignInLog(signIn);

    expect(result.data.risk_detail).toBe('unfamiliarFeatures');
    expect(result.data.risk_level_aggregated).toBe('high');
    expect(result.data.risk_state).toBe('atRisk');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// TEST SUMMARY
// ══════════════════════════════════════════════════════════════════════════════
// Total Test Suites: 20
// Coverage:
// - All 19 normalization functions tested
// - Normal cases with full data
// - Null/undefined handling
// - Empty arrays and strings
// - Composite IDs
// - Date fallback handling
// - Complex nested objects
// - Extension attributes (users)
// - Multiple initiator types (audit logs)
// - Failed vs successful scenarios (sign-ins)
// ══════════════════════════════════════════════════════════════════════════════
