# Connector Learnings

Recorded issues and fixes discovered during connector code generation or modification.

---

## L001 — Stale GET /users/{id} silently discards profile edits during incremental sync

**Date:** 2026-09-30
**Source:** Analysis of LABS-579 branch; confirmed on the target Entra tenant (audit log showed DisplayName and Surname changed, directory read still returned old values within the 60-second consistency window).
**Problem:** The incremental user sync hydrates each delta user with `GET /users/{id}` before calling `normalizeUser`, stamping it with the current `syncTimestamp`. When the read replica is still behind the audit, the stale profile is written with a new `modified_date`. Both the delta cursor and the audit window then advance past the event, so the edit is silently skipped for all future runs. The `modifiedProperties` array on the `targetResources` entry in the directory audit already contains the correct new value, but the connector ignored it.
**Fix:** Collect `modifiedProperties` during the audit preflight loop into a per-user `auditOverlayMap` (keyed by user ID), preserving the newest value because Graph returns audits in descending timestamp order. After hydrating each user in both the delta loop and the audit fallback loop, call `overlayAuditedUserFields` to patch any field whose hydrated value still differs from the audited `newValue`. Strip one surrounding double-quote layer from Graph's `newValue` strings using `stripGraphQuote`; the helpers live in `external-system/audit-overlay.ts` and have focused unit coverage.

---

## L002 — Graph audit `newValue` is a stringified JSON array, not a quote-wrapped string

**Date:** 2026-10-01
**Source:** Live probe of the target Entra tenant while reproducing incremental user update failures; `Update user` audits for DisplayName/Surname returned `newValue` like `'["Dana chen IT"]'`.
**Problem:** `stripGraphQuote` only removed a surrounding `"…"` layer. For the real Graph encoding it returned the literal brackets (e.g. `["Dana chen IT"]`), so the audit overlay either wrote a corrupted display name or never matched a caught-up `GET /users/{id}` value and left stale incremental updates broken.
**Fix:** Teach `stripGraphQuote` to unwrap stringified and parsed single-element JSON arrays before quote stripping, and cover the live encoding in `audit-overlay` unit tests so overlay + `normalizeUser` produce clean `display_name` / `full_name` values.

---

## L003 — Audit watermark with no lookback skips Update-user on the next incremental

**Date:** 2026-10-01
**Source:** Local snap-in testing logs for runs `9e62e3f5` / `98e9faa0`; Graph showed `Update user` at 05:00:12 but connector `audit_preflight` reported `audited: 0`, then the following true-delta run extracted 0 users.
**Problem:** `lastSuccessfulSyncStarted` advances at the end of each run while Graph audit ingestion lags. An Update-user whose `activityDateTime` falls just before that watermark (or whose audit row appears late) is invisible to the next incremental, and users/delta can also return empty — so the profile edit is never re-emitted.
**Fix:** Query directory audits from `lastSuccessfulSyncStarted - 15m` (`USER_AUDIT_LOOKBACK_MS`), and log `audit_watermark` / `audit_start` / `raw_audits` / `overlay_users` in `entra_user_audit_preflight` so lag and empty windows are diagnosable.

---

## L004 — Incremental user extracts can be marked `duplicate` by AirSync load (no Devu update)

**Date:** 2026-10-01
**Source:** Local testing sync-unit report for `34ea68bf…`; extractor queued updated users (`Users extracted: 1`, overlay applied) but destination outcomes were `users.duplicate: 1` / `updated: 0`, and DEVU-75 `modified_date` stayed at the initial sync timestamp.
**Problem:** After a successful extract+push, AirSync's loader may classify stock `devu` records as `duplicate` instead of `updated`, so profile field changes never land in DevRev even though connector logs look healthy.
**Fix:** Diagnose with `airsync sync-unit report` destination outcomes (not only extractor logs). Keep extraction/overlay correct; if outcomes stay `duplicate` with newer `modified_date`, escalate as an AirSync load/mapping behavior for stock DevUsers (try `full_sync` / verify recipe), not as a missing Graph delta.

---

## L005 — Expired delta handlers must emit an SDK outcome

**Date:** 2026-10-15
**Source:** Marketplace review of directory-role / application / service-principal / device / contact extraction
**Problem:** Those handlers cleared an expired delta link and returned without emitting progress or error. The SDK only runs `onTimeout` on timeout, so an ordinary 410 exit produced "Worker exited without emitting event" and the reset was not reliably persisted.
**Fix:** After clearing the delta link and resetting the entity cursor, emit `DataExtractionProgress` (same pattern as users/groups) so the platform persists state and resumes a full delta round.

---

## L006 — Audit preflight and user hydration must checkpoint mid-work

**Date:** 2026-10-15
**Source:** Marketplace review of incremental user sync at tenant scale
**Problem:** Audit preflight kept `auditNextLink` / overlays only in memory with no `isTimeout` checks, and user hydration only checked timeout around the delta page fetch. Long scans burned the whole budget or hard-killed mid-hydration, then restarted from page one / the same page without progress.
**Fix:** Persist `userAuditPreflight` in adapter state with timeout checks between audit pages; add `users.currentUserIndex`, check `isTimeout` inside hydration and audit-fallback loops, and flush/push before a timeout return.

---

## L007 — Child collections need durable parent IDs; mappings and modified_date must match extract

**Date:** 2026-10-15
**Source:** Marketplace review of incremental child extract + CA/device mapping
**Problem:** Incremental Start wiped user/SP IDs so empty parent deltas skipped app roles, auth methods, and licenses. CA IDM mapped nested `conditions`/`grant_controls`/`session_controls` while the normalizer emitted flattened fields; device EDM/IDM used `AzureAD` vs Graph `AzureAd`. App roles, auth policy, methods, licenses, and PIM used sentinel/create-only `modified_date`.
**Fix:** Preserve known user/SP IDs across incremental reset (prune on `@removed`); align IDM/EDM with flattened CA fields and Graph `AzureAd`/`ServerAd`; stamp incremental `syncTimestamp` into those normalizers' `modified_date`.

---

## L008 — Parent-ID preserve needs prune persist, SP expiry reset, fallback resume, and upgrade rebuild

**Date:** 2026-10-15
**Source:** Copilot review on PR #32 for marketplace parent-ID / timeout changes
**Problem:** Audit-fallback timeout discarded buffered users with no resume index; delete-only user deltas pruned ids only in memory before advancing the cursor; SP 410 cleared the delta link but kept stale ids (unlike users); upgrading tenants kept incomplete pre-preserve id lists forever.
**Fix:** Checkpoint audit-fallback with flush + `fallbackIndex` / `deltaPhaseCompleted`; always persist `users.ids` after prune; clear SP `ids` on expired delta; one-time `parentIdsBaselineVersion` migration forces full users+SP rebuild before preserving again.

---

## L009 — App role assignments and log cursors need the same incremental hygiene as siblings

**Date:** 2026-10-16
**Source:** Connector-review on marketplace branch (functional observations)
**Problem:** `normalizeAppRoleAssignment` still used creation-only `modified_date` (missed in L007), and audit/sign-in cursors advanced to extraction end so events arriving mid-run could be skipped on the next sync.
**Fix:** Accept optional `modifiedDate`/`syncTimestamp` on app role assignments; set `lastAuditLogSync` / `lastSignInLogSync` to the query start timestamp after a successful run.

---

## L010 — Non-blocking Labs telemetry failures stay at info

**Date:** 2026-10-16
**Source:** User correction after connector-review I3 suggested `console.warn`
**Problem:** Review guidance promoted telemetry catch-block logs to `console.warn`, but Labs usage tracking is intentionally non-blocking and must not look like connector failures in warn/error queries.
**Fix:** Keep `[LabsUsageTracker] Failed to track usage event` at `console.info` in attachments-extraction.

---

## L011 — Token 429 must surface as Delayed; metadata timeout must Progress

**Date:** 2026-10-16
**Source:** Connector-review scorecard (C3/C5/C8/C15) on marketplace branch
**Problem:** Metadata `onTimeout` emitted Done; token acquisition retried 429 with linear backoff so exhausted rate limits became DataExtractionError; audit-fallback buffered all users until end/timeout.
**Fix:** Migrate to `@devrev/airsync-sdk` 2.0 (TaskResult Progress default for metadata); throw token 429 immediately with exponential backoff for other retries and map outer catch to delay; flush audit-fallback every `AUDIT_FALLBACK_PUSH_BATCH_SIZE`.

---

## L012 — SDK v2 migration must verify test/ and fixtures, not just src/

**Date:** 2026-10-19
**Source:** Connector-review after the `@devrev/airsync-sdk` 2.0 migration
**Problem:** tsc/lint/jest only cover `src/`, so the migration missed that `code/test/runner.ts` needs `@devrev/typescript-sdk` (no longer a transitive dependency in v2) and that fixtures still used legacy `EXTRACTION_*` event types and removed `event_context` aliases — breaking the local test server and fixture runs.
**Fix:** Add `@devrev/typescript-sdk@1.1.78` to devDependencies, rename fixture event types/keys to modern strings, and type-check `src` + `test` together after any SDK upgrade.

---

## L013 — Child enrichment catches must not swallow 429/401

**Date:** 2026-10-19
**Source:** Connector-review C5 on data-extraction child loops
**Problem:** Per-parent `catch` blocks (app roles, assignments, auth methods, licenses, device owners/details) counted every error as a skip, so throttling silently dropped child records and marked the entity complete; device enrichment also lost already-enriched devices on a mid-page timeout.
**Fix:** Rethrow 429/401 from child catches so the entity catch returns a delay; flush enriched devices before any timeout/throttle exit and resume pushing from `currentDeviceIndex`.
