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
  // Extract registration enforcement details
  const regEnforcement = policy.registrationEnforcement?.authenticationMethodsRegistrationCampaign;
  const snoozeDays = regEnforcement?.snoozeDurationInDays || null;
  const campaignState = regEnforcement?.state || null;

  // Extract target information
  const includeTarget = regEnforcement?.includeTargets?.[0];
  const includeTargetId = includeTarget?.id || null;
  const includeTargetType = includeTarget?.targetType || null;
  const targetedAuthMethod = includeTarget?.targetedAuthenticationMethod || null;

  // Extract enabled authentication methods
  const enabledMethods = policy.authenticationMethodConfigurations
    ?.filter(config => config.state === 'enabled')
    .map(config => {
      const type = config['@odata.type'] || '';
      const match = type.match(/\.(\w+)AuthenticationMethodConfiguration$/);
      return match ? match[1] : config.id;
    })
    .filter(Boolean)
    .join(', ') || null;

  // Extract disabled authentication methods
  const disabledMethods = policy.authenticationMethodConfigurations
    ?.filter(config => config.state === 'disabled')
    .map(config => {
      const type = config['@odata.type'] || '';
      const match = type.match(/\.(\w+)AuthenticationMethodConfiguration$/);
      return match ? match[1] : config.id;
    })
    .filter(Boolean)
    .join(', ') || null;

  // Count total configurations
  const totalConfigurations = policy.authenticationMethodConfigurations?.length || 0;

  return {
    id: policy.id,
    created_date: FALLBACK_DATE,
    modified_date: FALLBACK_DATE,
    data: {
      display_name: policy.displayName,
      // Registration enforcement fields
      registration_campaign_state: campaignState,
      registration_snooze_days: snoozeDays,
      registration_include_target_id: includeTargetId,
      registration_include_target_type: includeTargetType,
      registration_targeted_auth_method: targetedAuthMethod,
      // Authentication method summaries
      enabled_auth_methods: enabledMethods,
      disabled_auth_methods: disabledMethods,
      total_auth_method_configurations: totalConfigurations,
    },
  };
}

// NEW: Normalize License Assignment
export function normalizeLicenseAssignment(
  license: EntraLicenseDetails,
  userId: string
): NormalizedItem {
  // Extract service plan counts by status
  const totalPlans = license.servicePlans?.length || 0;
  const successPlans = license.servicePlans?.filter(plan => plan.provisioningStatus === 'Success').length || 0;
  const disabledPlans = license.servicePlans?.filter(plan => plan.provisioningStatus === 'Disabled').length || 0;
  const pendingPlans = license.servicePlans?.filter(plan => plan.provisioningStatus === 'PendingInput' || plan.provisioningStatus === 'PendingActivation' || plan.provisioningStatus === 'PendingProvisioning').length || 0;

  // Extract active service plan names
  const activeServicePlans = license.servicePlans
    ?.filter(plan => plan.provisioningStatus === 'Success')
    .map(plan => plan.servicePlanName)
    .filter(Boolean)
    .join(', ') || null;

  // Extract disabled service plan names
  const disabledServicePlans = license.servicePlans
    ?.filter(plan => plan.provisioningStatus === 'Disabled')
    .map(plan => plan.servicePlanName)
    .filter(Boolean)
    .join(', ') || null;

  return {
    id: `${userId}-${license.skuId}`,
    created_date: FALLBACK_DATE,
    modified_date: FALLBACK_DATE,
    data: {
      user_id: userId,
      sku_id: license.skuId,
      sku_part_number: license.skuPartNumber,
      // Service plan summaries
      active_service_plans: activeServicePlans,
      disabled_service_plans: disabledServicePlans,
      total_service_plans: totalPlans,
      success_service_plans_count: successPlans,
      disabled_service_plans_count: disabledPlans,
      pending_service_plans_count: pendingPlans,
    },
  };
}

// NEW: Normalize PIM Eligible Role
export function normalizePIMEligibleRole(schedule: EntraPIMRoleEligibilitySchedule): NormalizedItem {
  const scheduleInfo = schedule.scheduleInfo as any;
  const expiration = scheduleInfo?.expiration;

  // Extract schedule dates
  const scheduleStartDateTime = scheduleInfo?.startDateTime || null;
  const scheduleEndDateTime = expiration?.endDateTime || null;

  // Extract expiration details
  const expirationType = expiration?.type || null;
  const expirationDuration = expiration?.duration || null;

  return {
    id: schedule.id,
    created_date: schedule.createdDateTime || FALLBACK_DATE,
    modified_date: schedule.createdDateTime || FALLBACK_DATE,
    data: {
      principal_id: schedule.principalId,
      role_definition_id: schedule.roleDefinitionId,
      directory_scope_id: schedule.directoryScopeId,
      status: schedule.status,
      // Schedule information
      schedule_start_date_time: scheduleStartDateTime,
      schedule_end_date_time: scheduleEndDateTime,
      expiration_type: expirationType,
      expiration_duration: expirationDuration,
    },
  };
}

// NEW: Normalize Conditional Access Policy
export function normalizeConditionalAccessPolicy(policy: EntraConditionalAccessPolicy): NormalizedItem {
  const conditions = policy.conditions as any;
  const grantControls = policy.grantControls as any;
  const sessionControls = policy.sessionControls as any;

  // Extract user conditions
  const includeUsers = conditions?.users?.includeUsers?.join(', ') || null;
  const excludeUsers = conditions?.users?.excludeUsers?.join(', ') || null;
  const includeGroups = conditions?.users?.includeGroups?.join(', ') || null;
  const excludeGroups = conditions?.users?.excludeGroups?.join(', ') || null;
  const includeRoles = conditions?.users?.includeRoles?.join(', ') || null;
  const excludeRoles = conditions?.users?.excludeRoles?.join(', ') || null;

  // Extract application conditions
  const includeApplications = conditions?.applications?.includeApplications?.join(', ') || null;
  const excludeApplications = conditions?.applications?.excludeApplications?.join(', ') || null;

  // Extract platform conditions
  const includePlatforms = conditions?.platforms?.includePlatforms?.join(', ') || null;
  const excludePlatforms = conditions?.platforms?.excludePlatforms?.join(', ') || null;

  // Extract location conditions
  const includeLocations = conditions?.locations?.includeLocations?.join(', ') || null;
  const excludeLocations = conditions?.locations?.excludeLocations?.join(', ') || null;

  // Extract client app types
  const clientAppTypes = conditions?.clientAppTypes?.join(', ') || null;

  // Extract grant controls
  const builtInControls = grantControls?.builtInControls?.join(', ') || null;
  const grantOperator = grantControls?.operator || null;

  // Extract session controls
  const signInFrequencyValue = sessionControls?.signInFrequency?.value || null;
  const signInFrequencyType = sessionControls?.signInFrequency?.type || null;
  const persistentBrowserMode = sessionControls?.persistentBrowser?.mode || null;

  return {
    id: policy.id,
    created_date: policy.createdDateTime || FALLBACK_DATE,
    modified_date: policy.modifiedDateTime || policy.createdDateTime || FALLBACK_DATE,
    data: {
      display_name: policy.displayName,
      state: policy.state,
      // User conditions
      include_users: includeUsers,
      exclude_users: excludeUsers,
      include_groups: includeGroups,
      exclude_groups: excludeGroups,
      include_roles: includeRoles,
      exclude_roles: excludeRoles,
      // Application conditions
      include_applications: includeApplications,
      exclude_applications: excludeApplications,
      // Platform conditions
      include_platforms: includePlatforms,
      exclude_platforms: excludePlatforms,
      // Location conditions
      include_locations: includeLocations,
      exclude_locations: excludeLocations,
      // Client app types
      client_app_types: clientAppTypes,
      // Grant controls
      grant_built_in_controls: builtInControls,
      grant_operator: grantOperator,
      // Session controls
      sign_in_frequency_value: signInFrequencyValue,
      sign_in_frequency_type: signInFrequencyType,
      persistent_browser_mode: persistentBrowserMode,
      item_url_field: `${ENTRA_ADMIN_URL}/#view/Microsoft_AAD_ConditionalAccess/PolicyBlade/policyId/${policy.id}`,
    },
  };
}

// NEW: Normalize Lifecycle Workflow
export function normalizeLifecycleWorkflow(workflow: EntraLifecycleWorkflow): NormalizedItem {
  const executionConditions = workflow.executionConditions as any;

  // Extract trigger conditions
  const triggerScope = executionConditions?.['@odata.type']?.split('.').pop() || null;
  const triggerTimeBasedAttribute = executionConditions?.timeBasedAttribute || null;
  const triggerOffsetInDays = executionConditions?.offsetInDays || null;

  // Extract task information
  const taskCount = workflow.tasks?.length || 0;
  const taskTypes = workflow.tasks
    ?.map((task: any) => {
      const type = task.taskDefinitionId || task['@odata.type'];
      if (!type) return null;
      // Extract last part of the type
      const match = type.match(/\.(\w+)$/);
      return match ? match[1] : type;
    })
    .filter(Boolean)
    .join(', ') || null;

  // Get first few task display names
  const taskNames = workflow.tasks
    ?.slice(0, 3)
    .map((task: any) => task.displayName)
    .filter(Boolean)
    .join(', ') || null;

  return {
    id: workflow.id,
    created_date: workflow.createdDateTime || FALLBACK_DATE,
    modified_date: workflow.lastModifiedDateTime || workflow.createdDateTime || FALLBACK_DATE,
    data: {
      display_name: workflow.displayName,
      description: workflow.description,
      category: workflow.category,
      is_enabled: workflow.isEnabled,
      // Trigger/execution conditions
      trigger_scope: triggerScope,
      trigger_time_based_attribute: triggerTimeBasedAttribute,
      trigger_offset_in_days: triggerOffsetInDays,
      // Task information
      task_count: taskCount,
      task_types: taskTypes,
      task_names: taskNames,
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
      // Other fields
      conditional_access_status: signIn.conditionalAccessStatus,
      risk_detail: signIn.riskDetail,
      risk_level_aggregated: signIn.riskLevelAggregated,
      risk_level_during_sign_in: signIn.riskLevelDuringSignIn,
      risk_state: signIn.riskState,
    },
  };
}
