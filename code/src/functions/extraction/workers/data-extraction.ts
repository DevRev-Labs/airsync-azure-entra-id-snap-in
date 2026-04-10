/**
 * Data Extraction Worker for Azure Entra ID Connector
 *
 * This is the main data extraction worker that orchestrates the retrieval of all
 * identity and directory data from Azure Entra ID (Microsoft Entra ID) via
 * Microsoft Graph API.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * ARCHITECTURE OVERVIEW
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * This worker is invoked by the DevRev Airdrop framework and runs as a
 * stateful, resumable task that can handle:
 * - Long-running extractions (hours for large tenants)
 * - Timeouts and resumption from last checkpoint
 * - Rate limiting and throttling
 * - Incremental syncs using Microsoft Graph delta queries
 * - Graceful error handling for missing permissions
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * EXTRACTION PROCESS
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * 1. **Authentication**
 *    - Acquire OAuth 2.0 access token using client credentials
 *    - Create authenticated Microsoft Graph API client
 *
 * 2. **Sync Mode Detection**
 *    - INITIAL: Full sync of all entities
 *    - INCREMENTAL: Delta query sync (only changed entities)
 *
 * 3. **Entity Extraction** (Sequential, in this order)
 *    a. Users (with extension attributes)
 *    b. Groups
 *    c. Group Members (for each group)
 *    d. Directory Roles
 *    e. Role Members (for each role)
 *    f. Applications
 *    g. Service Principals
 *    h. Devices (with owner information)
 *    i. Organizational Contacts
 *    j. App Roles (for each service principal)
 *    k. App Role Assignments (for each service principal)
 *    l. Authentication Methods (for each user)
 *    m. Authentication Methods Policy
 *    n. License Assignments (for each user)
 *    o. PIM Eligible Roles
 *    p. Conditional Access Policies
 *    q. Lifecycle Workflows
 *    r. Directory Audit Logs (time-windowed)
 *    s. Sign-In Logs (time-windowed)
 *
 * 4. **State Management**
 *    - Track extraction progress for each entity
 *    - Store pagination tokens (nextLink) for resumption
 *    - Store delta tokens (deltaLink) for incremental syncs
 *    - Handle timeout and resume from checkpoint
 *
 * 5. **Error Handling**
 *    - Rate Limiting (429): Request delay and retry
 *    - Authentication (401): Request delay and retry
 *    - Permission Denied (403): Skip entity and continue
 *    - Delta Expired (410): Reset to full sync for that entity
 *    - Other errors: Fail extraction with detailed error
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * INCREMENTAL SYNC STRATEGY
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Microsoft Graph API supports delta queries for most entity types. Delta queries
 * return only entities that have changed since the last sync, significantly
 * reducing API calls and processing time.
 *
 * Delta Token Lifecycle:
 * 1. Initial sync returns @odata.deltaLink
 * 2. Store deltaLink in state for next sync
 * 3. Incremental sync uses deltaLink to get only changes
 * 4. If deltaLink expires (410 error), fall back to full sync
 * 5. Delta tokens are valid for 7 days
 *
 * Delta Query Support:
 * - ✅ Users, Groups, Directory Roles
 * - ✅ Applications, Service Principals
 * - ✅ Devices, Organizational Contacts
 * - ❌ Group Members, Role Members (re-fetch for changed parent)
 * - ❌ Audit Logs, Sign-In Logs (use time-windowed queries)
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * PERFORMANCE & OPTIMIZATION
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * - Pagination: 999 items per page (maximum allowed by Graph API)
 * - Timeout Handling: Worker can resume from last checkpoint
 * - Graceful Degradation: Skip entities with missing permissions
 * - Memory Efficiency: Stream entities in batches, don't hold all in memory
 * - Rate Limiting: Respect Retry-After headers from API
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * STATE PRESERVATION
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * The worker maintains state across invocations:
 * - Entity completion flags
 * - Pagination nextLink tokens
 * - Delta query deltaLink tokens
 * - Extracted item counts
 * - Collected entity IDs
 * - Sync timestamps
 *
 * This enables:
 * - Resumption after timeouts
 * - Incremental syncs
 * - Progress tracking
 * - Accurate metrics
 */

// Import DevRev Airdrop framework types and functions
import { EventType, ExtractorEventType, processTask, WorkerAdapter } from '@devrev/ts-adaas';

// Import state management types and initializer
import { ADAPTER_TIMEOUT_DELAY_MS, ENTITY_NAMES, DEFAULT_RATE_LIMIT_DELAY_SECONDS } from '../../common/constants';
import { validateConnectionData } from '../../common/security';
import { getInitialState, State } from '../../common/state';
// Import Microsoft Graph API client and authentication
import {
  formatError,
  isAuthError,
  isBadRequestError,
  isDeltaExpiredError,
  isForbiddenError,
  isRateLimitError,
  getRetryAfterSeconds,
  wait,
} from '../../common/utils';
import {
  normalizeApplication,
  normalizeDevice,
  normalizeDirectoryRole,
  normalizeGroup,
  normalizeGroupMember,
  normalizeOrgContact,
  normalizeServicePrincipal,
  normalizeUser,
  normalizeAppRole,
  normalizeAppRoleAssignment,
  normalizeAuthenticationMethod,
  normalizeAuthenticationMethodsPolicy,
  normalizeLicenseAssignment,
  normalizePIMEligibleRole,
  normalizeConditionalAccessPolicy,
  normalizeLifecycleWorkflow,
  normalizeDirectoryAudit,
  normalizeSignIn,
} from '../../external-system/data-normalization';
import { acquireAccessToken, EntraIDClient } from '../../external-system/entra_id_api';

// Import all normalization functions for transforming raw API data

// Import configuration constants

// Import utility functions for error handling and delays

// Import security validation functions

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * MAIN EXTRACTION TASK
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * This processTask() call registers the worker with the DevRev Airdrop framework.
 * It defines two callbacks:
 * 1. onTimeout: Called when worker is about to timeout (saves progress)
 * 2. task: Main extraction logic that runs on each invocation
 */
processTask({
  /**
   * Timeout Handler
   *
   * Called by the framework when the worker is approaching its execution time limit.
   * Emits a progress event to signal that work is being saved and will resume later.
   *
   * The worker will be re-invoked later and will resume from its last saved state.
   */
  onTimeout: async ({ adapter }: { adapter: WorkerAdapter<State> }) => {
    // Emit progress event to indicate state is being saved
    await adapter.emit(ExtractorEventType.DataExtractionProgress);
  },

  /**
   * Main Extraction Task
   *
   * Orchestrates the extraction of all Azure Entra ID entities.
   * This function is called on each worker invocation and can be called multiple
   * times if the extraction takes longer than the worker timeout.
   *
   * @param adapter - DevRev Airdrop adapter providing state management and API access
   */
  task: async ({ adapter }: { adapter: WorkerAdapter<State> }) => {
    try {
      // ─────────────────────────────────────────────────────────────────────────
      // STEP 1: EXTRACT AND VALIDATE CONNECTION CREDENTIALS
      // ─────────────────────────────────────────────────────────────────────────
      // Connection data is provided by DevRev and contains Azure AD credentials
      // Security validation prevents injection attacks and malformed credentials

      // Validate and extract credentials using centralized security validation
      // This function performs comprehensive input validation on all credential fields
      const { tenantId, clientId, clientSecret } = validateConnectionData(adapter.event.payload.connection_data);

      // ─────────────────────────────────────────────────────────────────────────
      // STEP 2: AUTHENTICATE WITH MICROSOFT ENTRA ID
      // ─────────────────────────────────────────────────────────────────────────
      // Acquire OAuth 2.0 access token using client credentials flow
      // This token will be used for all subsequent Microsoft Graph API calls

      const accessToken = await acquireAccessToken(tenantId, clientId, clientSecret);

      // Create authenticated Microsoft Graph API client
      const client = new EntraIDClient(accessToken);

      // ─────────────────────────────────────────────────────────────────────────
      // STEP 3: DETERMINE SYNC MODE (INITIAL vs INCREMENTAL)
      // ─────────────────────────────────────────────────────────────────────────
      // Check if this is an incremental sync or initial full sync
      // Incremental syncs use delta queries to fetch only changed entities

      const isIncremental = adapter.event.payload.event_context.mode !== 'INITIAL';

      // ─────────────────────────────────────────────────────────────────────────
      // STEP 4: RESET STATE FOR INCREMENTAL SYNC (IF APPLICABLE)
      // ─────────────────────────────────────────────────────────────────────────
      // For incremental syncs, we need to reset entity completion flags while
      // preserving delta links and timestamps from the previous successful sync

      if (isIncremental && adapter.event.payload.event_type === EventType.StartExtractingData) {
        console.log('[data-extraction] Incremental sync: resetting entity completion flags while preserving delta links');

        // Save critical data from previous sync
        // Delta links are tokens that allow us to fetch only changes
        const prevDeltaLinks = adapter.state.deltaLinks;

        // Last successful sync timestamp helps with audit log time-windowing
        const prevLastSuccessfulSync = adapter.state.lastSuccessfulSyncStarted;

        // Last audit/sign-in log sync timestamps for time-windowed queries
        const prevAuditLogSync = adapter.state.lastAuditLogSync;
        const prevSignInLogSync = adapter.state.lastSignInLogSync;

        // Reset state to initial but preserve delta links and timestamps
        // This allows us to:
        // - Re-extract all entities using delta queries (only changed items)
        // - Continue audit log queries from last sync time
        // - Track the new sync's progress independently
        adapter.state = {
          ...getInitialState(), // Fresh state with all entities marked incomplete
          deltaLinks: prevDeltaLinks, // Preserve delta query tokens
          lastSuccessfulSyncStarted: prevLastSuccessfulSync, // Preserve last sync timestamp
          lastAuditLogSync: prevAuditLogSync, // Preserve last audit log sync time
          lastSignInLogSync: prevSignInLogSync, // Preserve last sign-in log sync time
        };
      }

      // ─────────────────────────────────────────────────────────────────────────
      // STEP 5: RECORD SYNC START TIMESTAMP
      // ─────────────────────────────────────────────────────────────────────────
      // Record when this sync started (only on the very first invocation)
      // This timestamp is used for:
      // - Audit log time-windowing (fetch logs since last sync)
      // - Tracking sync duration
      // - Debugging and monitoring

      if (!adapter.state.lastSyncStarted) {
        adapter.state.lastSyncStarted = new Date().toISOString();
      }

      // ─────────────────────────────────────────────────────────────────────────
      // STEP 6: INITIALIZE DATA REPOSITORIES
      // ─────────────────────────────────────────────────────────────────────────
      // Register all entity types that will be extracted
      // This tells the DevRev framework what types of data we'll be sending

      adapter.initializeRepos([
        // Core identity entities
        { itemType: ENTITY_NAMES.USERS }, // Azure AD users
        { itemType: ENTITY_NAMES.GROUPS }, // Azure AD groups
        { itemType: ENTITY_NAMES.GROUP_MEMBERS }, // Group membership relationships
        { itemType: ENTITY_NAMES.DIRECTORY_ROLES }, // Admin roles
        { itemType: ENTITY_NAMES.ROLE_MEMBERS }, // Role assignment relationships
        { itemType: ENTITY_NAMES.APPLICATIONS }, // Application registrations
        { itemType: ENTITY_NAMES.SERVICE_PRINCIPALS }, // Service principals (enterprise apps)
        { itemType: ENTITY_NAMES.DEVICES }, // Registered devices
        { itemType: ENTITY_NAMES.ORG_CONTACTS }, // Organizational contacts
        // Advanced identity entities
        { itemType: ENTITY_NAMES.APP_ROLES }, // Application role definitions
        { itemType: ENTITY_NAMES.APP_ROLE_ASSIGNMENTS }, // Application role assignments
        { itemType: ENTITY_NAMES.AUTHENTICATION_METHODS }, // User MFA methods
        { itemType: ENTITY_NAMES.AUTHENTICATION_METHODS_POLICY }, // Tenant MFA policy
        { itemType: ENTITY_NAMES.LICENSE_ASSIGNMENTS }, // User license assignments
        { itemType: ENTITY_NAMES.PIM_ELIGIBLE_ROLES }, // PIM role eligibilities
        { itemType: ENTITY_NAMES.CONDITIONAL_ACCESS_POLICIES }, // Conditional Access policies
        { itemType: ENTITY_NAMES.LIFECYCLE_WORKFLOWS }, // Identity lifecycle workflows
        { itemType: ENTITY_NAMES.DIRECTORY_AUDIT_LOGS }, // Directory audit logs
        { itemType: ENTITY_NAMES.SIGN_IN_LOGS }, // User sign-in logs
      ]);

      // ─────────────────────────────────────────────────────────────────────────
      // STEP 7: TRACK SKIPPED ENTITIES
      // ─────────────────────────────────────────────────────────────────────────
      // Array to collect names of entities that were skipped due to missing permissions
      // This will be logged at the end for transparency

      const skippedEntities: string[] = [];

      // ═══════════════════════════════════════════════════════════════════════
      // ENTITY EXTRACTION #1: USERS
      // ═══════════════════════════════════════════════════════════════════════
      // Extract all users from Azure AD, including:
      // - Basic profile information (name, email, job title)
      // - Dynamic extension attributes (custom fields)
      // - Account status and user type
      //
      // Supports:
      // - ✅ Incremental sync via delta queries
      // - ✅ Pagination (up to 999 users per page)
      // - ✅ Resume from checkpoint on timeout
      //
      // Required Permission: User.Read.All
      // ═══════════════════════════════════════════════════════════════════════

      // Only extract if not already completed (enables resumption after timeout)
      if (!adapter.state.users.completed) {
        try {
          // ─────────────────────────────────────────────────────────────────────
          // Initialize extraction variables
          // ─────────────────────────────────────────────────────────────────────

          // Restore pagination token from previous invocation (if any)
          let nextLink = adapter.state.users.nextLink;

          // Variable to hold current page of results
          let page;

          // Maintain array of all user IDs extracted so far (for membership queries)
          const collectedIds: string[] = [...adapter.state.users.ids];

          // ─────────────────────────────────────────────────────────────────────
          // Pagination Loop - Fetch all pages of users
          // ─────────────────────────────────────────────────────────────────────

          do {
            // ───────────────────────────────────────────────────────────────────
            // Check for timeout before API call
            // ───────────────────────────────────────────────────────────────────
            // If worker is approaching timeout, save state and exit gracefully
            // The worker will be re-invoked and resume from this point
            if (adapter.isTimeout) {
              await wait(ADAPTER_TIMEOUT_DELAY_MS); // Brief delay before exit
              return; // Exit gracefully - state is already saved
            }

            // ───────────────────────────────────────────────────────────────────
            // Fetch page of users (delta query or full list)
            // ───────────────────────────────────────────────────────────────────

            if (isIncremental && adapter.state.deltaLinks.users) {
              // INCREMENTAL SYNC: Use delta query to fetch only changed users
              // Delta link from previous sync OR pagination nextLink if continuing
              page = await client.getUsersDelta(nextLink || adapter.state.deltaLinks.users);
            } else {
              // FULL SYNC: Fetch all users using standard list endpoint
              page = await client.listUsersPage(nextLink);
            }

            // ───────────────────────────────────────────────────────────────────
            // Check for timeout after API call
            // ───────────────────────────────────────────────────────────────────
            // API call completed, but check timeout before processing results
            if (adapter.isTimeout) {
              await wait(ADAPTER_TIMEOUT_DELAY_MS); // Brief delay before exit
              return; // Exit gracefully - current page will be re-fetched on next invocation
            }

            // ───────────────────────────────────────────────────────────────────
            // Process and store users from current page
            // ───────────────────────────────────────────────────────────────────

            // Filter out deleted users (marked with @removed property in delta queries)
            // Delta queries may return users with @removed: { reason: "deleted" }
            const activeItems = page.value.filter((u) => !u['@removed']);

            // Transform raw Graph API users into DevRev format
            const normalized = activeItems.map((u) => normalizeUser(u));

            // Push normalized users to DevRev data repository
            await adapter.getRepo(ENTITY_NAMES.USERS)?.push(normalized);

            // Collect user IDs for later use (group membership queries)
            collectedIds.push(...activeItems.map((u) => u.id));

            // ───────────────────────────────────────────────────────────────────
            // Update extraction state for checkpoint/resumption
            // ───────────────────────────────────────────────────────────────────

            // Save collected IDs in state
            adapter.state.users.ids = collectedIds;

            // Increment extraction count for metrics
            adapter.state.users.extractedCount += normalized.length;

            // Extract pagination token for next page
            nextLink = page['@odata.nextLink'];

            // Save pagination token in state for potential resumption
            adapter.state.users.nextLink = nextLink;

            // Continue loop if more pages exist
          } while (nextLink);

          // ─────────────────────────────────────────────────────────────────────
          // Extraction Complete - Save delta link and mark as done
          // ─────────────────────────────────────────────────────────────────────

          // Store delta link for next incremental sync
          // Delta link is only present after final page is retrieved
          if (page?.['@odata.deltaLink']) {
            adapter.state.deltaLinks.users = page['@odata.deltaLink'];
          }

          // Mark entity as completed
          adapter.state.users.completed = true;

          // Clear pagination token (no longer needed)
          adapter.state.users.nextLink = undefined;

          // Log extraction metrics
          console.log(`[data-extraction] Users extracted: ${adapter.state.users.extractedCount}`);

        } catch (error) {
          // ─────────────────────────────────────────────────────────────────────
          // Error Handling - Handle various error scenarios
          // ─────────────────────────────────────────────────────────────────────

          // ── Rate Limiting (HTTP 429) ───────────────────────────────────────
          // Microsoft Graph API rate limit exceeded
          // Request a delay and retry the operation
          if (isRateLimitError(error)) {
            // Extract retry delay from Retry-After header (or use default)
            const delay = getRetryAfterSeconds(error, DEFAULT_RATE_LIMIT_DELAY_SECONDS);

            // Emit delay event to pause extraction and retry later
            await adapter.emit(ExtractorEventType.DataExtractionDelayed, { delay });

            // Exit - worker will be re-invoked after delay
            return;
          }

          // ── Authentication Error (HTTP 401) ────────────────────────────────
          // Access token expired or invalid
          // Request a delay to refresh token
          if (isAuthError(error)) {
            console.warn('[data-extraction] Auth error on users — requesting delay');

            // Request 60-second delay for token refresh
            await adapter.emit(ExtractorEventType.DataExtractionDelayed, { delay: 60 });

            // Exit - worker will re-authenticate on next invocation
            return;
          }

          // ── Delta Token Expired (HTTP 410 or syncStateNotFound) ───────────
          // Delta token is no longer valid (> 7 days old or directory changed significantly)
          // Reset to full sync for this entity
          if (isDeltaExpiredError(error)) {
            console.warn('[data-extraction] Delta token expired for users — resetting to full sync');

            // Clear delta link - next invocation will do full sync
            adapter.state.deltaLinks.users = undefined;

            // Mark entity as incomplete so it gets re-extracted
            adapter.state.users.completed = false;

            // Clear pagination token to start from beginning
            adapter.state.users.nextLink = undefined;

            // Exit - entity will be re-extracted with full sync on next invocation
            return;
          }

          // ── Permission Denied (HTTP 403) ───────────────────────────────────
          // Missing required Graph API permission (User.Read.All)
          // Skip this entity and continue with others
          if (isForbiddenError(error)) {
            console.log(`[data-extraction] Permission denied for users (HTTP 403) — skipping`);

            // Mark entity as completed (but skipped) to prevent retry
            adapter.state.users = { ...adapter.state.users, completed: true, skipped: true };

            // Track skipped entity for final summary log
            skippedEntities.push(ENTITY_NAMES.USERS);

            // Continue to next entity (don't throw error)
          } else {
            // ── Unexpected Error ─────────────────────────────────────────────
            // Unknown error - fail the extraction with details
            throw error;
          }
        }
      }

      // ═══════════════════════════════════════════════════════════════════════
      // ENTITY EXTRACTION #2: GROUPS
      // ═══════════════════════════════════════════════════════════════════════
      // Extract all groups (security groups, Microsoft 365 groups, distribution lists)
      // Supports: ✅ Incremental sync, ✅ Pagination, ✅ Resumption
      // Required Permission: Group.Read.All
      // ═══════════════════════════════════════════════════════════════════════

      if (!adapter.state.groups.completed) {
        try {
          let nextLink = adapter.state.groups.nextLink;
          let page;
          const collectedIds: string[] = [...adapter.state.groups.ids];
          do {
            if (adapter.isTimeout) { await wait(ADAPTER_TIMEOUT_DELAY_MS); return; }

            if (isIncremental && adapter.state.deltaLinks.groups) {
              page = await client.getGroupsDelta(nextLink || adapter.state.deltaLinks.groups);
            } else {
              page = await client.listGroupsPage(nextLink);
            }

            if (adapter.isTimeout) { await wait(ADAPTER_TIMEOUT_DELAY_MS); return; }

            const activeItems = page.value.filter((g) => !g['@removed']);
            const normalized = activeItems.map((g) => normalizeGroup(g));
            await adapter.getRepo(ENTITY_NAMES.GROUPS)?.push(normalized);
            collectedIds.push(...activeItems.map((g) => g.id));

            adapter.state.groups.ids = collectedIds;
            adapter.state.groups.extractedCount += normalized.length;
            nextLink = page['@odata.nextLink'];
            adapter.state.groups.nextLink = nextLink;
          } while (nextLink);

          if (page?.['@odata.deltaLink']) {
            adapter.state.deltaLinks.groups = page['@odata.deltaLink'];
          }
          adapter.state.groups.completed = true;
          adapter.state.groups.nextLink = undefined;
          console.log(`[data-extraction] Groups extracted: ${adapter.state.groups.extractedCount}`);
        } catch (error) {
          if (isRateLimitError(error)) {
            const delay = getRetryAfterSeconds(error, DEFAULT_RATE_LIMIT_DELAY_SECONDS);
            await adapter.emit(ExtractorEventType.DataExtractionDelayed, { delay });
            return;
          }
          if (isAuthError(error)) {
            await adapter.emit(ExtractorEventType.DataExtractionDelayed, { delay: 60 });
            return;
          }
          if (isDeltaExpiredError(error)) {
            adapter.state.deltaLinks.groups = undefined;
            adapter.state.groups.completed = false;
            adapter.state.groups.nextLink = undefined;
            return;
          }
          if (isForbiddenError(error)) {
            console.log(`[data-extraction] Permission denied for groups (HTTP 403) — skipping`);
            adapter.state.groups = { ...adapter.state.groups, completed: true, skipped: true };
            skippedEntities.push(ENTITY_NAMES.GROUPS);
          } else {
            throw error;
          }
        }
      }

      // ═══════════════════════════════════════════════════════════════════════
      // ENTITY EXTRACTION #3: GROUP MEMBERS
      // ═══════════════════════════════════════════════════════════════════════
      // Extract membership relationships for all groups (nested entity extraction)
      // Note: For each group, fetches all its members (users, groups, service principals)
      // Supports: ❌ No delta queries (re-fetch for changed groups), ✅ Pagination
      // Required Permission: GroupMember.Read.All
      // ═══════════════════════════════════════════════════════════════════════
      if (!adapter.state.groupMembers.completed) {
        try {
          const groupIds = adapter.state.groups.ids;
          let currentIndex = adapter.state.groupMembers.currentParentIndex;

          while (currentIndex < groupIds.length) {
            if (adapter.isTimeout) { await wait(ADAPTER_TIMEOUT_DELAY_MS); return; }

            const groupId = groupIds[currentIndex];
            let innerNextLink = adapter.state.groupMembers.currentParentNextLink;

            do {
              if (adapter.isTimeout) { await wait(ADAPTER_TIMEOUT_DELAY_MS); return; }

              const page = await client.listGroupMembers(groupId, innerNextLink);

              if (adapter.isTimeout) { await wait(ADAPTER_TIMEOUT_DELAY_MS); return; }

              const normalized = page.value.map((m) => normalizeGroupMember(m, groupId));
              await adapter.getRepo(ENTITY_NAMES.GROUP_MEMBERS)?.push(normalized);

              adapter.state.groupMembers.extractedCount += normalized.length;
              innerNextLink = page['@odata.nextLink'];
              adapter.state.groupMembers.currentParentNextLink = innerNextLink;
            } while (innerNextLink);

            currentIndex++;
            adapter.state.groupMembers.currentParentIndex = currentIndex;
            adapter.state.groupMembers.currentParentNextLink = undefined;
          }

          adapter.state.groupMembers.completed = true;
          console.log(`[data-extraction] Group members extracted: ${adapter.state.groupMembers.extractedCount}`);
        } catch (error) {
          if (isRateLimitError(error)) {
            const delay = getRetryAfterSeconds(error, DEFAULT_RATE_LIMIT_DELAY_SECONDS);
            await adapter.emit(ExtractorEventType.DataExtractionDelayed, { delay });
            return;
          }
          if (isAuthError(error)) {
            await adapter.emit(ExtractorEventType.DataExtractionDelayed, { delay: 60 });
            return;
          }
          if (isForbiddenError(error)) {
            console.log(`[data-extraction] Permission denied for group_members (HTTP 403) — skipping`);
            adapter.state.groupMembers = { ...adapter.state.groupMembers, completed: true, skipped: true };
            skippedEntities.push(ENTITY_NAMES.GROUP_MEMBERS);
          } else {
            throw error;
          }
        }
      }

      // ═══════════════════════════════════════════════════════════════════════
      // ENTITY EXTRACTION #4: DIRECTORY ROLES
      // ═══════════════════════════════════════════════════════════════════════
      // Extract all directory roles (admin roles like Global Administrator, User Administrator)
      // Note: Returns all roles in single response (no pagination support)
      // Supports: ✅ Incremental sync, ❌ No pagination (< 100 roles typically)
      // Required Permission: RoleManagement.Read.Directory
      // ═══════════════════════════════════════════════════════════════════════
      if (!adapter.state.directoryRoles.completed) {
        try {
          let nextLink = adapter.state.directoryRoles.nextLink;
          let page;
          const collectedIds: string[] = [...adapter.state.directoryRoles.ids];
          do {
            if (adapter.isTimeout) { await wait(ADAPTER_TIMEOUT_DELAY_MS); return; }

            if (isIncremental && adapter.state.deltaLinks.directoryRoles) {
              page = await client.getDirectoryRolesDelta(nextLink || adapter.state.deltaLinks.directoryRoles);
            } else {
              page = await client.listDirectoryRolesPage(nextLink);
            }

            if (adapter.isTimeout) { await wait(ADAPTER_TIMEOUT_DELAY_MS); return; }

            const activeItems = page.value.filter((r) => !r['@removed']);
            const normalized = activeItems.map((r) => normalizeDirectoryRole(r));
            await adapter.getRepo(ENTITY_NAMES.DIRECTORY_ROLES)?.push(normalized);
            collectedIds.push(...activeItems.map((r) => r.id));

            adapter.state.directoryRoles.ids = collectedIds;
            adapter.state.directoryRoles.extractedCount += normalized.length;
            nextLink = page['@odata.nextLink'];
            adapter.state.directoryRoles.nextLink = nextLink;
          } while (nextLink);

          if (page?.['@odata.deltaLink']) {
            adapter.state.deltaLinks.directoryRoles = page['@odata.deltaLink'];
          }
          adapter.state.directoryRoles.completed = true;
          adapter.state.directoryRoles.nextLink = undefined;
          console.log(`[data-extraction] Directory roles extracted: ${adapter.state.directoryRoles.extractedCount}`);
        } catch (error) {
          if (isRateLimitError(error)) {
            const delay = getRetryAfterSeconds(error, DEFAULT_RATE_LIMIT_DELAY_SECONDS);
            await adapter.emit(ExtractorEventType.DataExtractionDelayed, { delay });
            return;
          }
          if (isAuthError(error)) {
            await adapter.emit(ExtractorEventType.DataExtractionDelayed, { delay: 60 });
            return;
          }
          if (isDeltaExpiredError(error)) {
            adapter.state.deltaLinks.directoryRoles = undefined;
            adapter.state.directoryRoles.completed = false;
            adapter.state.directoryRoles.nextLink = undefined;
            return;
          }
          if (isForbiddenError(error)) {
            console.log(`[data-extraction] Permission denied for directory_roles (HTTP 403) — skipping`);
            adapter.state.directoryRoles = { ...adapter.state.directoryRoles, completed: true, skipped: true };
            skippedEntities.push(ENTITY_NAMES.DIRECTORY_ROLES);
          } else {
            throw error;
          }
        }
      }

      // ═══════════════════════════════════════════════════════════════════════
      // ENTITY EXTRACTION #5: ROLE MEMBERS (SKIPPED)
      // ═══════════════════════════════════════════════════════════════════════
      // NOTE: Role member extraction is currently skipped because directory_roles
      // are custom objects in DevRev, and the platform doesn't support
      // object_member relationships with custom objects. This may be enabled
      // in a future version when DevRev supports custom object relationships.
      // ═══════════════════════════════════════════════════════════════════════

      if (!adapter.state.roleMembers.completed) {
        adapter.state.roleMembers.completed = true;
        console.log(`[data-extraction] Role members extraction skipped (custom objects not supported)`);
      }

      // ═══════════════════════════════════════════════════════════════════════
      // ENTITY EXTRACTION #6: APPLICATIONS
      // ═══════════════════════════════════════════════════════════════════════
      // Extract all application registrations (app registrations in Azure AD)
      // Supports: ✅ Incremental sync, ✅ Pagination, ✅ Resumption
      // Required Permission: Application.Read.All
      // ═══════════════════════════════════════════════════════════════════════

      if (!adapter.state.applications.completed) {
        try {
          let nextLink = adapter.state.applications.nextLink;
          let page;
          do {
            if (adapter.isTimeout) { await wait(ADAPTER_TIMEOUT_DELAY_MS); return; }

            if (isIncremental && adapter.state.deltaLinks.applications) {
              page = await client.getApplicationsDelta(nextLink || adapter.state.deltaLinks.applications);
            } else {
              page = await client.listApplicationsPage(nextLink);
            }

            if (adapter.isTimeout) { await wait(ADAPTER_TIMEOUT_DELAY_MS); return; }

            const activeItems = page.value.filter((a) => !a['@removed']);
            const normalized = activeItems.map((a) => normalizeApplication(a));
            await adapter.getRepo(ENTITY_NAMES.APPLICATIONS)?.push(normalized);

            adapter.state.applications.extractedCount += normalized.length;
            nextLink = page['@odata.nextLink'];
            adapter.state.applications.nextLink = nextLink;
          } while (nextLink);

          if (page?.['@odata.deltaLink']) {
            adapter.state.deltaLinks.applications = page['@odata.deltaLink'];
          }
          adapter.state.applications.completed = true;
          adapter.state.applications.nextLink = undefined;
          console.log(`[data-extraction] Applications extracted: ${adapter.state.applications.extractedCount}`);
        } catch (error) {
          if (isRateLimitError(error)) {
            const delay = getRetryAfterSeconds(error, DEFAULT_RATE_LIMIT_DELAY_SECONDS);
            await adapter.emit(ExtractorEventType.DataExtractionDelayed, { delay });
            return;
          }
          if (isAuthError(error)) {
            await adapter.emit(ExtractorEventType.DataExtractionDelayed, { delay: 60 });
            return;
          }
          if (isDeltaExpiredError(error)) {
            adapter.state.deltaLinks.applications = undefined;
            adapter.state.applications.completed = false;
            adapter.state.applications.nextLink = undefined;
            return;
          }
          if (isForbiddenError(error)) {
            console.log(`[data-extraction] Permission denied for applications (HTTP 403) — skipping`);
            adapter.state.applications = { ...adapter.state.applications, completed: true, skipped: true };
            skippedEntities.push(ENTITY_NAMES.APPLICATIONS);
          } else {
            throw error;
          }
        }
      }

      // ═══════════════════════════════════════════════════════════════════════
      // ENTITY EXTRACTION #7: SERVICE PRINCIPALS
      // ═══════════════════════════════════════════════════════════════════════
      // Extract all service principals (enterprise applications)
      // Supports: ✅ Incremental sync, ✅ Pagination, ✅ Resumption
      // Required Permission: Application.Read.All
      // ═══════════════════════════════════════════════════════════════════════

      if (!adapter.state.servicePrincipals.completed) {
        try {
          let nextLink = adapter.state.servicePrincipals.nextLink;
          let page;
          const collectedIds: string[] = [...adapter.state.servicePrincipals.ids];
          do {
            if (adapter.isTimeout) { await wait(ADAPTER_TIMEOUT_DELAY_MS); return; }

            if (isIncremental && adapter.state.deltaLinks.servicePrincipals) {
              page = await client.getServicePrincipalsDelta(nextLink || adapter.state.deltaLinks.servicePrincipals);
            } else {
              page = await client.listServicePrincipalsPage(nextLink);
            }

            if (adapter.isTimeout) { await wait(ADAPTER_TIMEOUT_DELAY_MS); return; }

            const activeItems = page.value.filter((sp) => !sp['@removed']);
            const normalized = activeItems.map((sp) => normalizeServicePrincipal(sp));
            await adapter.getRepo(ENTITY_NAMES.SERVICE_PRINCIPALS)?.push(normalized);
            collectedIds.push(...activeItems.map((sp) => sp.id));

            adapter.state.servicePrincipals.ids = collectedIds;
            adapter.state.servicePrincipals.extractedCount += normalized.length;
            nextLink = page['@odata.nextLink'];
            adapter.state.servicePrincipals.nextLink = nextLink;
          } while (nextLink);

          if (page?.['@odata.deltaLink']) {
            adapter.state.deltaLinks.servicePrincipals = page['@odata.deltaLink'];
          }
          adapter.state.servicePrincipals.completed = true;
          adapter.state.servicePrincipals.nextLink = undefined;
          console.log(`[data-extraction] Service principals extracted: ${adapter.state.servicePrincipals.extractedCount}`);
        } catch (error) {
          if (isRateLimitError(error)) {
            const delay = getRetryAfterSeconds(error, DEFAULT_RATE_LIMIT_DELAY_SECONDS);
            await adapter.emit(ExtractorEventType.DataExtractionDelayed, { delay });
            return;
          }
          if (isAuthError(error)) {
            await adapter.emit(ExtractorEventType.DataExtractionDelayed, { delay: 60 });
            return;
          }
          if (isDeltaExpiredError(error)) {
            adapter.state.deltaLinks.servicePrincipals = undefined;
            adapter.state.servicePrincipals.completed = false;
            adapter.state.servicePrincipals.nextLink = undefined;
            return;
          }
          if (isForbiddenError(error)) {
            console.log(`[data-extraction] Permission denied for service_principals (HTTP 403) — skipping`);
            adapter.state.servicePrincipals = { ...adapter.state.servicePrincipals, completed: true, skipped: true };
            skippedEntities.push(ENTITY_NAMES.SERVICE_PRINCIPALS);
          } else {
            throw error;
          }
        }
      }

      // ═══════════════════════════════════════════════════════════════════════
      // ENTITY EXTRACTION #8: DEVICES
      // ═══════════════════════════════════════════════════════════════════════
      // Extract all registered devices with extended details and owner information
      // Enriches each device with manufacturer, model, and registered owner details
      // Supports: ✅ Incremental sync, ✅ Pagination, ✅ Resumption
      // Required Permission: Device.Read.All
      // ═══════════════════════════════════════════════════════════════════════

      if (!adapter.state.devices.completed) {
        try {
          let nextLink = adapter.state.devices.nextLink;
          let page;
          do {
            if (adapter.isTimeout) { await wait(ADAPTER_TIMEOUT_DELAY_MS); return; }

            if (isIncremental && adapter.state.deltaLinks.devices) {
              page = await client.getDevicesDelta(nextLink || adapter.state.deltaLinks.devices);
            } else {
              page = await client.listDevicesPage(nextLink);
            }

            if (adapter.isTimeout) { await wait(ADAPTER_TIMEOUT_DELAY_MS); return; }

            const activeItems = page.value.filter((d) => !d['@removed']);

            // NEW: Fetch owner and detailed information for each device
            for (const device of activeItems) {
              try {
                // Get registered owner
                const ownersPage = await client.listDeviceRegisteredOwners(device.id);
                if (ownersPage.value.length > 0) {
                  const owner = ownersPage.value[0];
                  device.registeredOwnerId = owner.id;
                  device.registeredOwnerEmail = owner.mail || owner.userPrincipalName;
                  device.registeredOwnerDisplayName = owner.displayName;
                }
              } catch (ownerError) {
                // Non-fatal: continue without owner info
                console.log(`[data-extraction] Could not fetch owner for device ${device.id}`);
              }

              try {
                // Get additional device details (manufacturer, model, profileType)
                const details = await client.getDeviceDetails(device.id);
                device.manufacturer = details.manufacturer;
                device.model = details.model;
                device.profileType = details.profileType;
              } catch (detailsError) {
                // Non-fatal: continue without additional details
                console.log(`[data-extraction] Could not fetch details for device ${device.id}`);
              }
            }

            const normalized = activeItems.map((d) => normalizeDevice(d));
            await adapter.getRepo(ENTITY_NAMES.DEVICES)?.push(normalized);

            adapter.state.devices.extractedCount += normalized.length;
            nextLink = page['@odata.nextLink'];
            adapter.state.devices.nextLink = nextLink;
          } while (nextLink);

          if (page?.['@odata.deltaLink']) {
            adapter.state.deltaLinks.devices = page['@odata.deltaLink'];
          }
          adapter.state.devices.completed = true;
          adapter.state.devices.nextLink = undefined;
          console.log(`[data-extraction] Devices extracted: ${adapter.state.devices.extractedCount}`);
        } catch (error) {
          if (isRateLimitError(error)) {
            const delay = getRetryAfterSeconds(error, DEFAULT_RATE_LIMIT_DELAY_SECONDS);
            await adapter.emit(ExtractorEventType.DataExtractionDelayed, { delay });
            return;
          }
          if (isAuthError(error)) {
            await adapter.emit(ExtractorEventType.DataExtractionDelayed, { delay: 60 });
            return;
          }
          if (isDeltaExpiredError(error)) {
            adapter.state.deltaLinks.devices = undefined;
            adapter.state.devices.completed = false;
            adapter.state.devices.nextLink = undefined;
            return;
          }
          if (isForbiddenError(error)) {
            console.log(`[data-extraction] Permission denied for devices (HTTP 403) — skipping`);
            adapter.state.devices = { ...adapter.state.devices, completed: true, skipped: true };
            skippedEntities.push(ENTITY_NAMES.DEVICES);
          } else {
            throw error;
          }
        }
      }

      // ═══════════════════════════════════════════════════════════════════════
      // ENTITY EXTRACTION #9: ORGANIZATIONAL CONTACTS
      // ═══════════════════════════════════════════════════════════════════════
      // Extract all organizational contacts (external contacts synced from on-prem)
      // Supports: ✅ Incremental sync, ✅ Pagination, ✅ Resumption
      // Required Permission: OrgContact.Read.All
      // ═══════════════════════════════════════════════════════════════════════

      if (!adapter.state.orgContacts.completed) {
        try {
          let nextLink = adapter.state.orgContacts.nextLink;
          let page;
          do {
            if (adapter.isTimeout) { await wait(ADAPTER_TIMEOUT_DELAY_MS); return; }

            if (isIncremental && adapter.state.deltaLinks.orgContacts) {
              page = await client.getOrgContactsDelta(nextLink || adapter.state.deltaLinks.orgContacts);
            } else {
              page = await client.listOrgContactsPage(nextLink);
            }

            if (adapter.isTimeout) { await wait(ADAPTER_TIMEOUT_DELAY_MS); return; }

            const activeItems = page.value.filter((c) => !c['@removed']);
            const normalized = activeItems.map((c) => normalizeOrgContact(c));
            await adapter.getRepo(ENTITY_NAMES.ORG_CONTACTS)?.push(normalized);

            adapter.state.orgContacts.extractedCount += normalized.length;
            nextLink = page['@odata.nextLink'];
            adapter.state.orgContacts.nextLink = nextLink;
          } while (nextLink);

          if (page?.['@odata.deltaLink']) {
            adapter.state.deltaLinks.orgContacts = page['@odata.deltaLink'];
          }
          adapter.state.orgContacts.completed = true;
          adapter.state.orgContacts.nextLink = undefined;
          console.log(`[data-extraction] Org contacts extracted: ${adapter.state.orgContacts.extractedCount}`);
        } catch (error) {
          if (isRateLimitError(error)) {
            const delay = getRetryAfterSeconds(error, DEFAULT_RATE_LIMIT_DELAY_SECONDS);
            await adapter.emit(ExtractorEventType.DataExtractionDelayed, { delay });
            return;
          }
          if (isAuthError(error)) {
            await adapter.emit(ExtractorEventType.DataExtractionDelayed, { delay: 60 });
            return;
          }
          if (isDeltaExpiredError(error)) {
            adapter.state.deltaLinks.orgContacts = undefined;
            adapter.state.orgContacts.completed = false;
            adapter.state.orgContacts.nextLink = undefined;
            return;
          }
          if (isForbiddenError(error)) {
            console.log(`[data-extraction] Permission denied for org_contacts (HTTP 403) — skipping`);
            adapter.state.orgContacts = { ...adapter.state.orgContacts, completed: true, skipped: true };
            skippedEntities.push(ENTITY_NAMES.ORG_CONTACTS);
          } else {
            throw error;
          }
        }
      }

      // ═══════════════════════════════════════════════════════════════════════
      // ENTITY EXTRACTION #10: APP ROLES
      // ═══════════════════════════════════════════════════════════════════════
      // Extract all app roles (application permissions) for each service principal
      // Nested extraction: Iterates through all service principals
      // Supports: ❌ No delta queries, ✅ Resumption
      // Required Permission: Application.Read.All
      // ═══════════════════════════════════════════════════════════════════════

      // Build app role name map for app role assignments
      const appRoleNameMap: Map<string, string> = new Map();

      if (!adapter.state.appRoles.completed) {
        try {
          const spIds = adapter.state.servicePrincipals.ids;
          let currentIndex = adapter.state.appRoles.currentParentIndex;

          while (currentIndex < spIds.length) {
            if (adapter.isTimeout) { await wait(ADAPTER_TIMEOUT_DELAY_MS); return; }

            const spId = spIds[currentIndex];
            try {
              const appRoles = await client.listAppRoles(spId);
              const normalized = appRoles.map((role) => normalizeAppRole(role, spId));
              if (normalized.length > 0) {
                await adapter.getRepo(ENTITY_NAMES.APP_ROLES)?.push(normalized);
                adapter.state.appRoles.extractedCount += normalized.length;

                // Build lookup map: "resourceId_appRoleId" → "roleName"
                // Also store by appRoleId alone as a fallback
                for (const role of appRoles) {
                  const key = `${spId}_${role.id}`;
                  const roleName = role.displayName || role.value || 'Unknown Role';
                  appRoleNameMap.set(key, roleName);
                  appRoleNameMap.set(role.id, roleName); // Fallback lookup by ID alone
                }
              }
            } catch (spError) {
              // Non-fatal: skip this SP and continue
              console.log(`[data-extraction] Could not fetch app roles for SP ${spId}`);
            }

            currentIndex++;
            adapter.state.appRoles.currentParentIndex = currentIndex;
          }

          adapter.state.appRoles.completed = true;
          console.log(`[data-extraction] App roles extracted: ${adapter.state.appRoles.extractedCount}`);
        } catch (error) {
          if (isRateLimitError(error)) {
            const delay = getRetryAfterSeconds(error, DEFAULT_RATE_LIMIT_DELAY_SECONDS);
            await adapter.emit(ExtractorEventType.DataExtractionDelayed, { delay });
            return;
          }
          if (isAuthError(error)) {
            await adapter.emit(ExtractorEventType.DataExtractionDelayed, { delay: 60 });
            return;
          }
          if (isForbiddenError(error)) {
            console.log(`[data-extraction] Permission denied for app_roles (HTTP 403) — skipping`);
            adapter.state.appRoles = { ...adapter.state.appRoles, completed: true, skipped: true };
            skippedEntities.push(ENTITY_NAMES.APP_ROLES);
          } else {
            throw error;
          }
        }
      }

      // ═══════════════════════════════════════════════════════════════════════
      // ENTITY EXTRACTION #11: APP ROLE ASSIGNMENTS
      // ═══════════════════════════════════════════════════════════════════════
      // Extract all app role assignments (who has which app permissions)
      // Nested extraction: Iterates through all service principals
      // Supports: ❌ No delta queries, ✅ Pagination, ✅ Resumption
      // Required Permission: Application.Read.All
      // ═══════════════════════════════════════════════════════════════════════

      if (!adapter.state.appRoleAssignments.completed) {
        try {
          const spIds = adapter.state.servicePrincipals.ids;
          let currentIndex = adapter.state.appRoleAssignments.currentParentIndex;

          while (currentIndex < spIds.length) {
            if (adapter.isTimeout) { await wait(ADAPTER_TIMEOUT_DELAY_MS); return; }

            const spId = spIds[currentIndex];
            let innerNextLink = adapter.state.appRoleAssignments.currentParentNextLink;

            do {
              if (adapter.isTimeout) { await wait(ADAPTER_TIMEOUT_DELAY_MS); return; }

              try {
                const page = await client.listAppRoleAssignments(spId, innerNextLink);
                // Pass app role name map to generate better titles
                const normalized = page.value.map((a) => normalizeAppRoleAssignment(a, appRoleNameMap));
                await adapter.getRepo(ENTITY_NAMES.APP_ROLE_ASSIGNMENTS)?.push(normalized);
                adapter.state.appRoleAssignments.extractedCount += normalized.length;
                innerNextLink = page['@odata.nextLink'];
                adapter.state.appRoleAssignments.currentParentNextLink = innerNextLink;
              } catch (spError) {
                // Non-fatal: skip this SP and continue
                console.log(`[data-extraction] Could not fetch app role assignments for SP ${spId}`);
                break;
              }
            } while (innerNextLink);

            currentIndex++;
            adapter.state.appRoleAssignments.currentParentIndex = currentIndex;
            adapter.state.appRoleAssignments.currentParentNextLink = undefined;
          }

          adapter.state.appRoleAssignments.completed = true;
          console.log(`[data-extraction] App role assignments extracted: ${adapter.state.appRoleAssignments.extractedCount}`);
        } catch (error) {
          if (isRateLimitError(error)) {
            const delay = getRetryAfterSeconds(error, DEFAULT_RATE_LIMIT_DELAY_SECONDS);
            await adapter.emit(ExtractorEventType.DataExtractionDelayed, { delay });
            return;
          }
          if (isAuthError(error)) {
            await adapter.emit(ExtractorEventType.DataExtractionDelayed, { delay: 60 });
            return;
          }
          if (isForbiddenError(error)) {
            console.log(`[data-extraction] Permission denied for app_role_assignments (HTTP 403) — skipping`);
            adapter.state.appRoleAssignments = { ...adapter.state.appRoleAssignments, completed: true, skipped: true };
            skippedEntities.push(ENTITY_NAMES.APP_ROLE_ASSIGNMENTS);
          } else {
            throw error;
          }
        }
      }

      // ═══════════════════════════════════════════════════════════════════════
      // ENTITY EXTRACTION #12: AUTHENTICATION METHODS
      // ═══════════════════════════════════════════════════════════════════════
      // Extract all authentication methods (MFA methods) for each user
      // Nested extraction: Iterates through all users
      // Supports: ❌ No delta queries, ❌ No pagination (few methods per user)
      // Required Permission: UserAuthenticationMethod.Read.All
      // ═══════════════════════════════════════════════════════════════════════

      if (!adapter.state.authenticationMethods.completed) {
        try {
          const userIds = adapter.state.users.ids;
          let currentIndex = adapter.state.authenticationMethods.currentParentIndex;

          while (currentIndex < userIds.length) {
            if (adapter.isTimeout) { await wait(ADAPTER_TIMEOUT_DELAY_MS); return; }

            const userId = userIds[currentIndex];
            try {
              const page = await client.listAuthenticationMethods(userId);
              // Pass undefined for userDisplayName - the normalization function will generate a good title without it
              const normalized = page.value.map((m) => normalizeAuthenticationMethod(m, userId, undefined));
              if (normalized.length > 0) {
                await adapter.getRepo(ENTITY_NAMES.AUTHENTICATION_METHODS)?.push(normalized);
                adapter.state.authenticationMethods.extractedCount += normalized.length;
              }
            } catch (userError) {
              // Non-fatal: skip this user and continue
              console.log(`[data-extraction] Could not fetch auth methods for user ${userId}`);
            }

            currentIndex++;
            adapter.state.authenticationMethods.currentParentIndex = currentIndex;
          }

          adapter.state.authenticationMethods.completed = true;
          console.log(`[data-extraction] Authentication methods extracted: ${adapter.state.authenticationMethods.extractedCount}`);
        } catch (error) {
          if (isRateLimitError(error)) {
            const delay = getRetryAfterSeconds(error, DEFAULT_RATE_LIMIT_DELAY_SECONDS);
            await adapter.emit(ExtractorEventType.DataExtractionDelayed, { delay });
            return;
          }
          if (isAuthError(error)) {
            await adapter.emit(ExtractorEventType.DataExtractionDelayed, { delay: 60 });
            return;
          }
          if (isForbiddenError(error)) {
            console.log(`[data-extraction] Permission denied for authentication_methods (HTTP 403) — skipping`);
            adapter.state.authenticationMethods = { ...adapter.state.authenticationMethods, completed: true, skipped: true };
            skippedEntities.push(ENTITY_NAMES.AUTHENTICATION_METHODS);
          } else {
            throw error;
          }
        }
      }

      // ═══════════════════════════════════════════════════════════════════════
      // ENTITY EXTRACTION #13: AUTHENTICATION METHODS POLICY
      // ═══════════════════════════════════════════════════════════════════════
      // Extract tenant-wide authentication methods policy (single policy object)
      // Defines which MFA methods are enabled/disabled and registration campaigns
      // Supports: ❌ No delta queries (single object), ❌ No pagination
      // Required Permission: Policy.Read.All
      // ═══════════════════════════════════════════════════════════════════════

      if (!adapter.state.authenticationMethodsPolicy.completed) {
        try {
          const policy = await client.getAuthenticationMethodsPolicy();
          const normalized = normalizeAuthenticationMethodsPolicy(policy);
          await adapter.getRepo(ENTITY_NAMES.AUTHENTICATION_METHODS_POLICY)?.push([normalized]);
          adapter.state.authenticationMethodsPolicy.extractedCount = 1;
          adapter.state.authenticationMethodsPolicy.completed = true;
          console.log(`[data-extraction] Authentication methods policy extracted`);
        } catch (error) {
          if (isRateLimitError(error)) {
            const delay = getRetryAfterSeconds(error, DEFAULT_RATE_LIMIT_DELAY_SECONDS);
            await adapter.emit(ExtractorEventType.DataExtractionDelayed, { delay });
            return;
          }
          if (isAuthError(error)) {
            await adapter.emit(ExtractorEventType.DataExtractionDelayed, { delay: 60 });
            return;
          }
          if (isForbiddenError(error)) {
            console.log(`[data-extraction] Permission denied for authentication_methods_policy (HTTP 403) — skipping`);
            adapter.state.authenticationMethodsPolicy = { ...adapter.state.authenticationMethodsPolicy, completed: true, skipped: true };
            skippedEntities.push(ENTITY_NAMES.AUTHENTICATION_METHODS_POLICY);
          } else {
            throw error;
          }
        }
      }

      // ═══════════════════════════════════════════════════════════════════════
      // ENTITY EXTRACTION #14: LICENSE ASSIGNMENTS
      // ═══════════════════════════════════════════════════════════════════════
      // Extract all license assignments (Microsoft 365/Azure licenses) for each user
      // Nested extraction: Iterates through all users
      // Supports: ❌ No delta queries, ❌ No pagination (few licenses per user)
      // Required Permission: Organization.Read.All
      // ═══════════════════════════════════════════════════════════════════════

      if (!adapter.state.licenseAssignments.completed) {
        try {
          const userIds = adapter.state.users.ids;
          let currentIndex = adapter.state.licenseAssignments.currentParentIndex;

          while (currentIndex < userIds.length) {
            if (adapter.isTimeout) { await wait(ADAPTER_TIMEOUT_DELAY_MS); return; }

            const userId = userIds[currentIndex];
            try {
              const page = await client.listLicenseDetails(userId);
              const normalized = page.value.map((l) => normalizeLicenseAssignment(l, userId));
              if (normalized.length > 0) {
                await adapter.getRepo(ENTITY_NAMES.LICENSE_ASSIGNMENTS)?.push(normalized);
                adapter.state.licenseAssignments.extractedCount += normalized.length;
              }
            } catch (userError) {
              // Non-fatal: skip this user and continue
              console.log(`[data-extraction] Could not fetch licenses for user ${userId}`);
            }

            currentIndex++;
            adapter.state.licenseAssignments.currentParentIndex = currentIndex;
          }

          adapter.state.licenseAssignments.completed = true;
          console.log(`[data-extraction] License assignments extracted: ${adapter.state.licenseAssignments.extractedCount}`);
        } catch (error) {
          if (isRateLimitError(error)) {
            const delay = getRetryAfterSeconds(error, DEFAULT_RATE_LIMIT_DELAY_SECONDS);
            await adapter.emit(ExtractorEventType.DataExtractionDelayed, { delay });
            return;
          }
          if (isAuthError(error)) {
            await adapter.emit(ExtractorEventType.DataExtractionDelayed, { delay: 60 });
            return;
          }
          if (isForbiddenError(error)) {
            console.log(`[data-extraction] Permission denied for license_assignments (HTTP 403) — skipping`);
            adapter.state.licenseAssignments = { ...adapter.state.licenseAssignments, completed: true, skipped: true };
            skippedEntities.push(ENTITY_NAMES.LICENSE_ASSIGNMENTS);
          } else {
            throw error;
          }
        }
      }

      // ═══════════════════════════════════════════════════════════════════════
      // ENTITY EXTRACTION #15: PIM ELIGIBLE ROLES
      // ═══════════════════════════════════════════════════════════════════════
      // Extract Privileged Identity Management (PIM) role eligibility schedules
      // Requires: Azure AD Premium P2 license
      // Supports: ❌ No delta queries, ✅ Pagination, ✅ Resumption
      // Required Permission: RoleEligibilitySchedule.Read.Directory
      // ═══════════════════════════════════════════════════════════════════════

      if (!adapter.state.pimEligibleRoles.completed) {
        try {
          let nextLink = adapter.state.pimEligibleRoles.nextLink;
          let page;
          do {
            if (adapter.isTimeout) { await wait(ADAPTER_TIMEOUT_DELAY_MS); return; }

            page = await client.listPIMEligibleRoles(nextLink);

            if (adapter.isTimeout) { await wait(ADAPTER_TIMEOUT_DELAY_MS); return; }

            const normalized = page.value.map((r) => normalizePIMEligibleRole(r));
            await adapter.getRepo(ENTITY_NAMES.PIM_ELIGIBLE_ROLES)?.push(normalized);

            adapter.state.pimEligibleRoles.extractedCount += normalized.length;
            nextLink = page['@odata.nextLink'];
            adapter.state.pimEligibleRoles.nextLink = nextLink;
          } while (nextLink);

          adapter.state.pimEligibleRoles.completed = true;
          adapter.state.pimEligibleRoles.nextLink = undefined;
          console.log(`[data-extraction] PIM eligible roles extracted: ${adapter.state.pimEligibleRoles.extractedCount}`);
        } catch (error) {
          if (isRateLimitError(error)) {
            const delay = getRetryAfterSeconds(error, DEFAULT_RATE_LIMIT_DELAY_SECONDS);
            await adapter.emit(ExtractorEventType.DataExtractionDelayed, { delay });
            return;
          }
          if (isAuthError(error)) {
            await adapter.emit(ExtractorEventType.DataExtractionDelayed, { delay: 60 });
            return;
          }
          if (isForbiddenError(error)) {
            console.log(`[data-extraction] Permission denied for pim_eligible_roles (HTTP 403) — skipping (requires Entra ID P2)`);
            adapter.state.pimEligibleRoles = { ...adapter.state.pimEligibleRoles, completed: true, skipped: true };
            skippedEntities.push(ENTITY_NAMES.PIM_ELIGIBLE_ROLES);
          } else if (isBadRequestError(error)) {
            console.log(`[data-extraction] Bad request for pim_eligible_roles (HTTP 400) — skipping (may not be available for this tenant)`);
            adapter.state.pimEligibleRoles = { ...adapter.state.pimEligibleRoles, completed: true, skipped: true };
            skippedEntities.push(ENTITY_NAMES.PIM_ELIGIBLE_ROLES);
          } else {
            throw error;
          }
        }
      }

      // ═══════════════════════════════════════════════════════════════════════
      // ENTITY EXTRACTION #16: CONDITIONAL ACCESS POLICIES
      // ═══════════════════════════════════════════════════════════════════════
      // Extract all Conditional Access policies (access control policies)
      // Supports: ❌ No delta queries, ✅ Pagination, ✅ Resumption
      // Required Permission: Policy.Read.All
      // ═══════════════════════════════════════════════════════════════════════

      if (!adapter.state.conditionalAccessPolicies.completed) {
        try {
          let nextLink = adapter.state.conditionalAccessPolicies.nextLink;
          let page;
          do {
            if (adapter.isTimeout) { await wait(ADAPTER_TIMEOUT_DELAY_MS); return; }

            page = await client.listConditionalAccessPolicies(nextLink);

            if (adapter.isTimeout) { await wait(ADAPTER_TIMEOUT_DELAY_MS); return; }

            const normalized = page.value.map((p) => normalizeConditionalAccessPolicy(p));
            await adapter.getRepo(ENTITY_NAMES.CONDITIONAL_ACCESS_POLICIES)?.push(normalized);

            adapter.state.conditionalAccessPolicies.extractedCount += normalized.length;
            nextLink = page['@odata.nextLink'];
            adapter.state.conditionalAccessPolicies.nextLink = nextLink;
          } while (nextLink);

          adapter.state.conditionalAccessPolicies.completed = true;
          adapter.state.conditionalAccessPolicies.nextLink = undefined;
          console.log(`[data-extraction] Conditional Access policies extracted: ${adapter.state.conditionalAccessPolicies.extractedCount}`);
        } catch (error) {
          if (isRateLimitError(error)) {
            const delay = getRetryAfterSeconds(error, DEFAULT_RATE_LIMIT_DELAY_SECONDS);
            await adapter.emit(ExtractorEventType.DataExtractionDelayed, { delay });
            return;
          }
          if (isAuthError(error)) {
            await adapter.emit(ExtractorEventType.DataExtractionDelayed, { delay: 60 });
            return;
          }
          if (isForbiddenError(error)) {
            console.log(`[data-extraction] Permission denied for conditional_access_policies (HTTP 403) — skipping`);
            adapter.state.conditionalAccessPolicies = { ...adapter.state.conditionalAccessPolicies, completed: true, skipped: true };
            skippedEntities.push(ENTITY_NAMES.CONDITIONAL_ACCESS_POLICIES);
          } else if (isBadRequestError(error)) {
            console.log(`[data-extraction] Bad request for conditional_access_policies (HTTP 400) — skipping (may not be available for this tenant)`);
            adapter.state.conditionalAccessPolicies = { ...adapter.state.conditionalAccessPolicies, completed: true, skipped: true };
            skippedEntities.push(ENTITY_NAMES.CONDITIONAL_ACCESS_POLICIES);
          } else {
            throw error;
          }
        }
      }

      // ═══════════════════════════════════════════════════════════════════════
      // ENTITY EXTRACTION #17: LIFECYCLE WORKFLOWS
      // ═══════════════════════════════════════════════════════════════════════
      // Extract identity lifecycle workflows (onboarding/offboarding automation)
      // Requires: Azure AD Governance license (part of Azure AD P2 or E5)
      // Supports: ❌ No delta queries, ✅ Pagination, ✅ Resumption
      // Required Permission: LifecycleWorkflows.Read.All
      // ═══════════════════════════════════════════════════════════════════════

      if (!adapter.state.lifecycleWorkflows.completed) {
        try {
          let nextLink = adapter.state.lifecycleWorkflows.nextLink;
          let page;
          do {
            if (adapter.isTimeout) { await wait(ADAPTER_TIMEOUT_DELAY_MS); return; }

            page = await client.listLifecycleWorkflows(nextLink);

            if (adapter.isTimeout) { await wait(ADAPTER_TIMEOUT_DELAY_MS); return; }

            const normalized = page.value.map((w) => normalizeLifecycleWorkflow(w));
            await adapter.getRepo(ENTITY_NAMES.LIFECYCLE_WORKFLOWS)?.push(normalized);

            adapter.state.lifecycleWorkflows.extractedCount += normalized.length;
            nextLink = page['@odata.nextLink'];
            adapter.state.lifecycleWorkflows.nextLink = nextLink;
          } while (nextLink);

          adapter.state.lifecycleWorkflows.completed = true;
          adapter.state.lifecycleWorkflows.nextLink = undefined;
          console.log(`[data-extraction] Lifecycle workflows extracted: ${adapter.state.lifecycleWorkflows.extractedCount}`);
        } catch (error) {
          if (isRateLimitError(error)) {
            const delay = getRetryAfterSeconds(error, DEFAULT_RATE_LIMIT_DELAY_SECONDS);
            await adapter.emit(ExtractorEventType.DataExtractionDelayed, { delay });
            return;
          }
          if (isAuthError(error)) {
            await adapter.emit(ExtractorEventType.DataExtractionDelayed, { delay: 60 });
            return;
          }
          if (isForbiddenError(error)) {
            console.log(`[data-extraction] Permission denied for lifecycle_workflows (HTTP 403) — skipping (requires Entra ID Governance)`);
            adapter.state.lifecycleWorkflows = { ...adapter.state.lifecycleWorkflows, completed: true, skipped: true };
            skippedEntities.push(ENTITY_NAMES.LIFECYCLE_WORKFLOWS);
          } else if (isBadRequestError(error)) {
            console.log(`[data-extraction] Bad request for lifecycle_workflows (HTTP 400) — skipping (may not be available for this tenant)`);
            adapter.state.lifecycleWorkflows = { ...adapter.state.lifecycleWorkflows, completed: true, skipped: true };
            skippedEntities.push(ENTITY_NAMES.LIFECYCLE_WORKFLOWS);
          } else {
            throw error;
          }
        }
      }

      // ═══════════════════════════════════════════════════════════════════════
      // ENTITY EXTRACTION #18: DIRECTORY AUDIT LOGS
      // ═══════════════════════════════════════════════════════════════════════
      // Extract directory audit logs (changes to users, groups, apps, policies)
      // Time-windowed: Fetches logs since last sync (7-30 day retention)
      // Supports: ❌ No delta queries (time-based), ✅ Pagination, ✅ Resumption
      // Required Permission: AuditLog.Read.All
      // ═══════════════════════════════════════════════════════════════════════

      if (!adapter.state.directoryAuditLogs.completed) {
        try {
          // Fetch audit logs from last 7 days
          const startDateTime = adapter.state.lastAuditLogSync || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
          let nextLink = adapter.state.directoryAuditLogs.nextLink;
          let page;
          do {
            if (adapter.isTimeout) { await wait(ADAPTER_TIMEOUT_DELAY_MS); return; }

            page = await client.listDirectoryAudits(startDateTime, nextLink);

            if (adapter.isTimeout) { await wait(ADAPTER_TIMEOUT_DELAY_MS); return; }

            const normalized = page.value.map((a) => normalizeDirectoryAudit(a));
            await adapter.getRepo(ENTITY_NAMES.DIRECTORY_AUDIT_LOGS)?.push(normalized);

            adapter.state.directoryAuditLogs.extractedCount += normalized.length;
            nextLink = page['@odata.nextLink'];
            adapter.state.directoryAuditLogs.nextLink = nextLink;
          } while (nextLink);

          adapter.state.directoryAuditLogs.completed = true;
          adapter.state.directoryAuditLogs.nextLink = undefined;
          adapter.state.lastAuditLogSync = new Date().toISOString();
          console.log(`[data-extraction] Directory audit logs extracted: ${adapter.state.directoryAuditLogs.extractedCount}`);
        } catch (error) {
          if (isRateLimitError(error)) {
            const delay = getRetryAfterSeconds(error, DEFAULT_RATE_LIMIT_DELAY_SECONDS);
            await adapter.emit(ExtractorEventType.DataExtractionDelayed, { delay });
            return;
          }
          if (isAuthError(error)) {
            await adapter.emit(ExtractorEventType.DataExtractionDelayed, { delay: 60 });
            return;
          }
          if (isForbiddenError(error)) {
            console.log(`[data-extraction] Permission denied for directory_audit_logs (HTTP 403) — skipping`);
            adapter.state.directoryAuditLogs = { ...adapter.state.directoryAuditLogs, completed: true, skipped: true };
            skippedEntities.push(ENTITY_NAMES.DIRECTORY_AUDIT_LOGS);
          } else if (isBadRequestError(error)) {
            console.log(`[data-extraction] Bad request for directory_audit_logs (HTTP 400) — skipping (may not be available for this tenant)`);
            adapter.state.directoryAuditLogs = { ...adapter.state.directoryAuditLogs, completed: true, skipped: true };
            skippedEntities.push(ENTITY_NAMES.DIRECTORY_AUDIT_LOGS);
          } else {
            throw error;
          }
        }
      }

      // ═══════════════════════════════════════════════════════════════════════
      // ENTITY EXTRACTION #19: SIGN-IN LOGS
      // ═══════════════════════════════════════════════════════════════════════
      // Extract user sign-in logs (successful and failed authentication attempts)
      // Time-windowed: Fetches logs since last sync (7-30 day retention)
      // Supports: ❌ No delta queries (time-based), ✅ Pagination, ✅ Resumption
      // Required Permission: AuditLog.Read.All
      // ═══════════════════════════════════════════════════════════════════════

      if (!adapter.state.signInLogs.completed) {
        try {
          // Fetch sign-in logs from last 7 days
          const startDateTime = adapter.state.lastSignInLogSync || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
          let nextLink = adapter.state.signInLogs.nextLink;
          let page;
          do {
            if (adapter.isTimeout) { await wait(ADAPTER_TIMEOUT_DELAY_MS); return; }

            page = await client.listSignIns(startDateTime, nextLink);

            if (adapter.isTimeout) { await wait(ADAPTER_TIMEOUT_DELAY_MS); return; }

            const normalized = page.value.map((s) => normalizeSignIn(s));
            await adapter.getRepo(ENTITY_NAMES.SIGN_IN_LOGS)?.push(normalized);

            adapter.state.signInLogs.extractedCount += normalized.length;
            nextLink = page['@odata.nextLink'];
            adapter.state.signInLogs.nextLink = nextLink;
          } while (nextLink);

          adapter.state.signInLogs.completed = true;
          adapter.state.signInLogs.nextLink = undefined;
          adapter.state.lastSignInLogSync = new Date().toISOString();
          console.log(`[data-extraction] Sign-in logs extracted: ${adapter.state.signInLogs.extractedCount}`);
        } catch (error) {
          if (isRateLimitError(error)) {
            const delay = getRetryAfterSeconds(error, DEFAULT_RATE_LIMIT_DELAY_SECONDS);
            await adapter.emit(ExtractorEventType.DataExtractionDelayed, { delay });
            return;
          }
          if (isAuthError(error)) {
            await adapter.emit(ExtractorEventType.DataExtractionDelayed, { delay: 60 });
            return;
          }
          if (isForbiddenError(error)) {
            console.log(`[data-extraction] Permission denied for sign_in_logs (HTTP 403) — skipping`);
            adapter.state.signInLogs = { ...adapter.state.signInLogs, completed: true, skipped: true };
            skippedEntities.push(ENTITY_NAMES.SIGN_IN_LOGS);
          } else if (isBadRequestError(error)) {
            console.log(`[data-extraction] Bad request for sign_in_logs (HTTP 400) — skipping (may not be available for this tenant)`);
            adapter.state.signInLogs = { ...adapter.state.signInLogs, completed: true, skipped: true };
            skippedEntities.push(ENTITY_NAMES.SIGN_IN_LOGS);
          } else {
            throw error;
          }
        }
      }

      // ═══════════════════════════════════════════════════════════════════════
      // EXTRACTION COMPLETE - FINAL CLEANUP AND REPORTING
      // ═══════════════════════════════════════════════════════════════════════

      // ─────────────────────────────────────────────────────────────────────
      // Log Summary of Skipped Entities
      // ─────────────────────────────────────────────────────────────────────
      // Some entities may be skipped due to:
      // - Missing Microsoft Graph API permissions (HTTP 403)
      // - License requirements not met (P2, Governance)
      // - Entity type not available in tenant (HTTP 400)

      if (skippedEntities.length > 0) {
        console.log(
          `[data-extraction] Skipped ${skippedEntities.length} entities due to missing permissions or availability: ${skippedEntities.join(', ')}`
        );
      }

      // ─────────────────────────────────────────────────────────────────────
      // Persist Successful Sync Timestamp
      // ─────────────────────────────────────────────────────────────────────
      // Save the start timestamp of this successful sync
      // This will be used as the baseline for the next incremental sync
      // Also used for audit log time-windowing

      adapter.state.lastSuccessfulSyncStarted = adapter.state.lastSyncStarted;

      // Clear current sync timestamp (will be set again on next sync)
      adapter.state.lastSyncStarted = undefined;

      // ─────────────────────────────────────────────────────────────────────
      // Emit Completion Event
      // ─────────────────────────────────────────────────────────────────────
      // Signal to DevRev framework that extraction completed successfully
      // All extracted data has been pushed to repositories and is ready for ingestion

      console.log(`[data-extraction] Extraction completed successfully`);
      await adapter.emit(ExtractorEventType.DataExtractionDone);

    } catch (error) {
      // ═══════════════════════════════════════════════════════════════════════
      // UNRECOVERABLE ERROR HANDLER
      // ═══════════════════════════════════════════════════════════════════════
      // This catch block handles unexpected errors that weren't caught by
      // entity-specific error handlers. These are fatal errors that prevent
      // the entire extraction from completing.
      //
      // Common causes:
      // - Network failures during critical operations
      // - Invalid credentials (should be caught earlier but might slip through)
      // - Programming errors (bugs in the connector code)
      // - DevRev framework errors

      // Log detailed error information for debugging
      console.error('[data-extraction] Unrecoverable error:', formatError(error));

      // Emit error event to signal extraction failure
      // This will mark the sync as failed in DevRev
      await adapter.emit(ExtractorEventType.DataExtractionError, {
        error: { message: formatError(error) },
      });
    }
  },
});
