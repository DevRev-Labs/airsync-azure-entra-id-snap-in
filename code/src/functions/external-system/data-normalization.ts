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

// NEW: Normalize App Role
export function normalizeAppRole(appRole: EntraAppRole, servicePrincipalId: string): NormalizedItem {
  return {
    id: `${servicePrincipalId}-${appRole.id}`,
    created_date: FALLBACK_DATE,
    modified_date: FALLBACK_DATE,
    data: {
      app_role_id: appRole.id,
      service_principal_id: servicePrincipalId,
      display_name: appRole.displayName,
      description: appRole.description,
      value: appRole.value,
      is_enabled: appRole.isEnabled,
      allowed_member_types: Array.isArray(appRole.allowedMemberTypes)
        ? appRole.allowedMemberTypes.join(', ')
        : '',
    },
  };
}

// NEW: Normalize App Role Assignment
export function normalizeAppRoleAssignment(assignment: EntraAppRoleAssignment): NormalizedItem {
  return {
    id: assignment.id,
    created_date: assignment.createdDateTime || FALLBACK_DATE,
    modified_date: assignment.createdDateTime || FALLBACK_DATE,
    data: {
      principal_id: assignment.principalId,
      principal_type: assignment.principalType,
      principal_display_name: assignment.principalDisplayName,
      resource_id: assignment.resourceId,
      resource_display_name: assignment.resourceDisplayName,
      app_role_id: assignment.appRoleId,
    },
  };
}

// NEW: Normalize Authentication Method
export function normalizeAuthenticationMethod(
  method: EntraAuthenticationMethod,
  userId: string
): NormalizedItem {
  const methodType = method['@odata.type']?.split('.').pop() || 'unknown';
  return {
    id: `${userId}-${method.id}`,
    created_date: method.createdDateTime || FALLBACK_DATE,
    modified_date: method.createdDateTime || FALLBACK_DATE,
    data: {
      user_id: userId,
      method_id: method.id,
      method_type: methodType,
      display_name: method.displayName || null,
      device_tag: method.deviceTag || null,
      phone_app_version: method.phoneAppVersion || null,
      phone_number: method.phoneNumber || null,
      phone_type: method.phoneType || null,
    },
  };
}

// NEW: Normalize Authentication Methods Policy
export function normalizeAuthenticationMethodsPolicy(
  policy: EntraAuthenticationMethodsPolicy
): NormalizedItem {
  // Format objects/arrays as rich_text (DevRev expects { body: "string" } format)
  const registrationEnforcement = policy.registrationEnforcement
    ? { body: JSON.stringify(policy.registrationEnforcement, null, 2) }
    : null;

  const authMethodConfigurations = policy.authenticationMethodConfigurations && policy.authenticationMethodConfigurations.length > 0
    ? { body: JSON.stringify(policy.authenticationMethodConfigurations, null, 2) }
    : null;

  return {
    id: policy.id,
    created_date: FALLBACK_DATE,
    modified_date: FALLBACK_DATE,
    data: {
      display_name: policy.displayName,
      registration_enforcement: registrationEnforcement,
      authentication_method_configurations: authMethodConfigurations,
    },
  };
}

// NEW: Normalize License Assignment
export function normalizeLicenseAssignment(
  license: EntraLicenseDetails,
  userId: string
): NormalizedItem {
  // Extract active service plan names
  const activeServicePlans = license.servicePlans
    ?.filter(plan => plan.provisioningStatus === 'Success')
    .map(plan => plan.servicePlanName)
    .filter(Boolean)
    .join(', ') || null;

  // Format array as rich_text (DevRev expects { body: "string" } format)
  const servicePlans = license.servicePlans && license.servicePlans.length > 0
    ? { body: JSON.stringify(license.servicePlans, null, 2) }
    : null;

  return {
    id: `${userId}-${license.skuId}`,
    created_date: FALLBACK_DATE,
    modified_date: FALLBACK_DATE,
    data: {
      user_id: userId,
      sku_id: license.skuId,
      sku_part_number: license.skuPartNumber,
      active_service_plans: activeServicePlans,
      service_plans: servicePlans,
    },
  };
}

// NEW: Normalize PIM Eligible Role
export function normalizePIMEligibleRole(schedule: EntraPIMRoleEligibilitySchedule): NormalizedItem {
  // Extract schedule start date
  const scheduleStartDateTime = schedule.scheduleInfo?.startDateTime || null;

  // Format object as rich_text (DevRev expects { body: "string" } format)
  const scheduleInfo = schedule.scheduleInfo
    ? { body: JSON.stringify(schedule.scheduleInfo, null, 2) }
    : null;

  return {
    id: schedule.id,
    created_date: schedule.createdDateTime || FALLBACK_DATE,
    modified_date: schedule.createdDateTime || FALLBACK_DATE,
    data: {
      principal_id: schedule.principalId,
      role_definition_id: schedule.roleDefinitionId,
      directory_scope_id: schedule.directoryScopeId,
      schedule_start_date_time: scheduleStartDateTime,
      schedule_info: scheduleInfo,
      status: schedule.status,
    },
  };
}

// NEW: Normalize Conditional Access Policy
export function normalizeConditionalAccessPolicy(policy: EntraConditionalAccessPolicy): NormalizedItem {
  // Format objects as rich_text (DevRev expects { body: "string" } format)
  const conditions = policy.conditions
    ? { body: JSON.stringify(policy.conditions, null, 2) }
    : null;

  const grantControls = policy.grantControls
    ? { body: JSON.stringify(policy.grantControls, null, 2) }
    : null;

  const sessionControls = policy.sessionControls
    ? { body: JSON.stringify(policy.sessionControls, null, 2) }
    : null;

  return {
    id: policy.id,
    created_date: policy.createdDateTime || FALLBACK_DATE,
    modified_date: policy.modifiedDateTime || policy.createdDateTime || FALLBACK_DATE,
    data: {
      display_name: policy.displayName,
      state: policy.state,
      conditions,
      grant_controls: grantControls,
      session_controls: sessionControls,
      item_url_field: `${ENTRA_ADMIN_URL}/#view/Microsoft_AAD_ConditionalAccess/PolicyBlade/policyId/${policy.id}`,
    },
  };
}

// NEW: Normalize Lifecycle Workflow
export function normalizeLifecycleWorkflow(workflow: EntraLifecycleWorkflow): NormalizedItem {
  // Format objects/arrays as rich_text (DevRev expects { body: "string" } format)
  const executionConditions = workflow.executionConditions
    ? { body: JSON.stringify(workflow.executionConditions, null, 2) }
    : null;

  const tasks = workflow.tasks && workflow.tasks.length > 0
    ? { body: JSON.stringify(workflow.tasks, null, 2) }
    : null;

  return {
    id: workflow.id,
    created_date: workflow.createdDateTime || FALLBACK_DATE,
    modified_date: workflow.lastModifiedDateTime || workflow.createdDateTime || FALLBACK_DATE,
    data: {
      display_name: workflow.displayName,
      description: workflow.description,
      category: workflow.category,
      is_enabled: workflow.isEnabled,
      execution_conditions: executionConditions,
      tasks,
    },
  };
}

// NEW: Normalize Directory Audit Log
export function normalizeDirectoryAudit(audit: EntraDirectoryAudit): NormalizedItem {
  const initiatedByUserId = audit.initiatedBy?.user?.id || null;
  const initiatedByDisplayName = audit.initiatedBy?.user?.displayName || audit.initiatedBy?.app?.displayName || null;

  // Extract key target resource fields (first target)
  const firstTarget = audit.targetResources?.[0];
  const targetObjectId = firstTarget?.id || null;
  const targetDisplayName = firstTarget?.displayName || null;
  const targetType = firstTarget?.type || null;
  const targetUserPrincipalName = firstTarget?.userPrincipalName || null;

  // Extract key additional details fields
  const additionalDetailsMap: Record<string, string> = {};
  if (audit.additionalDetails && Array.isArray(audit.additionalDetails)) {
    for (const detail of audit.additionalDetails) {
      if (detail.key && detail.value) {
        additionalDetailsMap[detail.key] = detail.value;
      }
    }
  }

  const ipAddress = additionalDetailsMap['ipaddr'] || null;
  const userAgent = additionalDetailsMap['User-Agent'] || null;
  const invitedUserEmail = additionalDetailsMap['invitedUserEmailAddress'] || null;
  const invitationId = additionalDetailsMap['InvitationId'] || null;

  // Format full arrays as rich_text (DevRev expects { body: "string" } format)
  const targetResources = audit.targetResources && audit.targetResources.length > 0
    ? { body: JSON.stringify(audit.targetResources, null, 2) }
    : null;

  const additionalDetails = audit.additionalDetails && audit.additionalDetails.length > 0
    ? { body: JSON.stringify(audit.additionalDetails, null, 2) }
    : null;

  return {
    id: audit.id,
    created_date: audit.activityDateTime,
    modified_date: audit.activityDateTime,
    data: {
      activity_date_time: audit.activityDateTime,
      activity_display_name: audit.activityDisplayName,
      category: audit.category,
      result: audit.result,
      result_reason: audit.resultReason,
      initiated_by_user_id: initiatedByUserId,
      initiated_by_display_name: initiatedByDisplayName,
      initiated_by_app_id: audit.initiatedBy?.app?.appId || null,
      // Extracted/clean fields
      target_object_id: targetObjectId,
      target_display_name: targetDisplayName,
      target_type: targetType,
      target_user_principal_name: targetUserPrincipalName,
      ip_address: ipAddress,
      user_agent: userAgent,
      invited_user_email: invitedUserEmail,
      invitation_id: invitationId,
      // Full arrays (fallback/complete data)
      target_resources: targetResources,
      additional_details: additionalDetails,
    },
  };
}

// NEW: Normalize Sign-In Log
export function normalizeSignIn(signIn: EntraSignIn): NormalizedItem {
  // Extract key location fields
  const city = signIn.location?.city || null;
  const state = signIn.location?.state || null;
  const countryOrRegion = signIn.location?.countryOrRegion || null;

  // Extract key device fields
  const deviceId = signIn.deviceDetail?.deviceId || null;
  const deviceDisplayName = signIn.deviceDetail?.displayName || null;
  const operatingSystem = signIn.deviceDetail?.operatingSystem || null;
  const browser = signIn.deviceDetail?.browser || null;
  const deviceIsCompliant = signIn.deviceDetail?.isCompliant || null;
  const deviceIsManaged = signIn.deviceDetail?.isManaged || null;
  const deviceTrustType = signIn.deviceDetail?.trustType || null;

  // Format full objects as rich_text (DevRev expects { body: "string" } format)
  const location = signIn.location
    ? { body: JSON.stringify(signIn.location, null, 2) }
    : null;

  const deviceDetail = signIn.deviceDetail
    ? { body: JSON.stringify(signIn.deviceDetail, null, 2) }
    : null;

  return {
    id: signIn.id,
    created_date: signIn.createdDateTime,
    modified_date: signIn.createdDateTime,
    data: {
      created_date_time: signIn.createdDateTime,
      user_principal_name: signIn.userPrincipalName,
      user_id: signIn.userId,
      user_display_name: signIn.userDisplayName,
      app_display_name: signIn.appDisplayName,
      app_id: signIn.appId,
      ip_address: signIn.ipAddress,
      client_app_used: signIn.clientAppUsed,
      status_error_code: signIn.status?.errorCode || 0,
      status_failure_reason: signIn.status?.failureReason || null,
      status_additional_details: signIn.status?.additionalDetails || null,
      // Extracted location fields
      location_city: city,
      location_state: state,
      location_country: countryOrRegion,
      // Extracted device fields
      device_id: deviceId,
      device_name: deviceDisplayName,
      device_operating_system: operatingSystem,
      device_browser: browser,
      device_is_compliant: deviceIsCompliant,
      device_is_managed: deviceIsManaged,
      device_trust_type: deviceTrustType,
      // Full objects (fallback/complete data)
      location,
      device_detail: deviceDetail,
      conditional_access_status: signIn.conditionalAccessStatus,
      risk_detail: signIn.riskDetail,
      risk_level_aggregated: signIn.riskLevelAggregated,
      risk_level_during_sign_in: signIn.riskLevelDuringSignIn,
      risk_state: signIn.riskState,
    },
  };
}
