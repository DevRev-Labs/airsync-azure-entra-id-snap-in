// ══════════════════════════════════════════════════════════════════════════════
// API CONFIGURATION
// ══════════════════════════════════════════════════════════════════════════════

// Microsoft Graph API base URL - hardcoded for security (prevents SSRF)
export const GRAPH_BASE_URL = 'https://graph.microsoft.com/v1.0';

// ══════════════════════════════════════════════════════════════════════════════
// TIMING & PERFORMANCE CONSTANTS
// ══════════════════════════════════════════════════════════════════════════════

// Brief pause after adapter.isTimeout flips before the worker exits.
// Keep this SMALL — the SDK sets isTimeout at the 10-minute soft-timeout
// boundary and hard-kills the Lambda at ~13 minutes. Anything larger than a
// few seconds risks the worker being force-terminated before it can emit
// DataExtractionProgress, producing "Worker exited without emitting event"
// on large tenants (see LABS-377).
export const ADAPTER_TIMEOUT_DELAY_MS = 5_000; // 5 seconds

// Initial time window for audit / sign-in logs on first sync (no cursor yet).
// Kept small because sign-in logs for large tenants can be millions of rows
// with heavy nested payloads, exhausting Lambda memory before extraction
// can checkpoint (LABS-377).
export const INITIAL_LOG_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours

// Maximum number of items to request per page from Microsoft Graph API
export const PAGE_SIZE = 999;

// Maximum number of retry attempts for failed API requests
export const MAX_RETRIES = 3;

// Default delay in seconds when rate limited (if Retry-After header missing)
export const DEFAULT_RATE_LIMIT_DELAY_SECONDS = 64;

// Delay in seconds to request from the SDK on HTTP 401 so the worker can
// re-authenticate and refresh its access token on the next invocation.
export const AUTH_ERROR_DELAY_SECONDS = 60;

// Maximum time to wait for a single HTTP request to complete
export const HTTP_REQUEST_TIMEOUT_MS = 20_000; // 20 seconds

// Repo batch size for the external_sync_units repo. Set high so a tenant's
// full sync-unit list ships in one batch (Entra tenants only expose a
// single sync unit today, but the ceiling allows headroom).
export const EXTERNAL_SYNC_UNITS_BATCH_SIZE = 25_000;

// Number of applications to scan when discovering user extension properties.
// Extension registrations live per-app; 100 apps is enough for typical tenants
// without paging the metadata phase.
export const EXTENSION_DISCOVERY_APP_LIMIT = 100;

// Default HTTP timeout (ms) for the marketplace usage-tracking client.
export const DEFAULT_LABS_USAGE_TIMEOUT_MS = 5_000;

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
