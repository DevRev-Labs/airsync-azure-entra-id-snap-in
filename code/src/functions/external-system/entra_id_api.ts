import axios, { AxiosInstance } from 'axios';
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
} from './types';
import {
  DEFAULT_RATE_LIMIT_DELAY_SECONDS,
  GRAPH_BASE_URL,
  HTTP_REQUEST_TIMEOUT_MS,
  MAX_RETRIES,
  PAGE_SIZE,
} from '../common/constants';
import { formatError } from '../common/utils';

/**
 * Acquire an OAuth 2.0 access token using client credentials flow.
 * Called once per extraction invocation; the result is used for all Graph API calls.
 *
 * connection_data.org_id  = tenantId  (stored via is_subdomain: true)
 * connection_data.key     = `${clientId}|${clientSecret}` (via secret_transform)
 */
export async function acquireAccessToken(tenantId: string, clientId: string, clientSecret: string): Promise<string> {
  const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    scope: 'https://graph.microsoft.com/.default',
    grant_type: 'client_credentials',
  });

  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await axios.post<{ access_token: string }>(tokenUrl, params.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: HTTP_REQUEST_TIMEOUT_MS,
      });
      return response.data.access_token;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        if (status === 400 || status === 401) throw error; // non-retryable
      }
      lastError = error;
      await new Promise((r) => setTimeout(r, attempt * 1000));
    }
  }
  throw lastError;
}

export class EntraIDClient {
  private client: AxiosInstance;

  constructor(accessToken: string) {
    this.client = axios.create({
      baseURL: GRAPH_BASE_URL,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      timeout: HTTP_REQUEST_TIMEOUT_MS,
    });
  }

  private async get<T>(url: string, params?: Record<string, unknown>): Promise<T> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const response = await this.client.get<T>(url, { params });
        return response.data;
      } catch (error) {
        if (axios.isAxiosError(error)) {
          const status = error.response?.status;
          // Non-retryable errors — throw immediately
          if (status === 400 || status === 401 || status === 403 || status === 404 || status === 410) {
            throw error;
          }
          // Retryable errors (5xx, network) — retry with backoff
          if (status && status >= 500) {
            lastError = error;
            const backoffMs = attempt * 1000;
            console.warn(`[EntraIDClient] HTTP ${status} on attempt ${attempt}/${MAX_RETRIES}, retrying in ${backoffMs}ms`);
            await new Promise((r) => setTimeout(r, backoffMs));
            continue;
          }
        }
        throw error;
      }
    }
    throw lastError;
  }

  async getOrganization(): Promise<EntraOrganization> {
    const response = await this.get<GraphPagedResponse<EntraOrganization>>('/organization');
    const org = response.value[0];
    if (!org) throw new Error('No organization data returned from Microsoft Graph');
    return org;
  }

  async listUsersPage(nextLink?: string): Promise<GraphPagedResponse<EntraUser>> {
    const url = nextLink || `/users?$top=${PAGE_SIZE}`;
    return this.get<GraphPagedResponse<EntraUser>>(url);
  }

  async getUsersDelta(deltaLink?: string): Promise<GraphPagedResponse<EntraUser>> {
    const url = deltaLink || `/users/delta?$top=${PAGE_SIZE}`;
    return this.get<GraphPagedResponse<EntraUser>>(url);
  }

  async listGroupsPage(nextLink?: string): Promise<GraphPagedResponse<EntraGroup>> {
    const url = nextLink || `/groups?$top=${PAGE_SIZE}`;
    return this.get<GraphPagedResponse<EntraGroup>>(url);
  }

  async getGroupsDelta(deltaLink?: string): Promise<GraphPagedResponse<EntraGroup>> {
    const url = deltaLink || `/groups/delta?$top=${PAGE_SIZE}`;
    return this.get<GraphPagedResponse<EntraGroup>>(url);
  }

  async listGroupMembers(groupId: string, nextLink?: string): Promise<GraphPagedResponse<EntraDirectoryRoleMember>> {
    const url = nextLink || `/groups/${encodeURIComponent(groupId)}/members?$top=${PAGE_SIZE}`;
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

  async listRoleMembers(roleId: string, nextLink?: string): Promise<GraphPagedResponse<EntraDirectoryRoleMember>> {
    const url = nextLink || `/directoryRoles/${encodeURIComponent(roleId)}/members?$top=${PAGE_SIZE}`;
    return this.get<GraphPagedResponse<EntraDirectoryRoleMember>>(url);
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
}
