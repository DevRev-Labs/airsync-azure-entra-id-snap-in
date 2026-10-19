/**
 * Branch coverage for data-extraction: per-entity error handling (429 / 401 /
 * 403 / 400 / 410 / 5xx), INITIAL vs INCREMENTAL paths, and timeout + resume
 * at every client-call checkpoint.
 */

type TaskResult = { status: string; delaySeconds?: number; error?: { message: string } };
type TaskHandlers = { task: (args: { adapter: unknown }) => Promise<TaskResult> };

let handlers: TaskHandlers;

jest.mock('@devrev/airsync-sdk', () => ({
  ...jest.requireActual('@devrev/airsync-sdk'),
  processExtractionTask: (h: TaskHandlers) => {
    handlers = h;
  },
}));

jest.mock('../../../common/utils', () => ({
  ...jest.requireActual('../../../common/utils'),
  wait: jest.fn().mockResolvedValue(undefined),
}));

type ClientFn = (...args: unknown[]) => Promise<unknown>;
let client: Record<string, jest.Mock> = {};
let clientCalls = 0;

jest.mock('../../../external-system/entra-id-api', () => ({
  acquireAccessToken: jest.fn().mockResolvedValue('token'),
  EntraIDClient: jest.fn().mockImplementation(() =>
    new Proxy(
      {},
      {
        get: (_t, prop: string) => (...args: unknown[]) => {
          clientCalls++;
          const fn = client[prop];
          if (!fn) throw new Error(`unmocked client method ${prop}`);
          return (fn as unknown as ClientFn)(...args);
        },
      }
    )
  ),
}));

import { EventType } from '@devrev/airsync-sdk';
import { AxiosError, AxiosResponse } from 'axios';

import { getInitialState, State } from '../../../common/state';
import '../data-extraction';

const OLD = '2020-01-01T00:00:00Z';

function httpError(status: number, data: unknown = {}): AxiosError {
  return new AxiosError(`HTTP ${status}`, 'ERR', undefined, undefined, {
    status,
    statusText: '',
    headers: { 'retry-after': '7' },
    data,
    config: { headers: {} },
  } as unknown as AxiosResponse);
}

const page = (value: unknown[], extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  value,
  ...extra,
});

function buildClient(): Record<string, jest.Mock> {
  const user = (id: string): Record<string, unknown> => ({
    id,
    displayName: `User ${id}`,
    givenName: 'G',
    surname: 'S',
    mail: `${id}@contoso.com`,
    userPrincipalName: `${id}@contoso.com`,
    accountEnabled: true,
    createdDateTime: OLD,
  });
  return {
    listDirectoryAudits: jest.fn(async (_start: string, next?: string) => {
      const audit = (id: string): Record<string, unknown> => ({
        id: `a-${id}`,
        result: 'success',
        activityDisplayName: 'Update user',
        activityDateTime: OLD,
        category: 'UserManagement',
        targetResources: [
          {
            id,
            type: 'User',
            modifiedProperties: [{ displayName: 'DisplayName', newValue: '"Audited Name"' }],
          },
        ],
      });
      if (!next) return page([audit('u1'), { result: 'failure' }], { '@odata.nextLink': 'audit-p2' });
      return page([audit('fallback-user')]);
    }),
    getUsersDelta: jest.fn(async (link?: string) => {
      if (link === 'users-p2') {
        return page([user('missing'), { id: 'gone', '@removed': { reason: 'deleted' } }], {
          '@odata.deltaLink': 'delta-users',
        });
      }
      return page([user('u1'), user('u3')], { '@odata.nextLink': 'users-p2' });
    }),
    getUser: jest.fn(async (id: string) => (id === 'missing' ? null : user(id))),
    getGroupsDelta: jest.fn(async () =>
      page(
        [
          {
            id: 'g1',
            displayName: 'Group',
            createdDateTime: OLD,
            'members@delta': [
              { id: 'u1' },
              { id: 'u2', '@removed': { reason: 'deleted' } },
              { id: 'sp1', '@odata.type': '#microsoft.graph.servicePrincipal' },
            ],
          },
          { id: 'g-gone', '@removed': { reason: 'deleted' } },
        ],
        { '@odata.deltaLink': 'delta-groups' }
      )
    ),
    listGroupMembers: jest.fn(async (_id: string, next?: string) =>
      next
        ? page([{ id: 'u2', '@odata.type': '#microsoft.graph.user' }])
        : page([{ id: 'u1' }, { id: 'd1', '@odata.type': '#microsoft.graph.device' }], {
            '@odata.nextLink': 'members-p2',
          })
    ),
    getDirectoryRolesDelta: jest.fn(async () =>
      page([{ id: 'r1', displayName: 'Admin' }], { '@odata.deltaLink': 'delta-roles' })
    ),
    getApplicationsDelta: jest.fn(async () =>
      page([{ id: 'app1', displayName: 'App', createdDateTime: OLD }], { '@odata.deltaLink': 'delta-apps' })
    ),
    getServicePrincipalsDelta: jest.fn(async () =>
      page(
        [
          { id: 'sp1', displayName: 'SP', appId: 'app1' },
          { id: 'sp2', displayName: 'SP2', appId: 'app2' },
          { id: 'sp-gone', '@removed': { reason: 'deleted' } },
        ],
        { '@odata.deltaLink': 'delta-sps' }
      )
    ),
    getDevicesDelta: jest.fn(async () =>
      page(
        [
          { id: 'd1', displayName: 'Laptop', operatingSystem: 'Windows', createdDateTime: OLD },
          { id: 'd2', displayName: 'Phone', operatingSystem: 'iOS', createdDateTime: OLD },
          { id: 'd-gone', '@removed': { reason: 'deleted' } },
        ],
        { '@odata.deltaLink': 'delta-devices' }
      )
    ),
    listDeviceRegisteredOwners: jest.fn(async (id: string) =>
      id === 'd2' ? page([]) : page([{ id: 'u1', mail: 'u1@contoso.com', displayName: 'U1' }])
    ),
    getDeviceDetails: jest.fn(async () => ({ manufacturer: 'Contoso', model: 'X1', profileType: 'RegisteredDevice' })),
    getOrgContactsDelta: jest.fn(async () =>
      page([{ id: 'c1', displayName: 'Contact' }], { '@odata.deltaLink': 'delta-contacts' })
    ),
    listAppRoles: jest.fn(async () => [
      { id: 'ar1', displayName: 'Reader', value: 'Read', allowedMemberTypes: ['User'] },
      { id: 'ar2', value: 'Write', allowedMemberTypes: ['User'] },
    ]),
    listAppRoleAssignments: jest.fn(async (_sp: string, next?: string) =>
      next
        ? page([])
        : page(
            [
              {
                id: 'asg1',
                appRoleId: 'ar1',
                resourceId: 'sp1',
                principalId: 'u1',
                principalType: 'User',
                createdDateTime: OLD,
              },
            ],
            { '@odata.nextLink': 'asg-p2' }
          )
    ),
    listAuthenticationMethods: jest.fn(async () =>
      page([{ id: 'm1', '@odata.type': '#microsoft.graph.passwordAuthenticationMethod' }])
    ),
    getAuthenticationMethodsPolicy: jest.fn(async () => ({
      id: 'policy',
      displayName: 'Default',
      registrationEnforcement: {},
      authenticationMethodConfigurations: [],
    })),
    listLicenseDetails: jest.fn(async () => page([{ id: 'l1', skuId: 'sku', skuPartNumber: 'E5' }])),
    listPIMEligibleRoles: jest.fn(async () => page([])),
    listConditionalAccessPolicies: jest.fn(async () => page([])),
    listLifecycleWorkflows: jest.fn(async () => page([])),
    listSignIns: jest.fn(async () => page([])),
  };
}

type Repos = Map<string, Array<Record<string, unknown>>>;

function makeAdapter(
  mode: 'INITIAL' | 'INCREMENTAL',
  state: State,
  repos: Repos,
  timeoutAfterCalls = Infinity,
  eventType: EventType = EventType.StartExtractingData
): Record<string, unknown> {
  const startCalls = clientCalls;
  return {
    get isTimeout(): boolean {
      return clientCalls - startCalls >= timeoutAfterCalls;
    },
    event: {
      payload: {
        event_type: eventType,
        event_context: { mode, extract_from: mode === 'INCREMENTAL' ? OLD : undefined },
        connection_data: {
          org_id: 'contoso.onmicrosoft.com',
          key: '12345678-1234-1234-1234-123456789012|client-secret-value',
        },
      },
    },
    state,
    initializeRepos: jest.fn(),
    getRepo: (itemType: string) => ({
      push: async (items: Array<Record<string, unknown>>): Promise<void> => {
        repos.set(itemType, [...(repos.get(itemType) ?? []), ...items]);
      },
    }),
  };
}

function incrementalState(): State {
  const s = getInitialState();
  s.userNormalizationVersion = 3;
  s.parentIdsBaselineVersion = 1;
  s.userDeltaInitialized = true;
  s.users.ids = ['u1', 'gone'];
  s.servicePrincipals.ids = ['sp1'];
  s.deltaLinks = {
    users: 'delta-users',
    groups: 'delta-groups',
    directoryRoles: 'delta-roles',
    applications: 'delta-apps',
    servicePrincipals: 'delta-sps',
    devices: 'delta-devices',
    orgContacts: 'delta-contacts',
  };
  s.lastAuditLogSync = OLD;
  s.lastSignInLogSync = OLD;
  return s;
}

async function run(
  mode: 'INITIAL' | 'INCREMENTAL',
  state = mode === 'INITIAL' ? getInitialState() : incrementalState(),
  timeoutAfterCalls = Infinity,
  repos: Repos = new Map()
): Promise<{ result: TaskResult; state: State; repos: Repos }> {
  const adapter = makeAdapter(mode, state, repos, timeoutAfterCalls);
  const result = await handlers.task({ adapter });
  return { result, state, repos };
}

beforeEach(() => {
  clientCalls = 0;
  client = buildClient();
});

describe('data-extraction happy paths', () => {
  it('INITIAL extracts every entity and records parent ids', async () => {
    const { result, state, repos } = await run('INITIAL');
    expect(result).toEqual({ status: 'success' });
    expect(state.users.completed).toBe(true);
    expect(state.groupMembers.completed).toBe(true);
    expect(repos.get('group_members')?.length).toBe(2);
    expect(repos.get('devices')?.map((d) => d.id)).toEqual(['d1', 'd2']);
    expect(state.parentIdsBaselineVersion).toBe(1);
  });

  it('INCREMENTAL uses audit overlay, fallback hydration and members@delta', async () => {
    const { result, state, repos } = await run('INCREMENTAL');
    expect(result).toEqual({ status: 'success' });
    const userIds = repos.get('users')?.map((u) => u.id);
    expect(userIds).toEqual(expect.arrayContaining(['u1', 'fallback-user']));
    expect(userIds).not.toContain('missing');
    expect(state.users.ids).not.toContain('gone');
    const removal = repos
      .get('group_members')
      ?.find((m) => (m.data as Record<string, unknown>).remove_member_ids);
    expect(removal?.id).toBe('g1_u2');
    expect(state.userDeltaInitialized).toBe(true);
  });

  it('INCREMENTAL rebuilds parent-id baselines once for legacy state', async () => {
    const state = incrementalState();
    state.parentIdsBaselineVersion = 0;
    state.userNormalizationVersion = 1;
    const { result } = await run('INCREMENTAL', state);
    expect(result.status).toBe('success');
    expect(client.getUsersDelta).toHaveBeenCalledWith(undefined);
    expect(state.parentIdsBaselineVersion).toBe(1);
  });

  it('skips the audit preflight when audit logs are forbidden', async () => {
    client.listDirectoryAudits.mockRejectedValue(httpError(403));
    const { result, state } = await run('INCREMENTAL');
    expect(result.status).toBe('success');
    expect(state.directoryAuditLogs.skipped).toBe(true);
  });

  it('records non-throttle child enrichment failures and continues', async () => {
    client.listDeviceRegisteredOwners.mockRejectedValue(httpError(500));
    client.getDeviceDetails.mockRejectedValue(httpError(404));
    client.listAppRoles.mockRejectedValue(httpError(404));
    client.listAppRoleAssignments.mockRejectedValue(httpError(404));
    client.listAuthenticationMethods.mockRejectedValue(httpError(404));
    client.listLicenseDetails.mockRejectedValue(httpError(404));
    const { result, repos } = await run('INITIAL');
    expect(result.status).toBe('success');
    expect(repos.get('devices')?.length).toBe(2);
  });

  it('treats syncStateNotFound as an expired delta', async () => {
    client.getGroupsDelta.mockRejectedValueOnce(
      httpError(400, { error: { code: 'syncStateNotFound' } })
    );
    const { result, state } = await run('INCREMENTAL');
    expect(result).toEqual({ status: 'progress' });
    expect(state.deltaLinks.groups).toBeUndefined();
  });
});

const METHODS = Object.keys(buildClient());
const STATUSES = [429, 401, 403, 400, 410, 500];

describe.each(['INITIAL', 'INCREMENTAL'] as const)('error matrix (%s)', (mode) => {
  it.each(METHODS.flatMap((m) => STATUSES.map((s) => [m, s] as const)))(
    '%s → HTTP %i',
    async (method, status) => {
      client[method].mockRejectedValue(httpError(status));
      const { result } = await run(mode);
      if (status === 429) {
        if (client[method].mock.calls.length > 0) {
          expect(result).toEqual({ status: 'delay', delaySeconds: 7 });
        }
      } else if (status === 401) {
        if (client[method].mock.calls.length > 0) {
          expect(result).toEqual({ status: 'delay', delaySeconds: 60 });
        }
      } else {
        expect(['success', 'progress', 'error']).toContain(result.status);
      }
    }
  );
});

describe.each(['INITIAL', 'INCREMENTAL'] as const)('timeout + resume (%s)', (mode) => {
  const totalCalls = 90;
  it.each(Array.from({ length: totalCalls }, (_, k) => k))(
    'times out after %i client calls, then resumes to success',
    async (k) => {
      const state = mode === 'INITIAL' ? getInitialState() : incrementalState();
      const repos: Repos = new Map();
      const first = await run(mode, state, k, repos);
      expect(['progress', 'success']).toContain(first.result.status);

      let result = first.result;
      for (let attempt = 0; attempt < 3 && result.status === 'progress'; attempt++) {
        const adapter = makeAdapter(mode, state, repos, Infinity, EventType.ContinueExtractingData);
        result = await handlers.task({ adapter });
      }
      expect(result).toEqual({ status: 'success' });

      const devices = repos.get('devices') ?? [];
      const ids = devices.map((d) => d.id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const d of devices) {
        expect((d.data as Record<string, unknown>).manufacturer).toBe('Contoso');
      }
    }
  );
});
