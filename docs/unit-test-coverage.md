# Azure Entra ID unit-test audit

**DevRev:** [FORGE-732 / ISS-387280](https://app.devrev.ai/devrev/works/ISS-387280)

Audited using connector-generation build `20261021131443`. No connector implementation, manifest, EDM, IDM, or dependency changes. The checkout has no standalone Spec or plan; `TECHNICAL_DESIGN_DOC.md`, `README.md`, `learnings.md`, manifest, EDM/IDM, all implementation modules, and existing assertions were inspected. Design prose predates several implementation changes; it is not execution evidence.

Run from `code`: `npm run test:unit:coverage -- --runInBand`.

Baseline: **258 passed, 0 failed**, four suites. Final: **277 passed, 4 failed**, eight suites (six passed, two failed); **23 tests added**. Four existing non-unit/timing assertions remain unselected as described below. All-source coverage: **25.44% statements, 42.01% branches, 41.17% functions, 26.45% lines**. TypeScript compilation, lint on new tests, and `git diff --check` pass.

The dedicated configuration selects direct normalization, audit-overlay, utility, security, and state tests. It excludes all mocked API, telemetry, and worker suites. Four existing tests are deliberately unselected: three wall-clock `wait` tests and one static EDM/IDM assertion. No failing assertion is filtered. Static, component, and live tests were not run. Coverage includes unexecuted worker/API source in its denominator; percentages do not measure scenario completeness.

Added test files: `normalization-unit.test.ts` exercises source IDs, reordered membership IDs, user-scoped licenses, offset/precision preservation, extension null/empty/false/zero values, application URI serialization, nested audit JSON, and sign-in flags. `audit-overlay-unit.test.ts` asserts array decoding, in-place accumulation, and preservation of fresher values; `state-unit.test.ts` asserts fresh state and independence; `utils-unit.test.ts` asserts Retry-After variants. Expectation sources are identified in the tests; no mocks, spies, fake clocks, worker execution, or external requests are used.

## Failure notices

- Newly added `common/__tests__/utils-unit.test.ts`, malformed delay-seconds cases: RFC 9110 §10.2.3 permits `1*DIGIT`; the helper documents caller-default fallback for invalid headers. Expected fallback `64`; actual values are `10` for `10seconds`, `1` for `1.5`, and `10` for `+10` because `parseInt` accepts numeric prefixes, decimals, and positive signs. Tests remain enabled. The helper is used by metadata, data, and external sync unit workers; malformed provider headers could produce shorter waits and additional throttling on existing syncs. These are supplied protocol inputs, not evidence that Graph emits them. No change to existing imported items or persisted state is made by this PR.

- Newly added `external-system/__tests__/normalization-unit.test.ts`, false sign-in device flags: Graph `deviceDetail.isCompliant/isManaged` and EDM define booleans. Expected `false`; both normalize to `null` through `|| null`. This loses known-negative source values in normalized items. The checked-in IDM does not map either field, so a destination effect requires a Recipe blueprint consuming them; no tenant blueprint was inspected. Existing imported records are not changed by adding this test, and correcting production behavior/backfilling old sign-ins would be separate work.

An initial new audit-overlay assertion required the same object reference for a nonempty stale-mismatch overlay. That was an incorrect test: the documented shallow-copy contract and caller only require preserved values; reference identity has no downstream consumer. It was corrected to assert exact unchanged fields and nonmutation, preserving the oldValue guard requirement.

## Scenario inventory

Numbers follow the 95 Unit bullets in the skill's `references/unit-test-scenarios.md`, in order. Grouped rows explicitly identify every included variant. **Partial** means some assertions exist but named variants remain untested. **Missing** includes behavior inaccessible without worker execution; the next approach is stated. **Defensive-only** inputs are outside the declared source schema. A failing assertion is a demonstrated gap, not covered behavior.

Scope: forward sync of all 19 EDM record types (including group/role membership), one tenant per connection; optional/licensed entities are skipped by worker error handling. There is no loading package or reverse sync. Directory roles, MFA policies, Conditional Access policies, and membership records are imported data, not DR authorization policies or shared-with permission grants.

| Scenarios | Status | Connector function, assertion evidence, or next approach |
| --- | --- | --- |
| 1 IDM installation identifiers | Inapplicable | No connector selector/builder; extraction entry passes static IDM to SDK. Identifier consistency belongs to static validation. |
| 2 EDM field types, collections, enums, refs and attributes | Missing | Dynamic extension enrichment and private `mapExtensionDataType` are inside metadata worker. Static schema consistency and component discovery needed. |
| 3 Rename field/enum label, retain source key and IDM refs | Missing | Same metadata worker; test supplied Graph extensions in component coverage. |
| 4 Colliding normalized/truncated field names | Inapplicable | Discovery uses full Graph extension name verbatim; no key normalization/truncation. Duplicate-definition conflict policy is unspecified. |
| 5 Dynamic IDM defaults | Inapplicable | No dynamic IDM builder; only EDM fields are discovered. Runtime Recipe blueprint mapping is platform-owned. |
| 6 Stable IDs after rename/nonidentity changes/reordering | Partial | Existing direct normalizers and new identity tests; record types without sequence assertions remain a gap. |
| 7 Same IDs across record types/accounts/scopes | Partial | Composite child IDs include parent scope; SDK repositories separate record types. No cross-tenant import/destination identity test. |
| 8 Missing stable key | Defensive-only | Graph directory objects require `id`; no declared connector rejection policy or positional fallback. |
| 9 Timestamp offsets and precision | Partial | Normalizers preserve supplied timestamps; equivalent-offset/precision assertions do not establish provider emission or destination parsing. |
| 10 Missing/invalid timestamps | Partial | Existing null/missing fallback tests use fixed sentinel; invalid Graph DateTimeOffset policy unspecified (defensive input). |
| 11 Synthetic modified timestamps | Partial | Explicit supplied sync timestamps asserted; worker clock selection and saved-version ordering need component tests. |
| 12 Absent/null/empty string/empty collection | Partial | Existing null/empty cases plus new normalization variants; not every field has every variant asserted. |
| 13 Valid false and zero | Partial | Zero and several false inputs survive; the new sign-in device-flag regression fails because false becomes null. |
| 14 Scalar/collection/structured representation | Partial | All normalizers have direct examples; extension metadata type agreement remains deferred to metadata discovery. |
| 15 Duplicates and order in collections | Partial | New collection serialization examples; no universal set/order policy inferred for Graph collections. |
| 16 Unicode/multiline/escaping | Covered | Direct normalized text and serialized structured content assertions. |
| 17 Invalid/oversized values | Defensive-only | No connector truncation/rejection policy; Graph field limits apply upstream. Destination limits require component validation. |
| 18 Parent/author/assignee refs | Partial | Exact membership/assignment reference IDs asserted. EDM declares target record types; non-user directory members need downstream Recipe/loader checks. |
| 19 Rich content formatting/links/fallback | Partial | Structured policy/log JSON is stored in EDM text fields. Description conversion and authentication-policy custom rich-text mappings belong to Recipe; formatting/link/fallback behavior was not executed. |
| 20 Mentions, known/unresolved | Inapplicable | No mention parser or supported mention representation. |
| 21 Inline attachments/attachment-only comments | Inapplicable | No attachment or comment extraction. |
| 22–27 Object/field/conditional grants, single/multiple/user-reference/unexpressible conditions | Inapplicable | No DR permission-grant normalizer; Conditional Access is imported policy data. |
| 28–33 Shared-with roles, principal types/ID collision, guests, public/workspace grants, grant combination | Inapplicable | No shared-with mapping or supported source audience-to-DR role mapping. Directory membership does not establish these privileges. |
| 34–39 Grant removal/reduction, unresolved principal, inheritance/restriction, empty/unavailable permissions | Inapplicable | No grant normalization feature; destination enforcement remains outside this audit. Membership removal has its own direct normalization assertions. |
| 40–41 Attachment identity/metadata and unsupported download URL | Inapplicable | Attachment phase is a completion/telemetry stub. Graph URL validation tests cover API URLs, not attachment downloads. |
| 42–57 Reverse create/update required/writable/read-only/operation/connection restrictions, omitted/null/empty/all-rejected/mixed collections, false/zero, rich text/mentions/attachments | Inapplicable | Forward-only manifest and design; no loading worker or external write request builder. |
| 58 Selected/unselected/omitted record types | Missing | Design calls entities user-selected, but worker registers/extracts all entities and has no selection function. Resolve product scope; component-check platform object mapping and missing permissions separately. |
| 59 Item filters, include/exclude precedence | Inapplicable | No declared item filter option/function. |
| 60 Attachment option enabled/disabled/omitted | Inapplicable | No supported attachment import. |
| 61 Visibility options/default | Inapplicable | No connector visibility selector. |
| 62 Near-timeout pending items/cursor/completion | Missing | Checks and hydration flushes embedded in data worker. Existing mocked timeout assertions inspected, not run; component checkpoint/callback verification needed. |
| 63 Initial/incremental/continuation bounds and reset precedence | Missing | Worker uses extract_from for user audit lookback and connector cursors for logs; no callable resolver. SDK resolves event TimeValues. Component tests needed. |
| 64 Query bound precision/inclusivity/overlap | Missing | API methods build lower-bound queries using worker dates. No independent request builder; component assertions needed. |
| 65 Before/at/after boundaries, ties/offsets/DST | Missing | No local interval filter; manifest advertises TIME_SCOPED_SYNCS but extract_to is unused. Required upper-bound behavior is unimplemented; validate historical scope at component/platform level. |
| 66 Invalid/reversed ranges | Inapplicable | Connector has no validator. SDK `dist/state/extraction-state.js` resolves and caches bounds, rejects extract_from >= extract_to; format validation belongs to its TimeValue resolver. SDK source inspected, not executed. |
| 67–70 Nonterminal/terminal, absent/empty cursor with/without terminal signal, short/empty nonterminal page | Missing | Worker/API loops require I/O or worker execution; use Graph paging/delta component scenarios with nextLink/deltaLink precedence. |
| 71–73 Repeated cursors with new IDs, stalled pages, overlapping IDs | Missing | No declared lack-of-progress/duplicate policy. Resolve policy before exact expectations; component sequences needed. |
| 74 Invalid/rejected cursor | Partial | `isDeltaExpiredError` directly classifies 410 and syncStateNotFound. Cursor reset/progress persistence is worker-owned and untested here. Opaque Graph state tokens must remain opaque. |
| 75 Out-of-order field collection by item ID | Missing | Device-owner/details and user hydration join inside worker; component reordered/missing responses needed. |
| 76 New-run reset/preserve fields | Partial | `getInitialState` exact fresh state and independence tested; incremental reset, legacy baseline rebuild, SDK fields not tested by factory calls. |
| 77 Continuation retains pending items/cursors/flags/bounds | Missing | Worker registration and SDK state persistence; component restart test needed. |
| 78 Scoped progress update preserves unrelated state | Missing | State mutations embedded in worker; fresh-state independence does not prove progress updates. |
| 79 External sync unit rename preserves ID | Missing | `/organization` conversion is inside worker callback; component test needed, including absent displayName fallback. |
| 80 Transient network error | Partial | Existing `isRetryableError` classification asserted; private API GET does not call this helper. Actual retry scheduling/recovery deferred. |
| 81 Retryable server/rate-limit response | Partial | Direct classification covers 500/503/429, but not real API retry execution/limit. |
| 82 Authentication/access denied | Partial | Direct 401/403 classification asserted; worker delay vs skip decisions and credential recovery require component tests. |
| 83 Permanent validation error | Partial | Direct 400 classification asserted; unchanged-request suppression not exercised. |
| 84 Retry-After integer including zero | Partial | Positive seconds covered; zero returns fallback. No explicit zero scheduling policy; conservative delay is not a demonstrated early-retry defect. |
| 85–86 Future/equal/past HTTP-date | Missing | Parser does not parse HTTP-date or accept a clock. RFC allows dates; future date beyond fallback could retry too early, but no deterministic date regression under existing interface. Define rounding/past-date policy and add clock-input unit seam in separate implementation work. |
| 87 Missing Retry-After | Covered | Direct helper uses caller-supplied fallback. |
| 88 Empty/malformed-date/nonnumeric header | Partial | Fallback variants tested; malformed numeric prefixes demonstrate a failing gap. Empty value list is defensive-only under the Axios header abstraction. |
| 89 Negative/signed delay-seconds | Partial | Negative fallback covered; positive signed string is a retained failing regression. |
| 90 Delay beyond execution budget | Missing | Helper returns seconds without budget; worker/SDK TaskResult scheduling requires component coverage. |
| 91 Retry attempt/elapsed-time limit | Missing | Private API retry loops and worker invocation budget; component tests needed. |
| 92–94 Bulk CSV/JSON quoting/Unicode, absent/null/empty, malformed/truncated export | Inapplicable | No external-system bulk export parser. Paged Graph JSON decoding belongs to Axios. |
| 95 Aggregate created/updated/skipped/deleted/failed counts | Missing | Worker increments extraction counts and builds telemetry; destination outcomes belong to AirSync. Component report aggregation needed. |

## Deferred contracts

SDK 2.0.0 owns TaskResult dispatch (`dist/multithreading/process-task.js`), persistence/envelopes (`dist/state/base-state.js`), and event time-bound resolution/continuation cache (`dist/state/extraction-state.js`, migration guide §8). Its `delay` result carries seconds and external sync unit discovery is non-resumable. Installed SDK contract/source was inspected; SDK tests and platform behavior were not executed. Existing mocked suites cover several corresponding worker paths, but are not evidence for this direct-only audit.

Permissions require a separately agreed source-to-DR privilege mapping before any permission fidelity claim. Directory group/role membership and `remove_member_ids` values alone do not establish destination access or revoked access. Existing Recipe blueprints can differ from IDM defaults; neither customized mappings nor tenant freshness was verified.
