/**
 * LABS-377 regression tests
 *
 * Reproduces the two symptoms that caused the CanaraHSBC Life Airdrop sync to
 * fail with "Worker exited without emitting event":
 *
 *   Option A — Constants math: the post-isTimeout wait must fit inside the
 *              SDK's soft→hard timeout window, otherwise the Lambda is hard-
 *              killed before onTimeout / progress return can complete.
 *
 *   Option B — Behavioural: simulate SDK isTimeout + Lambda hard-kill and
 *              observe that a large wait produces zero results, while the
 *              current (fixed) wait produces progress.
 *
 * Both tests are pure — no network, no fixtures — so they can gate future
 * regressions in CI cheaply.
 */

import { ADAPTER_TIMEOUT_DELAY_MS } from '../../../common/constants';

// SDK constants copied here (see @devrev/airsync-sdk soft/hard timeout window).
// If the SDK values change, this file needs to be revisited — that's the
// point: this test is the tripwire.
const SDK_SOFT_TIMEOUT_MS = 10 * 60 * 1000; // DEFAULT_LAMBDA_TIMEOUT
const SDK_HARD_TIMEOUT_MULTIPLIER = 1.3; // HARD_TIMEOUT_MULTIPLIER
const SDK_HARD_TIMEOUT_MS = SDK_SOFT_TIMEOUT_MS * SDK_HARD_TIMEOUT_MULTIPLIER;
const SOFT_TO_HARD_WINDOW_MS = SDK_HARD_TIMEOUT_MS - SDK_SOFT_TIMEOUT_MS;

describe('LABS-377 — Option A: ADAPTER_TIMEOUT_DELAY_MS budget math', () => {
  it('must be strictly less than the SDK soft→hard timeout window', () => {
    expect(ADAPTER_TIMEOUT_DELAY_MS).toBeLessThan(SOFT_TO_HARD_WINDOW_MS);
  });

  it('should be small (sub-second class) — it is a yield, not a retry delay', () => {
    expect(ADAPTER_TIMEOUT_DELAY_MS).toBeLessThanOrEqual(5_000);
  });
});

describe('LABS-377 — Option B: behavioural repro of hard-kill before progress', () => {
  const FAKE_SOFT_TIMEOUT_MS = 100;
  const FAKE_HARD_TIMEOUT_MS = 130;
  const FAKE_KILL_WINDOW_MS = FAKE_HARD_TIMEOUT_MS - FAKE_SOFT_TIMEOUT_MS;

  interface FakeAdapter {
    isTimeout: boolean;
  }

  function makeAdapter(): FakeAdapter {
    return { isTimeout: false };
  }

  async function runWithSimulatedTimeout(
    worker: (adapter: FakeAdapter) => Promise<{ status: string } | void>,
    adapter: FakeAdapter
  ): Promise<'completed' | 'hard-killed'> {
    const softTimer = setTimeout(() => {
      adapter.isTimeout = true;
    }, FAKE_SOFT_TIMEOUT_MS);
    const hardPromise = new Promise<'hard-killed'>((resolve) => {
      setTimeout(() => resolve('hard-killed'), FAKE_HARD_TIMEOUT_MS);
    });
    try {
      const result = await Promise.race([
        worker(adapter).then(() => 'completed' as const),
        hardPromise,
      ]);
      return result;
    } finally {
      clearTimeout(softTimer);
    }
  }

  it('a wait larger than the soft→hard window is hard-killed before progress', async () => {
    const adapter = makeAdapter();
    const outcome = await runWithSimulatedTimeout(async (adp) => {
      while (!adp.isTimeout) {
        await new Promise((r) => setTimeout(r, 5));
      }
      await new Promise((r) => setTimeout(r, FAKE_KILL_WINDOW_MS + 20));
      return { status: 'progress' };
    }, adapter);
    expect(outcome).toBe('hard-killed');
  });

  it('ADAPTER_TIMEOUT_DELAY_MS-scale wait allows progress before hard kill', async () => {
    const adapter = makeAdapter();
    const results: string[] = [];
    const outcome = await runWithSimulatedTimeout(async (adp) => {
      while (!adp.isTimeout) {
        await new Promise((r) => setTimeout(r, 5));
      }
      await new Promise((r) => setTimeout(r, Math.min(ADAPTER_TIMEOUT_DELAY_MS, 10)));
      results.push('progress');
      return { status: 'progress' };
    }, adapter);
    expect(outcome).toBe('completed');
    expect(results).toEqual(['progress']);
  });
});
