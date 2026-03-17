/**
 * Microsoft Entra ID (Azure AD) API Client Module
 *
 * This module provides a comprehensive client for interacting with Microsoft Graph API
 * to extract identity and directory data from Azure Entra ID tenants.
 *
 * Key Features:
 * - OAuth 2.0 Client Credentials authentication
 * - Automatic retry logic with exponential backoff
 * - Rate limit handling
 * - Pagination support
 * - Delta query support for incremental syncs
 * - Comprehensive error handling
 *
 * Supported Entities:
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

// Import axios HTTP client library and types
import axios, { AxiosInstance } from 'axios';

// Import all Microsoft Graph API entity type definitions
import {
  EntraApplication,
  EntraDevice,
  EntraDirectoryRole,
  EntraDirectoryRoleMember,
  EntraExtensionProperty,
  EntraGroup,
  EntraOrgContact,
  EntraOrganization,
  EntraServicePrincipal,
  EntraUser,
  GraphPagedResponse,
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

// Import configuration constants (URLs, timeouts, limits)
import {
  DEFAULT_RATE_LIMIT_DELAY_SECONDS,
  GRAPH_BASE_URL,
  HTTP_REQUEST_TIMEOUT_MS,
  MAX_RETRIES,
  PAGE_SIZE,
} from '../common/constants';

// Import utility functions for error handling and validation
import {
  formatError,
  validateTenantId,
  validateAzureGuid,
  validateMaxLength,
  validateGraphUrl,
} from '../common/utils';

/**
 * Acquire OAuth 2.0 Access Token using Client Credentials Flow
 *
 * This function authenticates with Microsoft Entra ID (Azure AD) using the
 * OAuth 2.0 Client Credentials grant type. It's called once at the start of
 * each sync operation, and the returned token is used for all subsequent
 * Microsoft Graph API requests.
 *
 * Authentication Flow:
 * 1. Send POST request to Azure AD token endpoint with client credentials
 * 2. Receive JWT access token valid for 1 hour
 * 3. Use token in Authorization header for all Graph API calls
 *
 * Retry Logic:
 * - Retries transient failures (network issues, timeouts) up to MAX_RETRIES times
 * - Does NOT retry authentication failures (400, 401) as these indicate invalid credentials
 * - Uses linear backoff: attempt 1 waits 1s, attempt 2 waits 2s, attempt 3 waits 3s
 *
 * @param tenantId - Azure AD Tenant ID (GUID or domain name)
 * @param clientId - Application (Client) ID from Azure AD app registration
 * @param clientSecret - Client Secret from Azure AD app registration
 * @returns JWT access token valid for Microsoft Graph API calls
 * @throws Error if authentication fails after all retries or credentials are invalid
 *
 * @example
 * const token = await acquireAccessToken(
 *   'contoso.onmicrosoft.com',
 *   '12345678-1234-1234-1234-123456789012',
 *   'my-client-secret'
 * );
 */
export async function acquireAccessToken(
  tenantId: string,
  clientId: string,
  clientSecret: string
): Promise<string> {
  // ── Security Validation: Input Parameter Validation ────────────────────────
  // Validate all input parameters before constructing authentication request
  // This prevents injection attacks and malformed requests

  // Validate tenant ID format (GUID or domain)
  if (!validateTenantId(tenantId)) {
    throw new Error('Invalid tenant ID format. Expected GUID or domain name.');
  }

  // Validate client ID is a valid GUID
  if (!validateAzureGuid(clientId)) {
    throw new Error('Invalid client ID format. Expected GUID.');
  }

  // Validate client secret exists and has reasonable length
  // Maximum length check prevents buffer overflow attacks
  if (!clientSecret || !validateMaxLength(clientSecret, 1000)) {
    throw new Error('Invalid client secret. Must be non-empty and less than 1000 characters.');
  }

  // Construct Azure AD token endpoint URL for the specified tenant
  // URL is hardcoded with validated tenant ID to prevent SSRF attacks
  const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;

  // Create URL-encoded form data with OAuth 2.0 client credentials parameters
  const params = new URLSearchParams({
    client_id: clientId, // Application ID from Azure AD app registration
    client_secret: clientSecret, // Secret from Azure AD app registration
    scope: 'https://graph.microsoft.com/.default', // Request all app permissions granted in Azure AD
    grant_type: 'client_credentials', // OAuth 2.0 flow type for service-to-service auth
  });

  // Track last error for throwing after all retries exhausted
  let lastError: unknown;

  // Retry loop: attempt authentication up to MAX_RETRIES times
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      // Send POST request to Azure AD token endpoint
      const response = await axios.post<{ access_token: string }>(
        tokenUrl,
        params.toString(), // Send as URL-encoded form data
        {
          headers: {
            // Required content type for OAuth 2.0 token requests
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          // Set timeout to prevent indefinite hanging
          timeout: HTTP_REQUEST_TIMEOUT_MS,
        }
      );

      // Extract JWT access token from response
      return response.data.access_token;
    } catch (error) {
      // Check if error is an HTTP error from axios
      if (axios.isAxiosError(error)) {
        // Extract HTTP status code
        const status = error.response?.status;

        // Don't retry authentication errors (invalid credentials)
        if (status === 400 || status === 401) {
          // 400 = Bad Request (malformed request)
          // 401 = Unauthorized (invalid client ID or secret)
          throw error; // These are non-retryable - fail immediately
        }
      }

      // Store error for potential re-throw after all retries
      lastError = error;

      // Wait before next retry using linear backoff
      // attempt 1: wait 1000ms, attempt 2: wait 2000ms, attempt 3: wait 3000ms
      await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
    }
  }

  // All retries exhausted - throw the last error encountered
  throw lastError;
}

/**
 * Microsoft Entra ID (Azure AD) API Client Class
 *
 * This class provides a high-level interface for interacting with Microsoft Graph API
 * to retrieve identity and directory data from Azure Entra ID tenants.
 *
 * Features:
 * - Authenticated requests using Bearer token
 * - Automatic retry with exponential backoff for transient failures
 * - Graceful handling of rate limits, permissions, and API errors
 * - Support for pagination via nextLink
 * - Support for incremental sync via delta queries
 * - Type-safe API with TypeScript interfaces
 *
 * Usage:
 * ```typescript
 * const token = await acquireAccessToken(tenantId, clientId, clientSecret);
 * const client = new EntraIDClient(token);
 * const users = await client.listUsersPage();
 * ```
 */
export class EntraIDClient {
  // Private axios instance configured with base URL, auth, and timeouts
  private client: AxiosInstance;

  /**
   * Constructor - Initialize EntraIDClient with Access Token
   *
   * Creates a pre-configured axios instance for making authenticated requests
   * to Microsoft Graph API. All requests will automatically include the
   * Authorization header with the provided Bearer token.
   *
   * @param accessToken - JWT access token obtained from Azure AD token endpoint
   *
   * @example
   * const token = await acquireAccessToken(...);
   * const client = new EntraIDClient(token);
   */
  constructor(accessToken: string) {
    // Create axios instance with default configuration
    this.client = axios.create({
      // Base URL for all Microsoft Graph API requests
      baseURL: GRAPH_BASE_URL, // https://graph.microsoft.com/v1.0

      // Default headers included in every request
      headers: {
        // OAuth 2.0 Bearer token for authentication
        Authorization: `Bearer ${accessToken}`,

        // Indicate JSON request/response format
        'Content-Type': 'application/json',
      },

      // Maximum time to wait for server response before timing out
      timeout: HTTP_REQUEST_TIMEOUT_MS, // 20 seconds
    });
  }

  /**
   * Private Generic GET Request Method with Retry Logic
   *
   * This is the core HTTP GET method used by all public API methods.
   * It handles:
   * - Automatic retries for transient failures (5xx errors, network issues)
   * - Non-retryable error detection (4xx client errors)
   * - Exponential backoff between retry attempts
   * - Comprehensive error logging
   *
   * Error Handling Strategy:
   * - 4xx Client Errors (400, 401, 403, 404, 410): Throw immediately (non-retryable)
   * - 5xx Server Errors: Retry with exponential backoff
   * - Network Errors: Retry with exponential backoff
   * - 429 Rate Limit: Throw immediately (handled by caller using Retry-After header)
   *
   * @param url - Relative or absolute URL to request
   * @param params - Optional query parameters to append to URL
   * @returns Typed response data from API
   * @throws Error if request fails after all retries or encounters non-retryable error
   *
   * @template T - Expected response data type
   *
   * @private
   */
  private async get<T>(url: string, params?: Record<string, unknown>): Promise<T> {
    // ── Security Validation: URL Validation for SSRF Protection ────────────────
    // If URL is absolute (starts with http), validate it's a Microsoft Graph endpoint
    // This prevents Server-Side Request Forgery (SSRF) attacks
    if (url.startsWith('http')) {
      // Validate URL is a legitimate Microsoft Graph endpoint
      if (!validateGraphUrl(url)) {
        throw new Error(
          `Security: Attempted to request non-Graph URL: ${url}. Only Microsoft Graph endpoints are allowed.`
        );
      }
    }

    // Track last error for re-throwing after retries exhausted
    let lastError: unknown;

    // Retry loop: attempt request up to MAX_RETRIES times
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        // Make HTTP GET request using pre-configured axios instance
        const response = await this.client.get<T>(url, { params });

        // Request succeeded - return response data
        return response.data;
      } catch (error) {
        // Check if error is an HTTP error from axios
        if (axios.isAxiosError(error)) {
          // Extract HTTP status code from response
          const status = error.response?.status;

          // Determine if error is retryable or not
          // Non-retryable client errors - throw immediately without retry
          if (
            status === 400 || // Bad Request - invalid parameters
            status === 401 || // Unauthorized - token expired or invalid
            status === 403 || // Forbidden - insufficient permissions
            status === 404 || // Not Found - resource doesn't exist
            status === 410 // Gone - delta token expired
          ) {
            // These errors won't be fixed by retrying - fail fast
            throw error;
          }

          // Retryable server errors (5xx) - retry with backoff
          if (status && status >= 500) {
            // Store error for potential re-throw
            lastError = error;

            // Calculate exponential backoff delay
            const backoffMs = attempt * 1000; // 1s, 2s, 3s for attempts 1, 2, 3

            // Log retry attempt for debugging
            console.warn(
              `[EntraIDClient] HTTP ${status} on attempt ${attempt}/${MAX_RETRIES}, retrying in ${backoffMs}ms`
            );

            // Wait before next retry
            await new Promise((resolve) => setTimeout(resolve, backoffMs));

            // Continue to next iteration of retry loop
            continue;
          }
        }

        // Error is not an HTTP error or not a 5xx error - throw it
        throw error;
      }
    }

    // All retries exhausted - throw the last error encountered
    throw lastError;
  }

  /**
   * Get Organization Details
   *
   * Retrieves basic information about the Azure AD tenant/organization,
   * including display name, verified domains, and tenant settings.
   *
   * API Endpoint: GET /organization
   * Required Permission: Organization.Read.All
   *
   * @returns Organization object with tenant details
   * @throws Error if no organization data is returned or API call fails
   *
   * @example
   * const org = await client.getOrganization();
   * console.log(`Tenant: ${org.displayName}`);
   */
  async getOrganization(): Promise<EntraOrganization> {
    // Request organization data from Graph API
    const response = await this.get<GraphPagedResponse<EntraOrganization>>('/organization');

    // Extract first organization from response array
    const org = response.value[0];

    // Validate that organization data was returned
    if (!org) {
      throw new Error('No organization data returned from Microsoft Graph');
    }

    // Return organization object
    return org;
  }

  /**
   * List Users - Paginated
   *
   * Retrieves a page of users from the Azure AD tenant. Supports pagination
   * using the @odata.nextLink returned in responses.
   *
   * API Endpoint: GET /users?$top={PAGE_SIZE}
   * Required Permission: User.Read.All
   *
   * @param nextLink - Optional continuation URL from previous page response
   * @returns Paged response containing users and optional nextLink for pagination
   *
   * @example
   * // Get first page of users
   * let response = await client.listUsersPage();
   * console.log(`Found ${response.value.length} users`);
   *
   * // Get next page if available
   * if (response['@odata.nextLink']) {
   *   response = await client.listUsersPage(response['@odata.nextLink']);
   * }
   */
  async listUsersPage(nextLink?: string): Promise<GraphPagedResponse<EntraUser>> {
    // Use provided nextLink or construct initial request URL with page size
    const url = nextLink || `/users?$top=${PAGE_SIZE}`;

    // Execute GET request and return paged response
    return this.get<GraphPagedResponse<EntraUser>>(url);
  }

  /**
   * Get Users Delta - Incremental Sync
   *
   * Retrieves only users that have changed since the last delta query.
   * Uses delta tokens to track changes, enabling efficient incremental syncs.
   *
   * Delta tokens are valid for 7 days. If expired, API returns 410 Gone.
   *
   * API Endpoint: GET /users/delta?$top={PAGE_SIZE}
   * Required Permission: User.Read.All
   *
   * @param deltaLink - Optional delta link from previous delta query (includes token)
   * @returns Paged response with changed users and @odata.deltaLink for next sync
   *
   * @example
   * // Initial delta query (returns all users + deltaLink)
   * let response = await client.getUsersDelta();
   * const deltaLink = response['@odata.deltaLink'];
   *
   * // Subsequent incremental sync (returns only changes)
   * response = await client.getUsersDelta(deltaLink);
   */
  async getUsersDelta(deltaLink?: string): Promise<GraphPagedResponse<EntraUser>> {
    // Use provided deltaLink or construct initial delta query URL
    const url = deltaLink || `/users/delta?$top=${PAGE_SIZE}`;

    // Execute GET request and return delta response
    return this.get<GraphPagedResponse<EntraUser>>(url);
  }

  /**
   * List Groups - Paginated
   *
   * Retrieves a page of groups from the Azure AD tenant, including security
   * groups, Microsoft 365 groups, and distribution lists.
   *
   * API Endpoint: GET /groups?$top={PAGE_SIZE}
   * Required Permission: Group.Read.All
   *
   * @param nextLink - Optional continuation URL from previous page response
   * @returns Paged response containing groups and optional nextLink for pagination
   *
   * @example
   * let response = await client.listGroupsPage();
   * for (const group of response.value) {
   *   console.log(`Group: ${group.displayName}`);
   * }
   */
  async listGroupsPage(nextLink?: string): Promise<GraphPagedResponse<EntraGroup>> {
    // Use provided nextLink or construct initial request URL with page size
    const url = nextLink || `/groups?$top=${PAGE_SIZE}`;

    // Execute GET request and return paged response
    return this.get<GraphPagedResponse<EntraGroup>>(url);
  }

  /**
   * Get Groups Delta - Incremental Sync
   *
   * Retrieves only groups that have changed since the last delta query.
   * Enables efficient incremental syncs for group changes.
   *
   * API Endpoint: GET /groups/delta?$top={PAGE_SIZE}
   * Required Permission: Group.Read.All
   *
   * @param deltaLink - Optional delta link from previous delta query
   * @returns Paged response with changed groups and @odata.deltaLink
   *
   * @example
   * const response = await client.getGroupsDelta(storedDeltaLink);
   */
  async getGroupsDelta(deltaLink?: string): Promise<GraphPagedResponse<EntraGroup>> {
    // Use provided deltaLink or construct initial delta query URL
    const url = deltaLink || `/groups/delta?$top=${PAGE_SIZE}`;

    // Execute GET request and return delta response
    return this.get<GraphPagedResponse<EntraGroup>>(url);
  }

  /**
   * List Group Members - Paginated
   *
   * Retrieves all members (users, groups, service principals) of a specific group.
   * Supports pagination for groups with many members.
   *
   * API Endpoint: GET /groups/{id}/members?$top={PAGE_SIZE}
   * Required Permission: GroupMember.Read.All
   *
   * @param groupId - Unique identifier (GUID) of the group
   * @param nextLink - Optional continuation URL from previous page response
   * @returns Paged response containing group members
   *
   * @example
   * const members = await client.listGroupMembers('12345678-1234-1234-1234-123456789012');
   * console.log(`Group has ${members.value.length} members`);
   */
  async listGroupMembers(
    groupId: string,
    nextLink?: string
  ): Promise<GraphPagedResponse<EntraDirectoryRoleMember>> {
    // Construct URL with encoded group ID or use provided nextLink
    const url = nextLink || `/groups/${encodeURIComponent(groupId)}/members?$top=${PAGE_SIZE}`;

    // Execute GET request and return paged response
    return this.get<GraphPagedResponse<EntraDirectoryRoleMember>>(url);
  }

  async listDirectoryRolesPage(nextLink?: string): Promise<GraphPagedResponse<EntraDirectoryRole>> {
    // directoryRoles does NOT support $top — returns all roles in a single call
    const url = nextLink || `/directoryRoles`;
    return this.get<GraphPagedResponse<EntraDirectoryRole>>(url);
  }

  async getDirectoryRolesDelta(deltaLink?: string): Promise<GraphPagedResponse<EntraDirectoryRole>> {
    // directoryRoles/delta does not support $top either
    const url = deltaLink || `/directoryRoles/delta`;
    return this.get<GraphPagedResponse<EntraDirectoryRole>>(url);
  }

  async listApplicationsPage(nextLink?: string): Promise<GraphPagedResponse<EntraApplication>> {
    const url = nextLink || `/applications?$top=${PAGE_SIZE}`;
    return this.get<GraphPagedResponse<EntraApplication>>(url);
  }

  async getApplicationsDelta(deltaLink?: string): Promise<GraphPagedResponse<EntraApplication>> {
    const url = deltaLink || `/applications/delta?$top=${PAGE_SIZE}`;
    return this.get<GraphPagedResponse<EntraApplication>>(url);
  }

  async listServicePrincipalsPage(nextLink?: string): Promise<GraphPagedResponse<EntraServicePrincipal>> {
    const url = nextLink || `/servicePrincipals?$top=${PAGE_SIZE}`;
    return this.get<GraphPagedResponse<EntraServicePrincipal>>(url);
  }

  async getServicePrincipalsDelta(deltaLink?: string): Promise<GraphPagedResponse<EntraServicePrincipal>> {
    const url = deltaLink || `/servicePrincipals/delta?$top=${PAGE_SIZE}`;
    return this.get<GraphPagedResponse<EntraServicePrincipal>>(url);
  }

  async listDevicesPage(nextLink?: string): Promise<GraphPagedResponse<EntraDevice>> {
    const url = nextLink || `/devices?$top=${PAGE_SIZE}`;
    return this.get<GraphPagedResponse<EntraDevice>>(url);
  }

  async getDevicesDelta(deltaLink?: string): Promise<GraphPagedResponse<EntraDevice>> {
    const url = deltaLink || `/devices/delta?$top=${PAGE_SIZE}`;
    return this.get<GraphPagedResponse<EntraDevice>>(url);
  }

  async listOrgContactsPage(nextLink?: string): Promise<GraphPagedResponse<EntraOrgContact>> {
    const url = nextLink || `/contacts?$top=${PAGE_SIZE}`;
    return this.get<GraphPagedResponse<EntraOrgContact>>(url);
  }

  async getOrgContactsDelta(deltaLink?: string): Promise<GraphPagedResponse<EntraOrgContact>> {
    const url = deltaLink || `/contacts/delta?$top=${PAGE_SIZE}`;
    return this.get<GraphPagedResponse<EntraOrgContact>>(url);
  }

  async listExtensionProperties(appId: string): Promise<EntraExtensionProperty[]> {
    const response = await this.get<GraphPagedResponse<EntraExtensionProperty>>(
      `/applications/${encodeURIComponent(appId)}/extensionProperties`
    );
    return response.value;
  }

  async listApplicationsForExtensionDiscovery(): Promise<EntraApplication[]> {
    // Get first page of apps to find extension property registrations
    const response = await this.get<GraphPagedResponse<EntraApplication>>(`/applications?$top=100`);
    return response.value;
  }

  // ── NEW: Device Registered Owners ──────────────────────────────────────────
  async listDeviceRegisteredOwners(deviceId: string): Promise<GraphPagedResponse<EntraUser>> {
    const url = `/devices/${encodeURIComponent(deviceId)}/registeredOwners`;
    return this.get<GraphPagedResponse<EntraUser>>(url);
  }

  // ── NEW: Device Full Details ───────────────────────────────────────────────
  async getDeviceDetails(deviceId: string): Promise<EntraDevice> {
    const url = `/devices/${encodeURIComponent(deviceId)}?$select=id,manufacturer,model,profileType`;
    return this.get<EntraDevice>(url);
  }

  // ── NEW ENTITIES: App Roles & Assignments ──────────────────────────────────

  async listAppRoles(servicePrincipalId: string): Promise<EntraAppRole[]> {
    const url = `/servicePrincipals/${encodeURIComponent(servicePrincipalId)}?$select=appRoles`;
    const response = await this.get<{ appRoles: EntraAppRole[] }>(url);
    return response.appRoles || [];
  }

  async listAppRoleAssignments(
    servicePrincipalId: string,
    nextLink?: string
  ): Promise<GraphPagedResponse<EntraAppRoleAssignment>> {
    const url = nextLink || `/servicePrincipals/${encodeURIComponent(servicePrincipalId)}/appRoleAssignedTo?$top=${PAGE_SIZE}`;
    return this.get<GraphPagedResponse<EntraAppRoleAssignment>>(url);
  }

  // ── NEW ENTITIES: Authentication Methods ───────────────────────────────────

  async listAuthenticationMethods(userId: string): Promise<GraphPagedResponse<EntraAuthenticationMethod>> {
    const url = `/users/${encodeURIComponent(userId)}/authentication/methods`;
    return this.get<GraphPagedResponse<EntraAuthenticationMethod>>(url);
  }

  async getAuthenticationMethodsPolicy(): Promise<EntraAuthenticationMethodsPolicy> {
    const url = `/policies/authenticationMethodsPolicy`;
    return this.get<EntraAuthenticationMethodsPolicy>(url);
  }

  // ── NEW ENTITIES: License Assignments ──────────────────────────────────────

  async listLicenseDetails(userId: string): Promise<GraphPagedResponse<EntraLicenseDetails>> {
    const url = `/users/${encodeURIComponent(userId)}/licenseDetails`;
    return this.get<GraphPagedResponse<EntraLicenseDetails>>(url);
  }

  // ── NEW ENTITIES: PIM Eligible Roles ───────────────────────────────────────

  async listPIMEligibleRoles(
    nextLink?: string
  ): Promise<GraphPagedResponse<EntraPIMRoleEligibilitySchedule>> {
    const url = nextLink || `/roleManagement/directory/roleEligibilitySchedules?$top=${PAGE_SIZE}`;
    return this.get<GraphPagedResponse<EntraPIMRoleEligibilitySchedule>>(url);
  }

  // ── NEW ENTITIES: Conditional Access Policies ──────────────────────────────

  async listConditionalAccessPolicies(
    nextLink?: string
  ): Promise<GraphPagedResponse<EntraConditionalAccessPolicy>> {
    const url = nextLink || `/identity/conditionalAccess/policies?$top=${PAGE_SIZE}`;
    return this.get<GraphPagedResponse<EntraConditionalAccessPolicy>>(url);
  }

  // ── NEW ENTITIES: Lifecycle Workflows ──────────────────────────────────────

  async listLifecycleWorkflows(
    nextLink?: string
  ): Promise<GraphPagedResponse<EntraLifecycleWorkflow>> {
    const url = nextLink || `/identityGovernance/lifecycleWorkflows/workflows?$top=${PAGE_SIZE}`;
    return this.get<GraphPagedResponse<EntraLifecycleWorkflow>>(url);
  }

  // ── NEW ENTITIES: Directory Audit Logs ─────────────────────────────────────

  async listDirectoryAudits(
    startDateTime: string,
    nextLink?: string
  ): Promise<GraphPagedResponse<EntraDirectoryAudit>> {
    const url =
      nextLink ||
      `/auditLogs/directoryAudits?$filter=activityDateTime ge ${encodeURIComponent(startDateTime)}&$top=${PAGE_SIZE}&$orderby=activityDateTime desc`;
    return this.get<GraphPagedResponse<EntraDirectoryAudit>>(url);
  }

  // ── NEW ENTITIES: Sign-In Logs ─────────────────────────────────────────────

  async listSignIns(
    startDateTime: string,
    nextLink?: string
  ): Promise<GraphPagedResponse<EntraSignIn>> {
    const url =
      nextLink ||
      `/auditLogs/signIns?$filter=createdDateTime ge ${encodeURIComponent(startDateTime)}&$top=${PAGE_SIZE}&$orderby=createdDateTime desc`;
    return this.get<GraphPagedResponse<EntraSignIn>>(url);
  }
}
