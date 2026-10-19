# v2 Migration Review

Migrated `@devrev/ts-adaas` 1.20.3 → `@devrev/airsync-sdk` 2.0.0.

- §1 package/imports — high confidence. Follow-up: `@devrev/typescript-sdk@1.1.78` added to devDependencies; `code/test/runner.ts` imports `@devrev/typescript-sdk/dist/snap-ins`, which v1 provided transitively and v2 does not.
- §2 AirSyncEvent rename + fixture `event_context` aliases (`dev_user_id` → `dev_uid`, `external_system` → `external_system_id`) — high confidence
- §3 spawn (`baseWorkerPath` already present; dropped empty options) + fixture event types renamed to modern strings (`START_EXTRACTING_*`, `CONTINUE_EXTRACTING_DATA`) — high confidence
- §4 emit→TaskResult / processExtractionTask — high confidence; deleted no-op onTimeout handlers (SDK defaults to Progress for metadata/data/attachments; ESU defaults to timeout error)
- §4 delay in external sync units (non-resumable; SDK sends it as an error) — medium confidence: kept so the Retry-After value is preserved
- §5 ExtractionAdapter typing — high confidence
- §7 ESU repo (`overriddenOptions`, removed `skipConfirmation`) — high confidence
- §8 `lastSuccessfulSyncStarted` → `event_context.extract_from` for audit watermark — medium confidence: confirm incremental audit lookback still aligns with platform extract_from
- §9 axios already a direct dependency — high confidence (no-op)
- §10 mappers — no-op (connector does not call mappers)
- §14 renamed options — high confidence
- Docs (`README.md`, `TECHNICAL_DESIGN_DOC.md`) rewritten from v1 emit/processTask wording

## Verification

tsc (src + test) ✓ · lint ✓ · build ✓ · test ✓ (795 passed) · coverage 96.15% statements / 92.26% branches

## Unresolved

- External sync units have no Progress event in the SDK; a timeout in that phase is reported as an error by design.
