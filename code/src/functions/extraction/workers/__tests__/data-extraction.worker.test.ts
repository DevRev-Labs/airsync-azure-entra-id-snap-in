/**
 * Smoke coverage for data-extraction: INITIAL run with empty Graph pages
 * completes and returns TaskResult success.
 */

type TaskHandlers = {
  task: (args: { adapter: unknown }) => Promise<{ status: string }>;
};

let handlers: TaskHandlers;

jest.mock('@devrev/airsync-sdk', () => {
  const actual = jest.requireActual('@devrev/airsync-sdk');
  return {
    ...actual,
    processExtractionTask: (h: TaskHandlers) => {
      handlers = h;
    },
  };
});

const emptyPage = { value: [], '@odata.nextLink': undefined, '@odata.deltaLink': 'delta-link' };
const mockAcquireAccessToken = jest.fn().mockResolvedValue('token');

const clientMethods = {
  getUsersDelta: jest.fn().mockResolvedValue(emptyPage),
  getUser: jest.fn(),
  listDirectoryAudits: jest.fn().mockResolvedValue({ value: [], '@odata.nextLink': undefined }),
  getGroupsDelta: jest.fn().mockResolvedValue(emptyPage),
  listGroupMembers: jest.fn().mockResolvedValue({ value: [], '@odata.nextLink': undefined }),
  getDirectoryRolesDelta: jest.fn().mockResolvedValue(emptyPage),
  getApplicationsDelta: jest.fn().mockResolvedValue(emptyPage),
  getServicePrincipalsDelta: jest.fn().mockResolvedValue(emptyPage),
  listAppRoleAssignments: jest.fn().mockResolvedValue({ value: [], '@odata.nextLink': undefined }),
  getDevicesDelta: jest.fn().mockResolvedValue(emptyPage),
  listDeviceRegisteredOwners: jest.fn().mockResolvedValue({ value: [] }),
  getDeviceDetails: jest.fn(),
  getOrgContactsDelta: jest.fn().mockResolvedValue(emptyPage),
  listAppRoles: jest.fn().mockResolvedValue([]),
  getAuthenticationMethodsPolicy: jest.fn().mockResolvedValue({
    id: 'policy',
    displayName: 'Default',
    description: '',
    policyVersion: 1,
    lastModifiedDateTime: '2024-01-01T00:00:00Z',
    registrationEnforcement: {},
    authenticationMethodConfigurations: [],
  }),
  listAuthenticationMethods: jest.fn().mockResolvedValue({ value: [] }),
  listLicenseDetails: jest.fn().mockResolvedValue({ value: [] }),
  listPIMEligibleRoles: jest.fn().mockResolvedValue({ value: [], '@odata.nextLink': undefined }),
  listConditionalAccessPolicies: jest.fn().mockResolvedValue({ value: [], '@odata.nextLink': undefined }),
  listLifecycleWorkflows: jest.fn().mockResolvedValue({ value: [], '@odata.nextLink': undefined }),
  listSignIns: jest.fn().mockResolvedValue({ value: [], '@odata.nextLink': undefined }),
};

jest.mock('../../../external-system/entra-id-api', () => ({
  acquireAccessToken: (...args: unknown[]) => mockAcquireAccessToken(...args),
  EntraIDClient: jest.fn().mockImplementation(() => clientMethods),
}));

import { EventType } from '@devrev/airsync-sdk';

import { getInitialState } from '../../../common/state';
import '../data-extraction';

describe('data-extraction worker', () => {
  it('returns success on empty INITIAL extraction', async () => {
    const repos = new Map<string, { push: jest.Mock }>();
    const adapter = {
      isTimeout: false,
      event: {
        payload: {
          event_type: EventType.StartExtractingData,
          event_context: { mode: 'INITIAL', extract_from: undefined },
          connection_data: {
            org_id: 'contoso.onmicrosoft.com',
            key: '12345678-1234-1234-1234-123456789012|client-secret-value',
          },
        },
      },
      state: getInitialState(),
      initializeRepos: jest.fn(),
      getRepo: (itemType: string) => {
        if (!repos.has(itemType)) {
          repos.set(itemType, { push: jest.fn().mockResolvedValue(undefined) });
        }
        return repos.get(itemType);
      },
    };

    const result = await handlers.task({ adapter });
    expect(result.status).toBe('success');
    expect(adapter.state.users.completed).toBe(true);
  });

  it('returns delay when token acquisition is rate-limited', async () => {
    const axios = require('axios');
    const rateLimitError = {
      isAxiosError: true,
      response: { status: 429, headers: { 'retry-after': '12' }, data: {} },
      message: 'rate limited',
    };
    jest.spyOn(axios, 'isAxiosError').mockReturnValue(true);
    mockAcquireAccessToken.mockRejectedValueOnce(rateLimitError);

    const adapter = {
      isTimeout: false,
      event: {
        payload: {
          event_type: EventType.StartExtractingData,
          event_context: { mode: 'INITIAL' },
          connection_data: {
            org_id: 'contoso.onmicrosoft.com',
            key: '12345678-1234-1234-1234-123456789012|client-secret-value',
          },
        },
      },
      state: getInitialState(),
      getRepo: jest.fn(),
    };

    const result = await handlers.task({ adapter });
    expect(result).toEqual({ status: 'delay', delaySeconds: 12 });
  });
});
