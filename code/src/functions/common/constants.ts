export const GRAPH_BASE_URL = 'https://graph.microsoft.com/v1.0';

export const ADAPTER_TIMEOUT_DELAY_MS = 180_000; // 3 minutes

export const PAGE_SIZE = 999;

export const MAX_RETRIES = 3;

export const DEFAULT_RATE_LIMIT_DELAY_SECONDS = 64;

export const HTTP_REQUEST_TIMEOUT_MS = 20_000; // 20 seconds

export const ENTITY_NAMES = {
  USERS: 'users',
  GROUPS: 'groups',
  GROUP_MEMBERS: 'group_members',
  DIRECTORY_ROLES: 'directory_roles',
  ROLE_MEMBERS: 'role_members',
  APPLICATIONS: 'applications',
  SERVICE_PRINCIPALS: 'service_principals',
  DEVICES: 'devices',
  ORG_CONTACTS: 'org_contacts',
  EXTERNAL_DOMAIN_METADATA: 'external_domain_metadata',
  // NEW ENTITIES
  APP_ROLES: 'app_roles',
  APP_ROLE_ASSIGNMENTS: 'app_role_assignments',
  AUTHENTICATION_METHODS: 'authentication_methods',
  AUTHENTICATION_METHODS_POLICY: 'authentication_methods_policy',
  LICENSE_ASSIGNMENTS: 'license_assignments',
  PIM_ELIGIBLE_ROLES: 'pim_eligible_roles',
  CONDITIONAL_ACCESS_POLICIES: 'conditional_access_policies',
  LIFECYCLE_WORKFLOWS: 'lifecycle_workflows',
  DIRECTORY_AUDIT_LOGS: 'directory_audit_logs',
  SIGN_IN_LOGS: 'sign_in_logs',
} as const;
