/**
 * LABS-377 regression tests
 *
 * Reproduces the two symptoms that caused the CanaraHSBC Life Airdrop sync to
 * fail with "Worker exited without emitting event":
 *
 *   Option A — Constants math: the post-isTimeout wait must fit inside the
 *              SDK's soft→hard timeout window, otherwise the Lambda is hard-
 *              killed before onTimeout gets to emit DataExtractionProgress.
 *
 *   Option B — Behavioural: simulate SDK isTimeout + Lambda hard-kill and
 *              observe that a large wait produces zero emits, while the
 *              current (fixed) wait produces exactly one.
 *
 * Both tests are pure — no network, no fixtures — so they can gate future
 * regressions in CI cheaply.
 */

import { ExtractorEventType } from '@devrev/ts-adaas';

import { ADAPTER_TIMEOUT_DELAY_MS } from '../../../common/constants';

// SDK constants copied here (see @devrev/ts-adaas/dist/common/constants.js).
// If the SDK values change, this file needs to be revisited — that's the
// point: this test is the tripwire.
const SDK_SOFT_TIMEOUT_MS = 10 * 60 * 1000;     // DEFAULT_LAMBDA_TIMEOUT
const SDK_HARD_TIMEOUT_MULTIPLIER = 1.3;         // HARD_TIMEOUT_MULTIPLIER
const SDK_HARD_TIMEOUT_MS = SDK_SOFT_TIMEOUT_MS * SDK_HARD_TIMEOUT_MULTIPLIER;
const SOFT_TO_HARD_WINDOW_MS = SDK_HARD_TIMEOUT_MS - SDK_SOFT_TIMEOUT_MS;

describe('LABS-377 — Option A: ADAPTER_TIMEOUT_DELAY_MS budget math', () => {
  it('must be strictly less than the SDK soft→hard timeout window', () => {
    // If ADAPTER_TIMEOUT_DELAY_MS >= (hard - soft), then any `await
    // wait(ADAPTER_TIMEOUT_DELAY_MS)` after isTimeout fires will run past
    // the hard timeout and the worker will be force-killed before it can
    // emit DataExtractionProgress from onTimeout.
    expect(ADAPTER_TIMEOUT_DELAY_MS).toBeLessThan(SOFT_TO_HARD_WINDOW_MS);
  });

  it('should be small (sub-second class) — it is a yield, not a retry delay', () => {
    // Sanity guard: 5 s is already generous. onTimeout only needs enough
    // wall-clock to emit one event; anything larger is a code smell.
    expect(ADAPTER_TIMEOUT_DELAY_MS).toBeLessThanOrEqual(5_000);
  });
});

describe('LABS-377 — Option B: behavioural repro of hard-kill before emit', () => {
  // Scaled-down soft/hard boundary so the test runs in milliseconds.
  const FAKE_SOFT_TIMEOUT_MS = 100;
  const FAKE_HARD_TIMEOUT_MS = 130;   // 1.3× soft, matching the SDK ratio
  const FAKE_KILL_WINDOW_MS = FAKE_HARD_TIMEOUT_MS - FAKE_SOFT_TIMEOUT_MS; // 30 ms

  interface FakeAdapter {
    isTimeout: boolean;
    hasWorkerEmitted: boolean;
    emit: (t: ExtractorEventType) => Promise<void>;
  }

  // Minimum adapter surface: just enough to drive the isTimeout guard.
  function makeAdapter(): { adapter: FakeAdapter; emits: string[] } {
    const emits: string[] = [];
    const adapter: FakeAdapter = {
      isTimeout: false,
      hasWorkerEmitted: false,
      emit: async (t: ExtractorEventType): Promise<void> => {
        emits.push(t);
        adapter.hasWorkerEmitted = true;
      },
    };
    return { adapter, emits };
  }

  // Simulate the SDK: after FAKE_SOFT_TIMEOUT_MS flip isTimeout, after
  // FAKE_HARD_TIMEOUT_MS reject with a "hard kill". Whichever the worker
  // hits first is the outcome.
  async function runWithSimulatedTimeout(
    worker: (adapter: { isTimeout: boolean; emit: (t: ExtractorEventType) => Promise<void> }) => Promise<void>,
    adapter: { isTimeout: boolean; emit: (t: ExtractorEventType) => Promise<void> }
  ): Promise<'completed' | 'hard-killed'> {
    const softTimer = setTimeout(() => { adapter.isTimeout = true; }, FAKE_SOFT_TIMEOUT_MS);
    const hardKill = new Promise<'hard-killed'>((resolve) =>
      setTimeout(() => resolve('hard-killed'), FAKE_HARD_TIMEOUT_MS)
    );
    const finished = worker(adapter).then(() => 'completed' as const);
    try {
      return await Promise.race([finished, hardKill]);
    } finally {
      clearTimeout(softTimer);
    }
  }

  it('BUGGY behaviour: 180s-class wait → hard-killed with 0 emits', async () => {
    const { adapter, emits } = makeAdapter();

    // Scaled analogue of the pre-fix value: wait longer than the kill window.
    const BUGGY_WAIT_MS = FAKE_KILL_WINDOW_MS * 6;

    const outcome = await runWithSimulatedTimeout(async (adp) => {
      // A long-running extraction loop that eventually notices isTimeout.
      while (!adp.isTimeout) {
        await new Promise((r) => setTimeout(r, 5));
      }
      // Post-isTimeout: sleep too long, then try to emit.
      await new Promise((r) => setTimeout(r, BUGGY_WAIT_MS));
      await adp.emit(ExtractorEventType.DataExtractionProgress);
    }, adapter);

    expect(outcome).toBe('hard-killed');
    expect(emits).toHaveLength(0); // reproduces "worker exited without emitting event"
  });

  it('FIXED behaviour: small wait → emit fires before hard-kill', async () => {
    const { adapter, emits } = makeAdapter();

    // Scaled analogue of the fixed value (1 s in prod → well below the
    // 180 s soft→hard window).
    const FIXED_WAIT_MS = 2;

    const outcome = await runWithSimulatedTimeout(async (adp) => {
      while (!adp.isTimeout) {
        await new Promise((r) => setTimeout(r, 5));
      }
      await new Promise((r) => setTimeout(r, FIXED_WAIT_MS));
      await adp.emit(ExtractorEventType.DataExtractionProgress);
    }, adapter);

    expect(outcome).toBe('completed');
    expect(emits).toEqual([ExtractorEventType.DataExtractionProgress]);
  });
});
