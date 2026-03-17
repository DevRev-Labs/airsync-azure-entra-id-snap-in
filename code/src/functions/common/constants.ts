// ══════════════════════════════════════════════════════════════════════════════
// API CONFIGURATION
// ══════════════════════════════════════════════════════════════════════════════

// Microsoft Graph API base URL - hardcoded for security (prevents SSRF)
export const GRAPH_BASE_URL = 'https://graph.microsoft.com/v1.0';

// ══════════════════════════════════════════════════════════════════════════════
// TIMING & PERFORMANCE CONSTANTS
// ══════════════════════════════════════════════════════════════════════════════

// Maximum time to wait before DevRev Airdrop framework times out the worker
export const ADAPTER_TIMEOUT_DELAY_MS = 180_000; // 3 minutes

// Maximum number of items to request per page from Microsoft Graph API
export const PAGE_SIZE = 999;

// Maximum number of retry attempts for failed API requests
export const MAX_RETRIES = 3;

// Default delay in seconds when rate limited (if Retry-After header missing)
export const DEFAULT_RATE_LIMIT_DELAY_SECONDS = 64;

// Maximum time to wait for a single HTTP request to complete
export const HTTP_REQUEST_TIMEOUT_MS = 20_000; // 20 seconds

// ══════════════════════════════════════════════════════════════════════════════
// SECURITY CONSTANTS
// ══════════════════════════════════════════════════════════════════════════════

// Maximum allowed length for client secret (prevents buffer overflow)
export const MAX_CLIENT_SECRET_LENGTH = 1000;

// Maximum allowed length for tenant ID
export const MAX_TENANT_ID_LENGTH = 200;

// Maximum allowed length for client ID (standard GUID is 36 chars)
export const MAX_CLIENT_ID_LENGTH = 100;

// Maximum allowed length for any single log message (prevents log flooding)
export const MAX_LOG_MESSAGE_LENGTH = 5000;

// Maximum allowed length for entity IDs (Azure AD GUIDs are 36 chars)
export const MAX_ENTITY_ID_LENGTH = 100;

// Allowed Microsoft Graph API hostnames (for SSRF protection)
export const ALLOWED_GRAPH_HOSTS = ['graph.microsoft.com', 'graph.windows.net'] as const;

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
