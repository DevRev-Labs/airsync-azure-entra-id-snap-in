import {
  EntraApplication,
  EntraDevice,
  EntraDirectoryRole,
  EntraDirectoryRoleMember,
  EntraOrgContact,
  EntraServicePrincipal,
  EntraUser,
  EntraGroup,
} from './types';

interface NormalizedItem {
  id: string;
  created_date: string;
  modified_date: string;
  data: Record<string, unknown>;
}

const FALLBACK_DATE = new Date(0).toISOString();
const ENTRA_ADMIN_URL = 'https://entra.microsoft.com';

export function normalizeUser(user: EntraUser): NormalizedItem {
  const fullName = [user.givenName, user.surname].filter(Boolean).join(' ') || null;
  const data: Record<string, unknown> = {
    display_name: user.displayName,
    email: user.mail || user.userPrincipalName,
    full_name: fullName,
  };

  // Include extension attributes dynamically (keys starting with 'extension_')
  for (const [key, value] of Object.entries(user)) {
    if (key.startsWith('extension_') && value !== undefined) {
      data[key] = value;
    }
  }

  return {
    id: user.id,
    created_date: user.createdDateTime || FALLBACK_DATE,
    modified_date: user.createdDateTime || FALLBACK_DATE,
    data,
  };
}

export function normalizeGroup(group: EntraGroup): NormalizedItem {
  return {
    id: group.id,
    created_date: group.createdDateTime || FALLBACK_DATE,
    modified_date: group.createdDateTime || FALLBACK_DATE,
    data: {
      name: group.displayName,
      description: group.description,
      item_url_field: `${ENTRA_ADMIN_URL}/#view/Microsoft_AAD_IAM/GroupDetailsMenuBlade/~/Overview/groupId/${group.id}`,
    },
  };
}

export function normalizeGroupMember(
  member: EntraDirectoryRoleMember,
  groupId: string
): NormalizedItem {
  return {
    id: `${groupId}-${member.id}`,
    created_date: FALLBACK_DATE,
    modified_date: FALLBACK_DATE,
    data: {
      member_id: member.id,
      group_id: groupId,
    },
  };
}

export function normalizeDirectoryRole(role: EntraDirectoryRole): NormalizedItem {
  return {
    id: role.id,
    created_date: FALLBACK_DATE,
    modified_date: FALLBACK_DATE,
    data: {
      name: role.displayName,
      description: role.description || null,
      role_template_id: role.roleTemplateId,
      item_url_field: `${ENTRA_ADMIN_URL}/#view/Microsoft_AAD_IAM/RoleMenuBlade/~/Overview/objectId/${role.id}`,
    },
  };
}

export function normalizeRoleMember(
  member: EntraDirectoryRoleMember,
  roleId: string
): NormalizedItem {
  return {
    id: `${roleId}-${member.id}`,
    created_date: FALLBACK_DATE,
    modified_date: FALLBACK_DATE,
    data: {
      member_id: member.id,
      role_id: roleId,
    },
  };
}

export function normalizeApplication(app: EntraApplication): NormalizedItem {
  return {
    id: app.id,
    created_date: app.createdDateTime || FALLBACK_DATE,
    modified_date: app.createdDateTime || FALLBACK_DATE,
    data: {
      display_name: app.displayName,
      app_id: app.appId,
      sign_in_audience: app.signInAudience,
      publisher_domain: app.publisherDomain,
      identifier_uris: Array.isArray(app.identifierUris) ? app.identifierUris.join(', ') : '',
      item_url_field: `${ENTRA_ADMIN_URL}/#view/Microsoft_AAD_IAM/ActiveDirectoryMenuBlade/~/RegisteredApps/appId/${app.appId}`,
    },
  };
}

export function normalizeServicePrincipal(sp: EntraServicePrincipal): NormalizedItem {
  return {
    id: sp.id,
    created_date: sp.createdDateTime || FALLBACK_DATE,
    modified_date: sp.createdDateTime || FALLBACK_DATE,
    data: {
      display_name: sp.displayName,
      app_id: sp.appId,
      service_principal_type: sp.servicePrincipalType,
      account_enabled: sp.accountEnabled,
      app_owner_organization_id: sp.appOwnerOrganizationId,
      item_url_field: `${ENTRA_ADMIN_URL}/#view/Microsoft_AAD_IAM/ManagedAppMenuBlade/~/Overview/objectId/${sp.id}`,
    },
  };
}

export function normalizeDevice(device: EntraDevice): NormalizedItem {
  return {
    id: device.id,
    created_date: device.registrationDateTime || FALLBACK_DATE,
    modified_date: device.approximateLastSignInDateTime || device.registrationDateTime || FALLBACK_DATE,
    data: {
      display_name: device.displayName,
      operating_system: device.operatingSystem,
      operating_system_version: device.operatingSystemVersion,
      trust_type: device.trustType,
      is_compliant: device.isCompliant,
      is_managed: device.isManaged,
      device_id: device.deviceId,
      registration_date_time: device.registrationDateTime,
      // NEW: Additional device details
      manufacturer: device.manufacturer || null,
      model: device.model || null,
      profile_type: device.profileType || null,
      // NEW: Owner information
      registered_owner_id: device.registeredOwnerId || null,
      registered_owner_email: device.registeredOwnerEmail || null,
      registered_owner_display_name: device.registeredOwnerDisplayName || null,
    },
  };
}

export function normalizeOrgContact(contact: EntraOrgContact): NormalizedItem {
  const fullName = [contact.givenName, contact.surname].filter(Boolean).join(' ') || null;
  return {
    id: contact.id,
    created_date: contact.createdDateTime || FALLBACK_DATE,
    modified_date: contact.createdDateTime || FALLBACK_DATE,
    data: {
      display_name: contact.displayName,
      email: contact.mail,
      full_name: fullName,
    },
  };
}
