/**
 * TaskResult coverage for the external-sync-units, metadata and attachments
 * workers. processExtractionTask is captured per worker module so each task
 * handler can be invoked with a mock adapter.
 */
import { AxiosError, AxiosResponse } from 'axios';

type TaskResult = { status: string; delaySeconds?: number; error?: { message: string } };
type TaskHandlers = { task: (args: { adapter: unknown }) => Promise<TaskResult> };

const captured: TaskHandlers[] = [];

jest.mock('@devrev/airsync-sdk', () => ({
  ...jest.requireActual('@devrev/airsync-sdk'),
  processExtractionTask: (handlers: TaskHandlers) => {
    captured.push(handlers);
  },
}));

const mockAcquireAccessToken = jest.fn();
const mockGetOrganization = jest.fn();
const mockListApplicationsForExtensionDiscovery = jest.fn();
const mockListExtensionProperties = jest.fn();

jest.mock('../../../external-system/entra-id-api', () => ({
  acquireAccessToken: (...args: unknown[]) => mockAcquireAccessToken(...args),
  EntraIDClient: jest.fn().mockImplementation(() => ({
    getOrganization: mockGetOrganization,
    listApplicationsForExtensionDiscovery: mockListApplicationsForExtensionDiscovery,
    listExtensionProperties: mockListExtensionProperties,
  })),
}));

const mockTrackUsageEvent = jest.fn();
const mockFromServiceToken = jest.fn();

jest.mock('../../../common/labs-usage', () => ({
  LabsUsageTracker: {
    fromServiceToken: (...args: unknown[]) => mockFromServiceToken(...args),
  },
}));

import { getInitialState, State } from '../../../common/state';
import '../external-sync-units-extraction';
import '../metadata-extraction';
import '../attachments-extraction';

const [esuHandlers, metadataHandlers, attachmentsHandlers] = captured;

const CONNECTION_DATA = {
  org_id: 'contoso.onmicrosoft.com',
  key: '12345678-1234-1234-1234-123456789012|client-secret-value',
};

function httpError(status: number): AxiosError {
  return new AxiosError(`HTTP ${status}`, 'ERR', undefined, undefined, {
    status,
    statusText: '',
    headers: { 'retry-after': '9' },
    data: {},
    config: { headers: {} },
  } as unknown as AxiosResponse);
}

function makeAdapter(overrides: Record<string, unknown> = {}): {
  adapter: Record<string, unknown>;
  push: jest.Mock;
} {
  const push = jest.fn().mockResolvedValue(undefined);
  return {
    push,
    adapter: {
      event: { payload: { connection_data: CONNECTION_DATA } },
      initializeRepos: jest.fn(),
      getRepo: jest.fn().mockReturnValue({ push }),
      isTimeout: false,
      state: {},
      ...overrides,
    },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockAcquireAccessToken.mockResolvedValue('token');
  mockGetOrganization.mockResolvedValue({ id: 'tenant-1', displayName: 'Contoso' });
  mockListApplicationsForExtensionDiscovery.mockResolvedValue([]);
  mockListExtensionProperties.mockResolvedValue([]);
  mockFromServiceToken.mockReturnValue(null);
});

describe('external-sync-units-extraction', () => {
  it('pushes the tenant sync unit and returns success', async () => {
    const { adapter, push } = makeAdapter();
    expect(await esuHandlers.task({ adapter })).toEqual({ status: 'success' });
    expect(push).toHaveBeenCalledWith([expect.objectContaining({ id: 'tenant-1', name: 'Contoso' })]);
  });

  it('falls back to the tenant id when displayName is missing', async () => {
    mockGetOrganization.mockResolvedValue({ id: 'tenant-1' });
    const { adapter, push } = makeAdapter();
    await esuHandlers.task({ adapter });
    expect(push).toHaveBeenCalledWith([expect.objectContaining({ name: 'tenant-1' })]);
  });

  it('returns a delay when the token endpoint is throttled', async () => {
    mockAcquireAccessToken.mockRejectedValue(httpError(429));
    const { adapter } = makeAdapter();
    expect(await esuHandlers.task({ adapter })).toEqual({ status: 'delay', delaySeconds: 9 });
  });

  it('returns error when organization fetch fails', async () => {
    mockGetOrganization.mockRejectedValue(new Error('org failed'));
    const { adapter } = makeAdapter();
    const result = await esuHandlers.task({ adapter });
    expect(result.status).toBe('error');
    expect(result.error?.message).toContain('org failed');
  });
});

describe('metadata-extraction', () => {
  it('publishes the static EDM when no apps define extensions', async () => {
    const { adapter, push } = makeAdapter();
    expect(await metadataHandlers.task({ adapter })).toEqual({ status: 'success' });
    expect(push).toHaveBeenCalledTimes(1);
  });

  it('adds user extension fields and tolerates per-app failures', async () => {
    mockListApplicationsForExtensionDiscovery.mockResolvedValue([{ id: 'a1' }, { id: 'a2' }]);
    mockListExtensionProperties.mockImplementation(async (appId: string) => {
      if (appId === 'a2') throw httpError(500);
      return [
        { name: 'extension_abc_EmployeeId', dataType: 'String', targetObjects: ['User'] },
        { name: 'extension_abc_Flag', dataType: 'Boolean', targetObjects: ['User'] },
        { name: 'extension_abc_Count', dataType: 'Integer', targetObjects: ['User'] },
        { name: 'extension_abc_When', dataType: 'DateTime', targetObjects: ['User'] },
        { name: 'extension_abc_Blob', dataType: 'Binary', targetObjects: ['User'] },
        { name: 'extension_abc_Group', dataType: 'String', targetObjects: ['Group'] },
      ];
    });
    const { adapter, push } = makeAdapter();
    expect(await metadataHandlers.task({ adapter })).toEqual({ status: 'success' });
    const edm = push.mock.calls[0][0][0];
    expect(edm.record_types.users.fields).toEqual(
      expect.objectContaining({
        extension_abc_EmployeeId: expect.any(Object),
        extension_abc_Flag: expect.any(Object),
      })
    );
    expect(edm.record_types.users.fields.extension_abc_Group).toBeUndefined();
  });

  it('falls back to static metadata when discovery fails', async () => {
    mockListApplicationsForExtensionDiscovery.mockRejectedValue(httpError(403));
    const { adapter, push } = makeAdapter();
    expect(await metadataHandlers.task({ adapter })).toEqual({ status: 'success' });
    expect(push).toHaveBeenCalledTimes(1);
  });

  it('returns a delay when extension discovery is throttled', async () => {
    mockListApplicationsForExtensionDiscovery.mockResolvedValue([{ id: 'a1' }]);
    mockListExtensionProperties.mockRejectedValue(httpError(429));
    const { adapter, push } = makeAdapter();
    expect(await metadataHandlers.task({ adapter })).toEqual({ status: 'delay', delaySeconds: 9 });
    expect(push).not.toHaveBeenCalled();
  });

  it('returns progress without publishing when it times out mid-discovery', async () => {
    mockListApplicationsForExtensionDiscovery.mockResolvedValue([{ id: 'a1' }]);
    const { adapter, push } = makeAdapter({ isTimeout: true });
    expect(await metadataHandlers.task({ adapter })).toEqual({ status: 'progress' });
    expect(push).not.toHaveBeenCalled();
  });

  it('returns error for invalid connection data', async () => {
    const { adapter } = makeAdapter({
      event: { payload: { connection_data: { org_id: '', key: '' } } },
    });
    expect((await metadataHandlers.task({ adapter })).status).toBe('error');
  });
});

describe('attachments-extraction', () => {
  function attachmentsAdapter(state: State): Record<string, unknown> {
    return {
      event: {
        context: { secrets: { service_account_token: 'tok' } },
        payload: { event_context: { mode: 'INCREMENTAL' } },
      },
      state,
      isTimeout: false,
    };
  }

  it('returns success when telemetry is unavailable', async () => {
    const result = await attachmentsHandlers.task({ adapter: attachmentsAdapter(getInitialState()) });
    expect(result).toEqual({ status: 'success' });
  });

  it('skips telemetry when no entity completed', async () => {
    mockFromServiceToken.mockReturnValue({ trackUsageEvent: mockTrackUsageEvent });
    const result = await attachmentsHandlers.task({ adapter: attachmentsAdapter(getInitialState()) });
    expect(result).toEqual({ status: 'success' });
    expect(mockTrackUsageEvent).not.toHaveBeenCalled();
  });

  it('reports counts and skipped entities', async () => {
    mockFromServiceToken.mockReturnValue({ trackUsageEvent: mockTrackUsageEvent });
    const state = getInitialState();
    state.users = { ...state.users, completed: true, extractedCount: 3 };
    state.devices = { ...state.devices, completed: true, extractedCount: 0 };
    state.pimEligibleRoles = { ...state.pimEligibleRoles, completed: true, skipped: true };
    const result = await attachmentsHandlers.task({ adapter: attachmentsAdapter(state) });
    expect(result).toEqual({ status: 'success' });
    const payload = mockTrackUsageEvent.mock.calls[0][1].payload;
    expect(payload.mode).toBe('INCREMENTAL');
    expect(payload.usersCount).toBe(3);
    expect(payload.skippedEntities).toEqual(expect.arrayContaining(['devices', 'pimEligibleRoles']));
  });

  it('never fails the phase when telemetry throws', async () => {
    mockTrackUsageEvent.mockRejectedValue(new Error('telemetry down'));
    mockFromServiceToken.mockReturnValue({ trackUsageEvent: mockTrackUsageEvent });
    const state = getInitialState();
    state.users = { ...state.users, completed: true, extractedCount: 1 };
    const result = await attachmentsHandlers.task({ adapter: attachmentsAdapter(state) });
    expect(result).toEqual({ status: 'success' });
  });
});
