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
} as const;
