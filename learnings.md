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
