import axios from 'axios';

import { LabsUsageTracker } from '../labs-usage';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('LabsUsageTracker', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('fromServiceToken returns null without a token', () => {
    expect(LabsUsageTracker.fromServiceToken(undefined, 'sol', '1.0')).toBeNull();
    expect(LabsUsageTracker.fromServiceToken('', 'sol', '1.0')).toBeNull();
  });

  it('fromServiceToken builds a tracker when token is present', () => {
    const tracker = LabsUsageTracker.fromServiceToken('tok', 'sol', '1.0');
    expect(tracker).toBeInstanceOf(LabsUsageTracker);
  });

  it('trackUsageEvent posts after a successful health check', async () => {
    mockedAxios.get.mockResolvedValueOnce({ status: 200, data: { ok: true } });
    mockedAxios.post.mockResolvedValueOnce({ status: 200, data: {} });

    const tracker = new LabsUsageTracker({
      serviceToken: 'tok',
      solutionName: 'sol',
      version: '1.0',
    });
    await tracker.trackUsageEvent('airsync_operation_completed', { payload: { mode: 'INITIAL' } });

    expect(mockedAxios.get).toHaveBeenCalled();
    expect(mockedAxios.post).toHaveBeenCalledWith(
      expect.stringContaining('usage_event'),
      expect.objectContaining({
        solution_name: 'sol',
        event_type: 'airsync_operation_completed',
      }),
      expect.any(Object)
    );
  });

  it('trackUsageEvent swallows HTTP failures', async () => {
    mockedAxios.get.mockRejectedValueOnce(new Error('down'));
    const tracker = new LabsUsageTracker({
      serviceToken: 'tok',
      solutionName: 'sol',
      version: '1.0',
    });
    await expect(tracker.trackUsageEvent('airsync_operation_completed')).resolves.toBeUndefined();
  });
});
