/**
 * Worker registration + happy-path TaskResult coverage for extraction phases.
 * processExtractionTask is captured so we can invoke task handlers with mocks.
 */

type TaskHandlers = {
  task: (args: { adapter: unknown }) => Promise<{ status: string; delaySeconds?: number; error?: { message: string } }>;
  onTimeout?: (args: { adapter: unknown }) => Promise<{ status: string }>;
};

let esuHandlers: TaskHandlers;
let metadataHandlers: TaskHandlers;
let attachmentsHandlers: TaskHandlers;

jest.mock('@devrev/airsync-sdk', () => {
  const actual = jest.requireActual('@devrev/airsync-sdk');
  return {
    ...actual,
    processExtractionTask: (handlers: TaskHandlers) => {
      // Module load order: external-sync-units, then metadata/attachments imported below.
      if (!esuHandlers) {
        esuHandlers = handlers;
      } else if (!metadataHandlers) {
        metadataHandlers = handlers;
      } else {
        attachmentsHandlers = handlers;
      }
    },
  };
});

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

jest.mock('../../../common/labs-usage', () => ({
  LabsUsageTracker: {
    fromServiceToken: () => null,
  },
}));

import '../external-sync-units-extraction';
import '../metadata-extraction';
import '../attachments-extraction';

function makePushRepo(): { push: jest.Mock } {
  return { push: jest.fn().mockResolvedValue(undefined) };
}

describe('external-sync-units-extraction', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAcquireAccessToken.mockResolvedValue('token');
    mockGetOrganization.mockResolvedValue({ id: 'tenant-1', displayName: 'Contoso' });
  });

  it('pushes the tenant sync unit and returns success', async () => {
    const repo = makePushRepo();
    const adapter = {
      event: {
        payload: {
          connection_data: { org_id: 'tenant.onmicrosoft.com', key: '11111111-1111-1111-1111-111111111111|secret' },
        },
      },
      initializeRepos: jest.fn(),
      getRepo: jest.fn().mockReturnValue(repo),
      isTimeout: false,
      state: {},
    };

    const result = await esuHandlers.task({ adapter });
    expect(result).toEqual({ status: 'success' });
    expect(repo.push).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'tenant-1', name: 'Contoso' }),
    ]);
  });

  it('returns error when organization fetch fails', async () => {
    mockGetOrganization.mockRejectedValue(new Error('org failed'));
    const adapter = {
      event: {
        payload: {
          connection_data: { org_id: 'tenant.onmicrosoft.com', key: '11111111-1111-1111-1111-111111111111|secret' },
        },
      },
      initializeRepos: jest.fn(),
      getRepo: jest.fn(),
      isTimeout: false,
      state: {},
    };

    const result = await esuHandlers.task({ adapter });
    expect(result.status).toBe('error');
    expect(result.error?.message).toContain('org failed');
  });
});

describe('metadata-extraction', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAcquireAccessToken.mockResolvedValue('token');
    mockListApplicationsForExtensionDiscovery.mockResolvedValue([]);
  });

  it('publishes EDM and returns success', async () => {
    const repo = makePushRepo();
    const result = await metadataHandlers.task({
      adapter: {
        event: {
          payload: {
            connection_data: {
              org_id: 'contoso.onmicrosoft.com',
              key: '12345678-1234-1234-1234-123456789012|client-secret-value',
            },
          },
        },
        initializeRepos: jest.fn(),
        getRepo: jest.fn().mockReturnValue(repo),
        isTimeout: false,
        state: {},
      },
    });

    expect(result.status).toBe('success');
    expect(repo.push).toHaveBeenCalled();
  });
});

describe('attachments-extraction', () => {
  it('returns success without attachments', async () => {
    const adapter = {
      event: {
        context: { secrets: {} },
        payload: { event_context: { mode: 'INITIAL' } },
      },
      state: {
        users: { completed: true, extractedCount: 1 },
      },
      isTimeout: false,
    };

    const result = await attachmentsHandlers.task({ adapter });
    expect(result).toEqual({ status: 'success' });
  });
});
