# v2 Migration Review

Migrated `@devrev/ts-adaas` 1.20.3 → `@devrev/airsync-sdk` 2.0.0.

- §1 package/imports — high confidence
- §2 AirSyncEvent rename — high confidence
- §3 spawn (`baseWorkerPath` already present; dropped empty options) — high confidence
- §4 emit→TaskResult / processExtractionTask — high confidence; deleted no-op onTimeout handlers (SDK defaults to Progress for metadata/data/attachments; ESU defaults to timeout error)
- §5 ExtractionAdapter typing — high confidence
- §7 ESU repo (`overriddenOptions`, removed `skipConfirmation`) — high confidence
- §8 `lastSuccessfulSyncStarted` → `event_context.extract_from` for audit watermark — medium confidence: confirm incremental audit lookback still aligns with platform extract_from
- §9 axios already a direct dependency — high confidence (no-op)
- §10 mappers — no-op (connector does not call mappers)
- §14 renamed options — high confidence

## Verification

tsc ✓ · lint ✓ · build ✓ · test ✓ (347 passed)

Coverage after worker smoke tests: ~60.3% statements / ~60.4% branches (statements clear the 60% bar; branches still under 80% — data-extraction error/skip paths remain lightly exercised).

## Unresolved

- External sync units still have no Progress event (rubric C3); non-resumable phase correctly maps timeout to error per SDK.
- Branch coverage on data-extraction still below the 80% threshold; needs more entity error-path tests.
