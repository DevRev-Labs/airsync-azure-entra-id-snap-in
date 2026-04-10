/**
 * Data Normalization Module for Azure Entra ID Connector
 *
 * This module transforms raw Microsoft Graph API responses into a standardized format
 * for storage in DevRev's data model. Each normalization function converts entity-specific
 * data from Azure Entra ID into a common structure.
 *
 * Purpose:
 * - Convert Microsoft Graph API entities into DevRev-compatible format
 * - Extract relevant fields from complex nested structures
 * - Provide consistent fallback values for missing data
 * - Generate deep links to Azure Portal for each entity
 * - Handle dynamic extension attributes for users
 * - Flatten complex nested objects into flat key-value pairs
 *
 * Architecture:
 * Each entity type has a dedicated normalization function that:
 * 1. Accepts the raw entity from Microsoft Graph API
 * 2. Extracts and transforms relevant fields
 * 3. Returns a NormalizedItem with standardized structure
 *
 * Supported Entities (19 types):
 * - Users, Groups, Group Members
 * - Directory Roles, Role Members
 * - Applications, Service Principals
 * - Devices, Organizational Contacts
 * - App Roles, App Role Assignments
 * - Authentication Methods, MFA Policies
 * - License Assignments
 * - PIM Eligible Roles
 * - Conditional Access Policies
 * - Lifecycle Workflows
 * - Directory Audit Logs, Sign-In Logs
 */

// Import all Microsoft Graph API entity type definitions
import {
  EntraApplication,
  EntraDevice,
  EntraDirectoryRole,
  EntraDirectoryRoleMember,
  EntraOrgContact,
  EntraServicePrincipal,
  EntraUser,
  EntraGroup,
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
} from './types';

/**
 * Normalized Item Interface
 *
 * Standard structure for all normalized entities sent to DevRev.
 * All normalization functions return this format.
 *
 * @property id - Unique identifier for the entity (must be globally unique)
 * @property created_date - ISO 8601 timestamp when entity was created
 * @property modified_date - ISO 8601 timestamp when entity was last modified
 * @property data - Key-value pairs containing entity-specific fields
 */
interface NormalizedItem {
  id: string; // Unique identifier for this entity
  created_date: string; // ISO 8601 timestamp of creation
  modified_date: string; // ISO 8601 timestamp of last modification
  data: Record<string, unknown>; // Entity-specific data fields
}

/**
 * Fallback Date Constant
 *
 * Used when Microsoft Graph API doesn't provide a created/modified date.
 * Set to Unix epoch (January 1, 1970) to indicate "unknown" date.
 * ISO 8601 format: "1970-01-01T00:00:00.000Z"
 */
const FALLBACK_DATE = new Date(0).toISOString();

/**
 * Azure Entra Admin Portal Base URL
 *
 * Used to construct deep links to Azure Portal for viewing entities.
 * All item_url_field values use this base URL with entity-specific paths.
 */
const ENTRA_ADMIN_URL = 'https://entra.microsoft.com';

/**
 * Normalize User Entity
 *
 * Transforms an Azure AD user object from Microsoft Graph API into DevRev format.
 * Handles standard user fields and dynamically includes custom extension attributes.
 *
 * Key Transformations:
 * - Constructs full_name from givenName and surname
 * - Prefers mail field over userPrincipalName for email
 * - Dynamically includes all extension_* custom attributes
 * - Uses createdDateTime for both created and modified dates
 *
 * Extension Attributes:
 * Azure AD allows custom attributes (e.g., extension_EmployeeID, extension_Department).
 * These are discovered during metadata extraction and included dynamically.
 *
 * @param user - Raw user object from Microsoft Graph /users endpoint
 * @returns Normalized item ready for DevRev ingestion
 *
 * @example
 * const rawUser = {
 *   id: '12345-67890',
 *   displayName: 'John Doe',
 *   givenName: 'John',
 *   surname: 'Doe',
 *   mail: 'john.doe@contoso.com',
 *   userPrincipalName: 'john@contoso.onmicrosoft.com',
 *   createdDateTime: '2024-01-01T00:00:00Z',
 *   extension_EmployeeID: '12345'
 * };
 * const normalized = normalizeUser(rawUser);
 */
export function normalizeUser(user: EntraUser): NormalizedItem {
  // Construct full name from first and last name, filter out null/undefined values
  const fullName = [user.givenName, user.surname].filter(Boolean).join(' ') || null;

  // Initialize data object with standard user fields
  const data: Record<string, unknown> = {
    display_name: user.displayName, // User's display name
    email: user.mail || user.userPrincipalName, // Prefer primary email, fallback to UPN
    full_name: fullName, // Constructed full name or null
  };

  // Dynamically include all custom extension attributes
  // Extension attributes have keys starting with 'extension_'
  for (const [key, value] of Object.entries(user)) {
    // Check if this is an extension attribute with a defined value
    if (key.startsWith('extension_') && value !== undefined) {
      // Add extension attribute to data object
      data[key] = value;
    }
  }

  // Return normalized item with standard structure
  return {
    id: user.id, // Unique Azure AD user ID (GUID)
    created_date: user.createdDateTime || FALLBACK_DATE, // When user was created
    modified_date: user.createdDateTime || FALLBACK_DATE, // Use creation date (Graph doesn't provide modified date)
    data, // All user data fields
  };
}

/**
 * Normalize Group Entity
 *
 * Transforms an Azure AD group (security group, Microsoft 365 group, or distribution list)
 * from Microsoft Graph API into DevRev format.
 *
 * Includes deep link to Azure Portal for easy navigation to group details.
 *
 * @param group - Raw group object from Microsoft Graph /groups endpoint
 * @returns Normalized item with group name, description, and portal link
 */
export function normalizeGroup(group: EntraGroup): NormalizedItem {
  return {
    id: group.id, // Unique Azure AD group ID (GUID)
    created_date: group.createdDateTime || FALLBACK_DATE, // When group was created
    modified_date: group.createdDateTime || FALLBACK_DATE, // Use creation date as modified date
    data: {
      name: group.displayName, // Group display name
      description: group.description ?? null, // Group description (may be null)
      item_url_field: `${ENTRA_ADMIN_URL}/#view/Microsoft_AAD_IAM/GroupDetailsMenuBlade/~/Overview/groupId/${group.id}`,
    },
  };
}

/**
 * Normalize Group Member Relationship
 *
 * Represents a membership relationship between a group and a member (user, group, or service principal).
 * Creates a composite ID from group and member IDs to ensure uniqueness.
 *
 * Note: Group membership doesn't have creation timestamps in Microsoft Graph,
 * so we use FALLBACK_DATE for both created_date and modified_date.
 *
 * @param member - Raw member object from Microsoft Graph /groups/{id}/members endpoint
 * @param groupId - The group ID this member belongs to
 * @returns Normalized relationship item linking member to group
 */
export function normalizeGroupMember(
  member: EntraDirectoryRoleMember,
  groupId: string
): NormalizedItem {
  return {
    // Composite ID ensures uniqueness: "groupId_memberId" (underscore separator)
    id: `${groupId}_${member.id}`,
    // Graph API doesn't provide membership timestamps
    created_date: FALLBACK_DATE,
    modified_date: FALLBACK_DATE,
    data: {
      member_id: member.id, // ID of the member (user/group/service principal)
      group_id: groupId, // ID of the parent group
    },
  };
}

/**
 * Normalize Directory Role Entity
 *
 * Transforms an Azure AD directory role (admin role like Global Administrator,
 * User Administrator, etc.) from Microsoft Graph API into DevRev format.
 *
 * Directory Roles vs Role Templates:
 * - roleTemplateId: Refers to the immutable role definition
 * - id: The activated instance of that role in the tenant
 *
 * @param role - Raw role object from Microsoft Graph /directoryRoles endpoint
 * @returns Normalized item with role name, description, template ID, and portal link
 */
export function normalizeDirectoryRole(role: EntraDirectoryRole): NormalizedItem {
  return {
    id: role.id, // Unique role instance ID (GUID)
    // Directory roles don't have creation timestamps
    created_date: FALLBACK_DATE,
    modified_date: FALLBACK_DATE,
    data: {
      name: role.displayName, // Role display name (e.g., "Global Administrator") - legacy field
      display_name: role.displayName, // Role display name
      description: role.description ?? null, // Role description (may be null)
      role_template_id: role.roleTemplateId, // Immutable role template ID
      // Deep link to Azure Portal role details page
      item_url_field: `${ENTRA_ADMIN_URL}/#view/Microsoft_AAD_IAM/RoleMenuBlade/~/Overview/objectId/${role.id}`,
    },
  };
}

/**
 * Normalize Role Member Relationship
 *
 * Represents an assignment relationship between a directory role and a member.
 * Creates a composite ID from role and member IDs to ensure uniqueness.
 *
 * @param member - Raw member object from Microsoft Graph /directoryRoles/{id}/members endpoint
 * @param roleId - The directory role ID this member is assigned to
 * @returns Normalized relationship item linking member to role
 */
export function normalizeRoleMember(
  member: EntraDirectoryRoleMember,
  roleId: string
): NormalizedItem {
  // Extract member type from @odata.type (e.g., "#microsoft.graph.user" -> "user")
  const memberType = (member['@odata.type']?.split('.').pop() || 'unknown').toLowerCase();

  return {
    // Composite ID ensures uniqueness: "roleId_memberId" (underscore separator)
    id: `${roleId}_${member.id}`,
    // Graph API doesn't provide role assignment timestamps
    created_date: FALLBACK_DATE,
    modified_date: FALLBACK_DATE,
    data: {
      member_id: member.id, // ID of the assigned member (usually a user)
      role_id: roleId, // ID of the directory role
      member_type: memberType, // Type of member (user, group, serviceprincipal) - lowercase
      member_display_name: member.displayName ?? null, // Display name of member
    },
  };
}

/**
 * Normalize Application Entity
 *
 * Transforms an Azure AD application registration into DevRev format.
 *
 * Applications vs Service Principals:
 * - Application: The app registration/definition (can exist in multiple tenants)
 * - Service Principal: The local instance/identity of that app in this tenant
 *
 * Identifier URIs:
 * Applications can have multiple identifier URIs (App ID URIs). These are concatenated
 * into a comma-separated string for easier display.
 *
 * @param app - Raw application object from Microsoft Graph /applications endpoint
 * @returns Normalized item with app details and portal link
 */
export function normalizeApplication(app: EntraApplication): NormalizedItem {
  return {
    id: app.id, // Unique application object ID (GUID)
    created_date: app.createdDateTime || FALLBACK_DATE, // When app was registered
    modified_date: app.createdDateTime || FALLBACK_DATE, // Use creation date as modified date
    data: {
      display_name: app.displayName, // Application display name
      app_id: app.appId, // Application (Client) ID - immutable identifier
      sign_in_audience: app.signInAudience ?? null, // Who can sign in (e.g., "AzureADMyOrg", "AzureADMultipleOrgs")
      publisher_domain: app.publisherDomain ?? null, // Verified domain of the publisher
      // Convert identifier URIs array to comma-separated string for DevRev
      // Example: ["https://api.contoso.com", "https://contoso.com"] → "https://api.contoso.com, https://contoso.com"
      identifier_uris: app.identifierUris?.join(', ') ?? '',
      // Deep link to Azure Portal app registration page
      item_url_field: `${ENTRA_ADMIN_URL}/#view/Microsoft_AAD_IAM/ActiveDirectoryMenuBlade/~/RegisteredApps/appId/${app.appId}`,
    },
  };
}

/**
 * Normalize Service Principal Entity
 *
 * Transforms a service principal (enterprise application) into DevRev format.
 *
 * Service Principal Types:
 * - "Application": Regular app
 * - "ManagedIdentity": Azure-managed identity
 * - "Legacy": Legacy app
 *
 * A service principal is the local representation of an application in a specific tenant.
 * One application can have service principals in multiple tenants.
 *
 * @param sp - Raw service principal object from Microsoft Graph /servicePrincipals endpoint
 * @returns Normalized item with service principal details and portal link
 */
export function normalizeServicePrincipal(sp: EntraServicePrincipal): NormalizedItem {
  return {
    id: sp.id, // Unique service principal object ID (GUID)
    created_date: sp.createdDateTime || FALLBACK_DATE, // When service principal was created
    modified_date: sp.createdDateTime || FALLBACK_DATE, // Use creation date as modified date
    data: {
      display_name: sp.displayName, // Service principal display name
      app_id: sp.appId, // Associated application (client) ID
      service_principal_type: sp.servicePrincipalType, // Type: Application, ManagedIdentity, or Legacy
      account_enabled: sp.accountEnabled, // Whether the service principal is enabled
      app_owner_organization_id: sp.appOwnerOrganizationId, // Tenant ID of the app owner
      // Deep link to Azure Portal enterprise app page
      item_url_field: `${ENTRA_ADMIN_URL}/#view/Microsoft_AAD_IAM/ManagedAppMenuBlade/~/Overview/objectId/${sp.id}`,
    },
  };
}

/**
 * Normalize Device Entity
 *
 * Transforms an Azure AD registered device into DevRev format.
 * Includes device compliance status, management state, and owner information.
 *
 * Trust Types:
 * - "AzureAd": Azure AD joined device
 * - "Workplace": Azure AD registered (BYOD)
 * - "ServerAd": Hybrid Azure AD joined
 *
 * Modified Date Logic:
 * Uses approximateLastSignInDateTime as modified date if available,
 * otherwise falls back to registrationDateTime.
 *
 * @param device - Raw device object from Microsoft Graph /devices endpoint
 * @returns Normalized item with device details including owner information
 */
export function normalizeDevice(device: EntraDevice): NormalizedItem {
  return {
    id: device.id, // Unique device object ID (GUID)
    created_date: device.registrationDateTime || FALLBACK_DATE, // When device was registered
    // Use last sign-in as modified date, fallback to registration date
    modified_date: device.approximateLastSignInDateTime || device.registrationDateTime || FALLBACK_DATE,
    data: {
      display_name: device.displayName, // Device display name
      operating_system: device.operatingSystem, // OS type (e.g., "Windows", "iOS")
      operating_system_version: device.operatingSystemVersion, // OS version string
      trust_type: device.trustType, // How device is joined to Azure AD
      is_compliant: device.isCompliant, // Whether device meets compliance policies
      is_managed: device.isManaged, // Whether device is managed by Intune/MDM
      device_id: device.deviceId, // Device-specific unique ID
      registration_date_time: device.registrationDateTime, // Registration timestamp
      // Additional device hardware details (may be null)
      manufacturer: device.manufacturer || null, // Device manufacturer (e.g., "Dell", "Apple")
      model: device.model || null, // Device model (e.g., "Surface Pro 9")
      profile_type: device.profileType || null, // Device profile type
      // Owner information (populated from separate API call)
      registered_owner_id: device.registeredOwnerId || null, // Owner's user ID
      registered_owner_email: device.registeredOwnerEmail || null, // Owner's email
      registered_owner_display_name: device.registeredOwnerDisplayName || null, // Owner's display name
    },
  };
}

/**
 * Normalize Organizational Contact Entity
 *
 * Transforms an Azure AD organizational contact (external contact not in directory)
 * into DevRev format. Similar to users but represents external contacts.
 *
 * Organizational contacts are typically imported from on-premises directories
 * and represent people outside the organization.
 *
 * @param contact - Raw contact object from Microsoft Graph /contacts endpoint
 * @returns Normalized item with contact details
 */
export function normalizeOrgContact(contact: EntraOrgContact): NormalizedItem {
  // Construct full name from first and last name, filter out null values
  const fullName = [contact.givenName, contact.surname].filter(Boolean).join(' ') || null;

  return {
    id: contact.id, // Unique contact object ID (GUID)
    created_date: contact.createdDateTime || FALLBACK_DATE, // When contact was created
    modified_date: contact.createdDateTime || FALLBACK_DATE, // Use creation date as modified date
    data: {
      display_name: contact.displayName, // Contact display name
      mail: contact.mail ?? null, // Contact email address
      given_name: contact.givenName ?? null, // Contact first/given name
      surname: contact.surname ?? null, // Contact last/surname
      email: contact.mail ?? null, // Contact email address (legacy field name)
      full_name: fullName, // Constructed full name or null
    },
  };
}

/**
 * Normalize App Role Entity
 *
 * Transforms an application role (permission) defined by a service principal.
 * App roles define permissions that can be assigned to users or groups.
 *
 * Allowed Member Types:
 * - "User": Can be assigned to individual users
 * - "Application": Can be assigned to other applications
 * - Both can be specified for flexible assignment
 *
 * Composite ID: Created from servicePrincipalId and appRoleId to ensure uniqueness.
 *
 * @param appRole - Raw app role from service principal's appRoles property
 * @param servicePrincipalId - The service principal ID that defines this role
 * @returns Normalized item representing an app role definition
 */
export function normalizeAppRole(appRole: EntraAppRole, servicePrincipalId: string): NormalizedItem {
  return {
    // Composite ID: "servicePrincipalId_appRoleId" (underscore separator)
    id: `${servicePrincipalId}_${appRole.id}`,
    // App roles don't have timestamps
    created_date: FALLBACK_DATE,
    modified_date: FALLBACK_DATE,
    data: {
      app_role_id: appRole.id, // Unique app role ID (GUID)
      service_principal_id: servicePrincipalId, // Parent service principal ID
      display_name: appRole.displayName, // Role display name (e.g., "User.Read")
      description: appRole.description ?? null, // Role description explaining what it allows
      value: appRole.value ?? null, // Role value/claim that appears in tokens
      is_enabled: appRole.isEnabled ?? null, // Whether the role is currently enabled
      // Convert allowed member types array to comma-separated string for DevRev
      // Example: ["User", "Application"] → "User, Application"
      allowed_member_types: appRole.allowedMemberTypes?.join(', ') ?? '',
    },
  };
}

/**
 * Normalize App Role Assignment Entity
 *
 * Represents the assignment of an app role to a principal (user, group, or service principal).
 * Tracks who has what permissions for which application.
 *
 * Assignment Structure:
 * - Principal: The entity receiving the permission (user/group/SP)
 * - Resource: The application providing the permission (service principal)
 * - App Role: The specific permission being granted
 *
 * @param assignment - Raw app role assignment from /servicePrincipals/{id}/appRoleAssignedTo
 * @returns Normalized item representing a role assignment
 */
export function normalizeAppRoleAssignment(
  assignment: EntraAppRoleAssignment,
  appRoleNameMap?: Map<string, string>
): NormalizedItem {
  // Generate a meaningful display name for the assignment
  // Format: "Principal → Role @ Resource"
  const generateDisplayName = (): string => {
    const principalName = assignment.principalDisplayName || 'Unknown Principal';
    const resourceName = assignment.resourceDisplayName || 'Unknown Resource';

    // Look up app role name from the map if available
    const roleKey = `${assignment.resourceId}_${assignment.appRoleId}`;
    const roleName = appRoleNameMap?.get(roleKey) || appRoleNameMap?.get(assignment.appRoleId);

    if (roleName) {
      return `${principalName} → ${roleName} @ ${resourceName}`;
    }

    // Fallback: use resource name and principal name
    return `${principalName} → ${resourceName}`;
  };

  const displayName = generateDisplayName();

  return {
    id: assignment.id, // Unique assignment ID (GUID)
    created_date: assignment.createdDateTime || FALLBACK_DATE, // When assignment was created
    modified_date: assignment.createdDateTime || FALLBACK_DATE, // Use creation date as modified date
    data: {
      display_name: displayName, // Human-readable title shown in DevRev UI
      principal_id: assignment.principalId, // ID of user/group/SP receiving the role
      principal_type: assignment.principalType, // Type: "User", "Group", or "ServicePrincipal"
      principal_display_name: assignment.principalDisplayName, // Display name of the principal
      resource_id: assignment.resourceId, // ID of the service principal providing the role
      resource_display_name: assignment.resourceDisplayName, // Display name of the resource app
      app_role_id: assignment.appRoleId, // ID of the app role being assigned
      app_role_name: appRoleNameMap?.get(`${assignment.resourceId}_${assignment.appRoleId}`) ||
                     appRoleNameMap?.get(assignment.appRoleId) || null, // Resolved app role name for easy reference
    },
  };
}

/**
 * Normalize Authentication Method Entity
 *
 * Transforms a user's registered authentication method (MFA method) into DevRev format.
 * Tracks the various ways a user can prove their identity during sign-in.
 *
 * Authentication Method Types (from @odata.type):
 * - phoneAuthenticationMethod: Phone number for SMS/call
 * - microsoftAuthenticatorAuthenticationMethod: Microsoft Authenticator app
 * - emailAuthenticationMethod: Email address
 * - fido2AuthenticationMethod: FIDO2 security key
 * - windowsHelloForBusinessAuthenticationMethod: Windows Hello
 * - passwordAuthenticationMethod: Password
 * - softwareOathAuthenticationMethod: Third-party authenticator app
 *
 * The method type is extracted from the @odata.type field by taking the last
 * part after the final dot (e.g., "microsoft.graph.phoneAuthenticationMethod" → "phoneAuthenticationMethod").
 *
 * @param method - Raw authentication method from /users/{id}/authentication/methods
 * @param userId - The user ID this method belongs to
 * @returns Normalized item representing a user's authentication method
 */
export function normalizeAuthenticationMethod(
  method: EntraAuthenticationMethod,
  userId: string,
  userDisplayName?: string
): NormalizedItem {
  // Extract method type from @odata.type field (keep camelCase for enum matching)
  // Example: "microsoft.graph.phoneAuthenticationMethod" → "phoneAuthenticationMethod"
  const methodType = method['@odata.type']?.split('.').pop() || 'unknown';

  // Generate user-friendly title based on method type
  // This provides better readability in DevRev UI when display_name is empty
  const generateTitle = (): string => {
    // Map method types to human-readable titles (using camelCase keys)
    const methodTypeTitles: Record<string, string> = {
      phoneAuthenticationMethod: 'Phone Authentication',
      microsoftAuthenticatorAuthenticationMethod: 'Microsoft Authenticator',
      emailAuthenticationMethod: 'Email Authentication',
      fido2AuthenticationMethod: 'FIDO2 Security Key',
      windowsHelloForBusinessAuthenticationMethod: 'Windows Hello',
      passwordAuthenticationMethod: 'Password',
      softwareOathAuthenticationMethod: 'Authenticator App (OATH)',
      temporaryAccessPassAuthenticationMethod: 'Temporary Access Pass',
    };

    const baseMethodName = methodTypeTitles[methodType] ||
      `${methodType.replace('AuthenticationMethod', '')} Authentication`;

    // If we have displayName from the method, use it
    if (method.displayName) {
      return method.displayName;
    }

    // Add phone number to title for phone methods
    if (method.phoneNumber) {
      return `${baseMethodName} (${method.phoneNumber})`;
    }

    // Add user display name if available for better context
    if (userDisplayName) {
      return `${baseMethodName} - ${userDisplayName}`;
    }

    // Return base method name
    return baseMethodName;
  };

  // Use generateTitle() as the display_name - this is what DevRev will show as the entity title
  const displayName = generateTitle();

  return {
    // Composite ID: "userId_methodId" ensures uniqueness (underscore separator)
    id: `${userId}_${method.id}`,
    created_date: method.createdDateTime || FALLBACK_DATE, // When method was registered
    modified_date: method.createdDateTime || FALLBACK_DATE, // Use creation date as modified date
    data: {
      user_id: userId, // ID of the user who owns this method
      user_display_name: userDisplayName ?? null, // Display name of the user who owns this method
      method_id: method.id, // Unique method ID
      method_type: methodType, // Type of authentication method (camelCase to match EDM enum)
      display_name: displayName, // Human-readable title shown in DevRev UI
      device_tag: method.deviceTag ?? null, // Device tag (for authenticator apps)
      phone_app_version: method.phoneAppVersion ?? null, // Authenticator app version
      phone_number: method.phoneNumber ?? null, // Phone number (for SMS/call methods)
      phone_type: method.phoneType ?? null, // Phone type: "mobile", "alternateMobile", "office"
    },
  };
}

/**
 * Normalize Authentication Methods Policy Entity
 *
 * Transforms the tenant-wide authentication methods policy into DevRev format.
 * This policy controls which MFA methods are enabled/disabled for the entire tenant
 * and defines registration enforcement campaigns.
 *
 * Policy Structure:
 * - authenticationMethodConfigurations: List of available auth methods and their states
 * - registrationEnforcement: Campaign to nudge users to register MFA methods
 *
 * Registration Enforcement Campaign:
 * Administrators can run campaigns to encourage users to register additional
 * authentication methods (e.g., push users to set up Microsoft Authenticator).
 * Users can snooze the prompt for a configurable number of days.
 *
 * Method Name Extraction:
 * Each configuration has an @odata.type like "microsoft.graph.fido2AuthenticationMethodConfiguration".
 * We extract the method name by matching the pattern before "AuthenticationMethodConfiguration"
 * (e.g., "fido2AuthenticationMethodConfiguration" → "fido2").
 *
 * @param policy - Raw authentication methods policy from /policies/authenticationMethodsPolicy
 * @returns Normalized item with policy settings and enabled/disabled method summaries
 */
export function normalizeAuthenticationMethodsPolicy(
  policy: EntraAuthenticationMethodsPolicy
): NormalizedItem {
  // Extract registration enforcement campaign details
  // This campaign nudges users to register additional auth methods
  const regEnforcement = policy.registrationEnforcement?.authenticationMethodsRegistrationCampaign;

  // Number of days users can snooze the registration prompt
  const snoozeDays = regEnforcement?.snoozeDurationInDays || null;

  // Campaign state: "enabled" or "disabled"
  const campaignState = regEnforcement?.state || null;

  // Extract target information (who the campaign applies to)
  // Usually targets "all users" or specific groups
  const includeTarget = regEnforcement?.includeTargets?.[0];
  const includeTargetId = includeTarget?.id || null; // Target group/user ID or "all_users"
  const includeTargetType = includeTarget?.targetType || null; // "group", "user", or "unknownFutureValue"
  const targetedAuthMethod = includeTarget?.targetedAuthenticationMethod || null; // Which method to promote

  // Extract and summarize enabled authentication methods
  // Filter configurations where state === 'enabled' and extract method names
  const enabledMethods =
    policy.authenticationMethodConfigurations
      ?.filter((config) => config.state === 'enabled') // Only enabled methods
      .map((config) => {
        // Extract method type from @odata.type
        const type = config['@odata.type'] || '';
        // Match pattern: "microsoft.graph.{methodName}AuthenticationMethodConfiguration"
        const match = type.match(/\.(\w+)AuthenticationMethodConfiguration$/);
        // Return method name or fallback to config ID
        return match ? match[1] : config.id;
      })
      .filter(Boolean) // Remove null/undefined values
      .join(', ') || null; // Concatenate into comma-separated string

  // Extract and summarize disabled authentication methods
  // Same logic as enabled methods but filter for state === 'disabled'
  const disabledMethods =
    policy.authenticationMethodConfigurations
      ?.filter((config) => config.state === 'disabled') // Only disabled methods
      .map((config) => {
        const type = config['@odata.type'] || '';
        const match = type.match(/\.(\w+)AuthenticationMethodConfiguration$/);
        return match ? match[1] : config.id;
      })
      .filter(Boolean)
      .join(', ') || null;

  // Count total number of method configurations (enabled + disabled)
  const totalConfigurations = policy.authenticationMethodConfigurations?.length || 0;

  return {
    id: policy.id, // Policy ID (typically a constant GUID)
    // Policies don't have creation timestamps
    created_date: FALLBACK_DATE,
    modified_date: FALLBACK_DATE,
    data: {
      display_name: policy.displayName, // Policy display name
      // Registration enforcement object (stringified as rich_text for DevRev EDM)
      registration_enforcement: policy.registrationEnforcement
        ? JSON.stringify(policy.registrationEnforcement, null, 2)
        : null,
      // Authentication method configurations array (stringified as rich_text for DevRev EDM)
      authentication_method_configurations: policy.authenticationMethodConfigurations
        ? JSON.stringify(policy.authenticationMethodConfigurations, null, 2)
        : null,
      // Registration enforcement campaign fields (flattened for easy querying)
      registration_campaign_state: campaignState, // Campaign enabled/disabled
      registration_snooze_days: snoozeDays, // Days users can snooze prompt
      registration_include_target_id: includeTargetId, // Who is targeted
      registration_include_target_type: includeTargetType, // Type of target
      registration_targeted_auth_method: targetedAuthMethod, // Which method to promote
      // Authentication method availability summaries
      enabled_auth_methods: enabledMethods, // Comma-separated list of enabled methods
      disabled_auth_methods: disabledMethods, // Comma-separated list of disabled methods
      total_auth_method_configurations: totalConfigurations, // Total count
    },
  };
}

/**
 * Normalize License Assignment Entity
 *
 * Transforms a user's license assignment into DevRev format.
 * Microsoft 365/Azure licenses consist of a SKU (e.g., "Office 365 E3")
 * and multiple service plans (e.g., "Exchange Online", "SharePoint Online").
 *
 * License Structure:
 * - SKU: The license package (e.g., "ENTERPRISEPACK" for Office 365 E3)
 * - Service Plans: Individual services included in the SKU
 *
 * Service Plan Provisioning Status:
 * - "Success": Service is provisioned and active
 * - "Disabled": Service is disabled (admin disabled or not included)
 * - "PendingInput": Waiting for user action
 * - "PendingActivation": Service is being activated
 * - "PendingProvisioning": Service is being provisioned
 *
 * Data Flattening:
 * Instead of storing nested arrays of service plans, this function:
 * 1. Counts plans by status (success, disabled, pending)
 * 2. Concatenates active/disabled service plan names into strings
 * 3. Provides summary metrics for easier querying
 *
 * @param license - Raw license details from /users/{id}/licenseDetails
 * @param userId - The user ID this license is assigned to
 * @returns Normalized item with license and service plan summaries
 */
export function normalizeLicenseAssignment(
  license: EntraLicenseDetails,
  userId: string
): NormalizedItem {
  // Calculate service plan counts by provisioning status

  // Total number of service plans in this license
  const totalPlans = license.servicePlans?.length || 0;

  // Count successfully provisioned (active) service plans
  const successPlans = license.servicePlans?.filter((plan) => plan.provisioningStatus === 'Success').length || 0;

  // Count disabled service plans
  const disabledPlans = license.servicePlans?.filter((plan) => plan.provisioningStatus === 'Disabled').length || 0;

  // Count pending service plans (any pending state)
  const pendingPlans =
    license.servicePlans?.filter(
      (plan) =>
        plan.provisioningStatus === 'PendingInput' ||
        plan.provisioningStatus === 'PendingActivation' ||
        plan.provisioningStatus === 'PendingProvisioning'
    ).length || 0;

  // Extract list of active service plan names
  // Filter for successfully provisioned plans and concatenate names
  const activeServicePlans =
    license.servicePlans
      ?.filter((plan) => plan.provisioningStatus === 'Success') // Only active plans
      .map((plan) => plan.servicePlanName) // Extract plan names
      .filter(Boolean) // Remove null/undefined
      .join(', ') || null; // Concatenate into comma-separated string

  // Extract list of disabled service plan names
  // Same logic as active but for disabled plans
  const disabledServicePlans =
    license.servicePlans
      ?.filter((plan) => plan.provisioningStatus === 'Disabled') // Only disabled plans
      .map((plan) => plan.servicePlanName) // Extract plan names
      .filter(Boolean) // Remove null/undefined
      .join(', ') || null; // Concatenate into comma-separated string

  return {
    // Composite ID: "userId_licenseId" ensures uniqueness (underscore separator)
    id: `${userId}_${license.id}`,
    // License assignments don't have timestamps in Graph API
    created_date: FALLBACK_DATE,
    modified_date: FALLBACK_DATE,
    data: {
      user_id: userId, // ID of the user who has this license
      license_id: license.id, // License assignment ID (GUID)
      sku_id: license.skuId, // License SKU ID (GUID)
      sku_part_number: license.skuPartNumber ?? null, // Human-readable SKU name (e.g., "ENTERPRISEPACK")
      // Service plans array (for nested structure access)
      service_plans: license.servicePlans ?? [],
      // Service plan summaries for easy querying
      active_service_plans: activeServicePlans, // Comma-separated list of active plans
      disabled_service_plans: disabledServicePlans, // Comma-separated list of disabled plans
      total_service_plans: totalPlans, // Total count of all plans
      success_service_plans_count: successPlans, // Count of active plans
      disabled_service_plans_count: disabledPlans, // Count of disabled plans
      pending_service_plans_count: pendingPlans, // Count of pending plans
    },
  };
}

/**
 * Normalize PIM Eligible Role Entity
 *
 * Transforms a Privileged Identity Management (PIM) role eligibility schedule into DevRev format.
 *
 * PIM Overview:
 * Privileged Identity Management allows just-in-time privileged access by making users
 * "eligible" for roles rather than permanently assigned. Users must activate their
 * eligible roles when needed, providing justification and MFA.
 *
 * Requirements:
 * - Requires Azure AD Premium P2 license
 * - Helps implement Zero Standing Privilege and least privilege access
 *
 * Schedule Structure:
 * - Start Date: When eligibility begins
 * - End Date: When eligibility expires
 * - Expiration Type: "noExpiration", "afterDuration", "afterDateTime"
 * - Duration: ISO 8601 duration (e.g., "PT8H" for 8 hours)
 *
 * The scheduleInfo and expiration objects use 'any' type because Microsoft Graph
 * API returns complex nested structures that vary by configuration.
 *
 * @param schedule - Raw PIM role eligibility schedule from /roleManagement/directory/roleEligibilitySchedules
 * @returns Normalized item with eligibility details and schedule information
 */
export function normalizePIMEligibleRole(schedule: EntraPIMRoleEligibilitySchedule): NormalizedItem {
  // Extract schedule information (type assertion needed for complex nested object)
  const scheduleInfo = schedule.scheduleInfo as any;

  // Extract expiration details from schedule
  const expiration = scheduleInfo?.expiration;

  // Extract schedule date range
  // When does eligibility start?
  const scheduleStartDateTime = scheduleInfo?.startDateTime || null;

  // When does eligibility end?
  const scheduleEndDateTime = expiration?.endDateTime || null;

  // Extract expiration configuration
  // Type of expiration: "noExpiration", "afterDuration", "afterDateTime"
  const expirationType = expiration?.type || null;

  // Duration for time-limited eligibility (ISO 8601 format like "PT8H" for 8 hours)
  const expirationDuration = expiration?.duration || null;

  return {
    id: schedule.id, // Unique schedule ID (GUID)
    created_date: schedule.createdDateTime || FALLBACK_DATE, // When schedule was created
    modified_date: schedule.createdDateTime || FALLBACK_DATE, // Use creation date as modified date
    data: {
      principal_id: schedule.principalId, // ID of user/group eligible for the role
      role_definition_id: schedule.roleDefinitionId, // ID of the directory role
      directory_scope_id: schedule.directoryScopeId ?? null, // Scope of the role (typically "/" for directory)
      status: schedule.status ?? null, // Status: "Provisioned", "Revoked", etc.
      // Schedule info object (for nested structure access)
      schedule_info: schedule.scheduleInfo ?? null,
      // Schedule timing information (flattened for easy querying)
      schedule_start_date_time: scheduleStartDateTime, // When eligibility begins
      schedule_end_date_time: scheduleEndDateTime, // When eligibility ends (null if permanent)
      expiration_type: expirationType, // How expiration is configured
      expiration_duration: expirationDuration, // Duration if using afterDuration type
    },
  };
}

/**
 * Normalize Conditional Access Policy Entity
 *
 * Transforms a Conditional Access policy into DevRev format.
 *
 * Conditional Access Overview:
 * Conditional Access is Azure AD's policy engine for access control. It evaluates
 * signals (who, what, where) to make decisions and enforce organizational policies.
 *
 * Policy Structure:
 * - Conditions: Define when the policy applies (users, apps, locations, platforms, client apps)
 * - Grant Controls: What must be satisfied to grant access (MFA, compliant device, approved app, etc.)
 * - Session Controls: Ongoing session requirements (sign-in frequency, persistent browser, app restrictions)
 *
 * Common Use Cases:
 * - Require MFA for admins
 * - Block access from untrusted locations
 * - Require compliant devices for corporate apps
 * - Enforce terms of use
 *
 * Policy State:
 * - "enabled": Policy is active
 * - "disabled": Policy exists but is not enforced
 * - "enabledForReportingButNotEnforced": Report-only mode (logs but doesn't block)
 *
 * Flattening Strategy:
 * Conditional Access policies have deeply nested structures. This function extracts
 * and flattens key fields into readable, comma-separated strings for easier querying.
 *
 * @param policy - Raw conditional access policy from /identity/conditionalAccess/policies
 * @returns Normalized item with flattened policy conditions and controls
 */
export function normalizeConditionalAccessPolicy(policy: EntraConditionalAccessPolicy): NormalizedItem {
  // Extract nested condition objects (using 'any' due to complex Graph API structure)
  const conditions = policy.conditions as any;
  const grantControls = policy.grantControls as any;
  const sessionControls = policy.sessionControls as any;

  // ── Extract User Conditions ─────────────────────────────────────────────
  // Who does this policy apply to?

  // Users to include (can be "All", "GuestsOrExternalUsers", or specific user IDs)
  const includeUsers = conditions?.users?.includeUsers?.join(', ') || null;

  // Users to exclude from policy
  const excludeUsers = conditions?.users?.excludeUsers?.join(', ') || null;

  // Groups to include (group IDs)
  const includeGroups = conditions?.users?.includeGroups?.join(', ') || null;

  // Groups to exclude from policy
  const excludeGroups = conditions?.users?.excludeGroups?.join(', ') || null;

  // Directory roles to include (role template IDs)
  const includeRoles = conditions?.users?.includeRoles?.join(', ') || null;

  // Directory roles to exclude from policy
  const excludeRoles = conditions?.users?.excludeRoles?.join(', ') || null;

  // ── Extract Application Conditions ──────────────────────────────────────
  // Which apps does this policy apply to?

  // Applications to include (can be "All", "Office365", or specific app IDs)
  const includeApplications = conditions?.applications?.includeApplications?.join(', ') || null;

  // Applications to exclude from policy
  const excludeApplications = conditions?.applications?.excludeApplications?.join(', ') || null;

  // ── Extract Platform Conditions ─────────────────────────────────────────
  // Which device platforms does this policy apply to?

  // Platforms to include (e.g., "windows", "macOS", "iOS", "android", "linux")
  const includePlatforms = conditions?.platforms?.includePlatforms?.join(', ') || null;

  // Platforms to exclude from policy
  const excludePlatforms = conditions?.platforms?.excludePlatforms?.join(', ') || null;

  // ── Extract Location Conditions ─────────────────────────────────────────
  // Where (network locations) does this policy apply from?

  // Locations to include (can be "All", "AllTrusted", or named location IDs)
  const includeLocations = conditions?.locations?.includeLocations?.join(', ') || null;

  // Locations to exclude from policy (e.g., corporate networks)
  const excludeLocations = conditions?.locations?.excludeLocations?.join(', ') || null;

  // ── Extract Client App Type Conditions ──────────────────────────────────
  // Which client application types does this policy apply to?

  // Client app types (e.g., "browser", "mobileAppsAndDesktopClients", "exchangeActiveSync")
  const clientAppTypes = conditions?.clientAppTypes?.join(', ') || null;

  // ── Extract Grant Controls ──────────────────────────────────────────────
  // What must be satisfied to grant access?

  // Built-in controls required (e.g., "mfa", "compliantDevice", "domainJoinedDevice", "approvedApplication")
  const builtInControls = grantControls?.builtInControls?.join(', ') || null;

  // Operator for multiple controls: "AND" (all required) or "OR" (any one required)
  const grantOperator = grantControls?.operator || null;

  // ── Extract Session Controls ────────────────────────────────────────────
  // What ongoing session restrictions apply after access is granted?

  // Sign-in frequency value (e.g., 1, 4, 8)
  const signInFrequencyValue = sessionControls?.signInFrequency?.value || null;

  // Sign-in frequency type ("hours" or "days")
  const signInFrequencyType = sessionControls?.signInFrequency?.type || null;

  // Persistent browser mode ("always" or "never")
  const persistentBrowserMode = sessionControls?.persistentBrowser?.mode || null;

  return {
    id: policy.id, // Unique policy ID (GUID)
    created_date: policy.createdDateTime || FALLBACK_DATE, // When policy was created
    // Use last modified date if available, otherwise fall back to creation date
    modified_date: policy.modifiedDateTime || policy.createdDateTime || FALLBACK_DATE,
    data: {
      display_name: policy.displayName, // Policy display name
      state: policy.state ?? null, // Policy state: "enabled", "disabled", or "enabledForReportingButNotEnforced"
      // Condition and control objects (for nested structure access)
      conditions: policy.conditions ?? null,
      grant_controls: policy.grantControls ?? null,
      session_controls: policy.sessionControls ?? null,
      // Flattened user condition fields (for easy querying)
      include_users: includeUsers, // Comma-separated list of included users
      exclude_users: excludeUsers, // Comma-separated list of excluded users
      include_groups: includeGroups, // Comma-separated list of included groups
      exclude_groups: excludeGroups, // Comma-separated list of excluded groups
      include_roles: includeRoles, // Comma-separated list of included roles
      exclude_roles: excludeRoles, // Comma-separated list of excluded roles
      // Flattened application condition fields
      include_applications: includeApplications, // Comma-separated list of included apps
      exclude_applications: excludeApplications, // Comma-separated list of excluded apps
      // Flattened platform condition fields
      include_platforms: includePlatforms, // Comma-separated list of included platforms
      exclude_platforms: excludePlatforms, // Comma-separated list of excluded platforms
      // Flattened location condition fields
      include_locations: includeLocations, // Comma-separated list of included locations
      exclude_locations: excludeLocations, // Comma-separated list of excluded locations
      // Client app types
      client_app_types: clientAppTypes, // Comma-separated list of client app types
      // Grant control fields
      grant_built_in_controls: builtInControls, // Comma-separated list of required controls
      grant_operator: grantOperator, // "AND" or "OR" for multiple controls
      // Session control fields
      sign_in_frequency_value: signInFrequencyValue, // Re-authentication frequency value
      sign_in_frequency_type: signInFrequencyType, // Re-authentication frequency unit
      persistent_browser_mode: persistentBrowserMode, // Browser session persistence setting
      // Deep link to Azure Portal policy details page
      item_url_field: `${ENTRA_ADMIN_URL}/#view/Microsoft_AAD_ConditionalAccess/PolicyBlade/policyId/${policy.id}`,
    },
  };
}

/**
 * Normalize Lifecycle Workflow Entity
 *
 * Transforms an Azure AD lifecycle workflow into DevRev format.
 *
 * Lifecycle Workflows Overview:
 * Automate identity lifecycle processes like employee onboarding/offboarding.
 * Workflows are triggered based on time-based conditions (e.g., "30 days before employeeHireDate").
 *
 * Requirements:
 * - Requires Azure AD Governance license (part of Azure AD P2 or E5)
 * - Part of Microsoft Entra ID Governance suite
 *
 * Workflow Structure:
 * - Category: "joiner" (onboarding), "leaver" (offboarding), or "mover" (role change)
 * - Execution Conditions: When to trigger the workflow
 * - Tasks: Automated actions to perform (e.g., "Send welcome email", "Disable account")
 *
 * Trigger Types (from @odata.type):
 * - timeBasedAttribute: Trigger based on user attribute date (e.g., employeeHireDate, employeeLeaveDateTime)
 * - offsetInDays: Days before/after the attribute date to trigger (negative = before, positive = after)
 *
 * Task Flattening:
 * Workflows can have many tasks. We extract:
 * - Total task count
 * - Task types (concatenated)
 * - First 3 task names (sample of what workflow does)
 *
 * @param workflow - Raw lifecycle workflow from /identityGovernance/lifecycleWorkflows/workflows
 * @returns Normalized item with workflow details and task summaries
 */
export function normalizeLifecycleWorkflow(workflow: EntraLifecycleWorkflow): NormalizedItem {
  // Extract execution conditions (using 'any' due to complex Graph API structure)
  const executionConditions = workflow.executionConditions as any;

  // ── Extract Trigger/Execution Condition Details ─────────────────────────

  // Extract trigger scope from @odata.type
  // Example: "microsoft.graph.identityGovernance.triggerAndScopeBasedConditions" → "triggerAndScopeBasedConditions"
  const triggerScope = executionConditions?.['@odata.type']?.split('.').pop() || null;

  // Time-based attribute that triggers the workflow (e.g., "employeeHireDate", "employeeLeaveDateTime")
  const triggerTimeBasedAttribute = executionConditions?.timeBasedAttribute || null;

  // Days offset from the time-based attribute
  // Negative = trigger before the date, Positive = trigger after the date
  // Example: -7 means "7 days before hire date"
  const triggerOffsetInDays = executionConditions?.offsetInDays || null;

  // ── Extract Task Information ────────────────────────────────────────────

  // Total number of tasks in this workflow
  const taskCount = workflow.tasks?.length || 0;

  // Extract task types and concatenate into comma-separated string
  const taskTypes =
    workflow.tasks
      ?.map((task: any) => {
        // Try to get task type from taskDefinitionId or @odata.type
        const type = task.taskDefinitionId || task['@odata.type'];
        if (!type) return null;

        // Extract last segment of the type
        // Example: "microsoft.graph.identityGovernance.addToGroupsTask" → "addToGroupsTask"
        const match = type.match(/\.(\w+)$/);
        return match ? match[1] : type;
      })
      .filter(Boolean) // Remove null values
      .join(', ') || null; // Concatenate into comma-separated string

  // Get first 3 task display names as a sample
  // This gives a quick overview of what the workflow does
  const taskNames =
    workflow.tasks
      ?.slice(0, 3) // Take only first 3 tasks
      .map((task: any) => task.displayName)
      .filter(Boolean) // Remove null values
      .join(', ') || null; // Concatenate into comma-separated string

  return {
    id: workflow.id, // Unique workflow ID (GUID)
    created_date: workflow.createdDateTime || FALLBACK_DATE, // When workflow was created
    // Use last modified date if available, otherwise fall back to creation date
    modified_date: workflow.lastModifiedDateTime || workflow.createdDateTime || FALLBACK_DATE,
    data: {
      display_name: workflow.displayName, // Workflow display name
      description: workflow.description ?? null, // Workflow description
      category: workflow.category ?? null, // Workflow category: "joiner", "leaver", or "mover"
      is_enabled: workflow.isEnabled ?? null, // Whether workflow is currently active
      // Execution conditions and tasks (for nested structure access)
      execution_conditions: workflow.executionConditions ?? null,
      tasks: workflow.tasks ?? [],
      // Trigger/execution condition fields (flattened for easy querying)
      trigger_scope: triggerScope, // Type of trigger condition
      trigger_time_based_attribute: triggerTimeBasedAttribute, // Which date attribute triggers it
      trigger_offset_in_days: triggerOffsetInDays, // Days offset from trigger date
      // Task summary fields
      task_count: taskCount, // Total number of tasks
      task_types: taskTypes, // Comma-separated list of task types
      task_names: taskNames, // Comma-separated list of first 3 task names
    },
  };
}

/**
 * Normalize Directory Audit Log Entity
 *
 * Transforms a directory audit log entry into DevRev format.
 *
 * Directory Audit Logs Overview:
 * Track changes made to directory objects like users, groups, applications, and policies.
 * Essential for security monitoring, compliance auditing, and troubleshooting.
 *
 * Retention:
 * - Basic Azure AD: 7 days
 * - Azure AD Premium P1/P2: 30 days
 *
 * Common Activities:
 * - User created/updated/deleted
 * - Group created/membership changed
 * - Role assigned/removed
 * - Application registered/consent granted
 * - Policy changed
 *
 * Log Structure:
 * - Activity: What action was performed
 * - Initiated By: Who/what performed the action (user or application)
 * - Target Resources: What objects were affected
 * - Additional Details: Extra context (IP address, user agent, etc.)
 * - Result: Success or failure of the operation
 *
 * Flattening Strategy:
 * Audit logs have nested structures. This function:
 * - Extracts first target resource (most logs have one target)
 * - Converts additionalDetails array into key-value map
 * - Extracts commonly-used details (IP, user agent, invitation info)
 * - Provides clean, queryable fields
 *
 * @param audit - Raw directory audit log from /auditLogs/directoryAudits
 * @returns Normalized item with audit details and extracted fields
 */
export function normalizeDirectoryAudit(audit: EntraDirectoryAudit): NormalizedItem {
  // ── Extract Initiator Information ───────────────────────────────────────
  // Who or what performed this action?

  // User ID if action was performed by a user
  const initiatedByUserId = audit.initiatedBy?.user?.id || null;

  // Display name of the initiator (user or application)
  // Prefer user display name, fallback to app display name
  const initiatedByDisplayName = audit.initiatedBy?.user?.displayName || audit.initiatedBy?.app?.displayName || null;

  // ── Extract Target Resource Information ─────────────────────────────────
  // What object was affected by this action?
  // Most audit logs have one primary target, so we extract the first one

  // Get first target resource from array
  const firstTarget = audit.targetResources?.[0];

  // ID of the target object (user ID, group ID, etc.)
  const targetObjectId = firstTarget?.id || null;

  // Display name of the target object
  const targetDisplayName = firstTarget?.displayName || null;

  // Type of target object (e.g., "User", "Group", "Application", "ServicePrincipal")
  const targetType = firstTarget?.type || null;

  // User principal name if target is a user
  const targetUserPrincipalName = firstTarget?.userPrincipalName || null;

  // ── Extract Additional Details ──────────────────────────────────────────
  // Additional context provided as key-value pairs
  // Convert array of {key, value} objects into a map for easier access

  // Build map from additionalDetails array
  const additionalDetailsMap: Record<string, string> = {};
  if (audit.additionalDetails && Array.isArray(audit.additionalDetails)) {
    for (const detail of audit.additionalDetails) {
      // Only include entries that have both key and value
      if (detail.key && detail.value) {
        additionalDetailsMap[detail.key] = detail.value;
      }
    }
  }

  // Extract commonly-used additional detail fields

  // IP address where the action originated from
  const ipAddress = additionalDetailsMap['ipaddr'] || null;

  // User agent string (browser/client information)
  const userAgent = additionalDetailsMap['User-Agent'] || null;

  // Email address for invited users (B2B guest invitations)
  const invitedUserEmail = additionalDetailsMap['invitedUserEmailAddress'] || null;

  // Invitation ID for B2B guest invitations
  const invitationId = additionalDetailsMap['InvitationId'] || null;

  // Serialize target resources to JSON string for schema compatibility
  // The array structure may not be accepted by domain metadata validators
  const targetResourcesJson = audit.targetResources && audit.targetResources.length > 0
    ? JSON.stringify(audit.targetResources)
    : null;

  // Count of target resources affected by this audit event
  const targetResourcesCount = audit.targetResources?.length ?? 0;

  return {
    id: audit.id, // Unique audit log ID (GUID)
    created_date: audit.activityDateTime, // When the activity occurred (ISO 8601)
    modified_date: audit.activityDateTime, // Use activity date as modified date
    data: {
      activity_date_time: audit.activityDateTime, // Timestamp of the activity
      activity_display_name: audit.activityDisplayName, // Human-readable activity name
      category: audit.category, // Activity category (e.g., "UserManagement", "GroupManagement")
      result: audit.result, // Result: "success" or "failure"
      result_reason: audit.resultReason ?? null, // Reason if operation failed
      // Initiator fields
      initiated_by_user_id: initiatedByUserId, // User ID who performed the action
      initiated_by_user_display_name: audit.initiatedBy?.user?.displayName ?? null, // User display name
      initiated_by_app_id: audit.initiatedBy?.app?.appId ?? null, // App ID if initiated by application
      initiated_by_app_display_name: audit.initiatedBy?.app?.displayName ?? null, // App display name
      initiated_by_display_name: initiatedByDisplayName, // Display name of initiator (combined field)
      // Target resources (serialized to JSON for schema compatibility)
      target_resources_json: targetResourcesJson, // JSON string of all target resources
      target_resources_count: targetResourcesCount, // Number of target resources
      // Target resource fields (extracted from first target for easy querying)
      target_object_id: targetObjectId, // ID of affected object
      target_display_name: targetDisplayName, // Display name of affected object
      target_type: targetType, // Type of affected object
      target_user_principal_name: targetUserPrincipalName, // UPN if target is a user
      // Additional detail fields (extracted from details map)
      ip_address: ipAddress, // Source IP address
      user_agent: userAgent, // Browser/client user agent
      invited_user_email: invitedUserEmail, // Email for B2B invitations
      invitation_id: invitationId, // Invitation ID for B2B invitations
    },
  };
}

/**
 * Normalize Sign-In Log Entity
 *
 * Transforms a sign-in log entry into DevRev format.
 *
 * Sign-In Logs Overview:
 * Track all authentication attempts (successful and failed) to Azure AD-protected resources.
 * Essential for security monitoring, detecting anomalous activity, and user access auditing.
 *
 * Retention:
 * - Basic Azure AD: 7 days
 * - Azure AD Premium P1/P2: 30 days
 *
 * Log Types:
 * - Interactive sign-ins: User directly authenticates (browser, app)
 * - Non-interactive sign-ins: Service/daemon authentication
 * - Service principal sign-ins: Application authentication
 * - Managed identity sign-ins: Azure resource authentication
 *
 * Key Information Tracked:
 * - User identity and authentication method
 * - Application being accessed
 * - Location (IP-based geolocation)
 * - Device details (OS, browser, compliance status)
 * - Conditional Access policy enforcement
 * - Risk detection (Azure AD Identity Protection)
 *
 * Status Codes:
 * - errorCode === 0: Successful sign-in
 * - errorCode !== 0: Failed sign-in (see failure reason for details)
 *
 * Conditional Access Status:
 * - "success": All policies satisfied
 * - "failure": At least one policy blocked access
 * - "notApplied": No policies applied to this sign-in
 *
 * Risk Levels:
 * - "none": No risk detected
 * - "low", "medium", "high": Risk severity from Identity Protection
 * - "hidden": Risk hidden by admin
 *
 * Flattening Strategy:
 * Sign-in logs have nested location and device objects. This function:
 * - Extracts location fields (city, state, country) from nested object
 * - Extracts device fields (OS, browser, compliance) from nested object
 * - Provides clean, flat fields for easier querying
 *
 * @param signIn - Raw sign-in log from /auditLogs/signIns
 * @returns Normalized item with sign-in details and extracted location/device info
 */
export function normalizeSignIn(signIn: EntraSignIn): NormalizedItem {
  // ── Extract Location Information ────────────────────────────────────────
  // Where did this sign-in originate from? (IP-based geolocation)

  // City name (e.g., "Seattle")
  const city = signIn.location?.city || null;

  // State/province name (e.g., "Washington")
  const state = signIn.location?.state || null;

  // Country or region name (e.g., "United States")
  const countryOrRegion = signIn.location?.countryOrRegion || null;

  // ── Extract Device Information ──────────────────────────────────────────
  // What device was used for this sign-in?

  // Device ID (Azure AD device object ID, if device is registered)
  const deviceId = signIn.deviceDetail?.deviceId || null;

  // Device display name
  const deviceDisplayName = signIn.deviceDetail?.displayName || null;

  // Operating system (e.g., "Windows 11", "iOS 17")
  const operatingSystem = signIn.deviceDetail?.operatingSystem || null;

  // Browser name and version (e.g., "Chrome 120")
  const browser = signIn.deviceDetail?.browser || null;

  // Whether device meets compliance policies
  const deviceIsCompliant = signIn.deviceDetail?.isCompliant || null;

  // Whether device is managed by Intune/MDM
  const deviceIsManaged = signIn.deviceDetail?.isManaged || null;

  // Device trust type: "AzureAd", "Workplace", "ServerAd", etc.
  const deviceTrustType = signIn.deviceDetail?.trustType || null;

  return {
    id: signIn.id, // Unique sign-in log ID (GUID)
    created_date: signIn.createdDateTime, // When the sign-in occurred (ISO 8601)
    modified_date: signIn.createdDateTime, // Use creation date as modified date
    data: {
      created_date_time: signIn.createdDateTime, // Timestamp of the sign-in attempt
      // User information
      user_principal_name: signIn.userPrincipalName, // User's UPN
      user_id: signIn.userId, // User's object ID
      user_display_name: signIn.userDisplayName, // User's display name
      // Application information
      app_display_name: signIn.appDisplayName, // Name of app being accessed
      app_id: signIn.appId, // Application (client) ID
      // Network information
      ip_address: signIn.ipAddress, // Source IP address
      client_app_used: signIn.clientAppUsed, // Type of client (e.g., "Browser", "Mobile Apps and Desktop Clients")
      // Sign-in status
      status_error_code: signIn.status?.errorCode || 0, // 0 = success, non-zero = failure
      status_failure_reason: signIn.status?.failureReason || null, // Human-readable failure reason
      status_additional_details: signIn.status?.additionalDetails || null, // Additional error details
      // Extracted location fields (from nested location object)
      location_city: city, // Sign-in city
      location_state: state, // Sign-in state/province
      location_country: countryOrRegion, // Sign-in country
      // Extracted device fields (from nested deviceDetail object)
      device_id: deviceId, // Azure AD device ID
      device_name: deviceDisplayName, // Device display name
      device_operating_system: operatingSystem, // Device OS
      device_browser: browser, // Browser used
      device_is_compliant: deviceIsCompliant, // Compliance status
      device_is_managed: deviceIsManaged, // Management status
      device_trust_type: deviceTrustType, // Trust type
      // Conditional Access and risk information
      conditional_access_status: signIn.conditionalAccessStatus, // CA policy enforcement result
      risk_detail: signIn.riskDetail, // Why risk was flagged (if applicable)
      risk_level_aggregated: signIn.riskLevelAggregated, // Overall risk level
      risk_level_during_sign_in: signIn.riskLevelDuringSignIn, // Real-time risk level
      risk_state: signIn.riskState, // Risk state: "none", "confirmedSafe", "remediated", "dismissed", "atRisk", "confirmedCompromised"
    },
  };
}
