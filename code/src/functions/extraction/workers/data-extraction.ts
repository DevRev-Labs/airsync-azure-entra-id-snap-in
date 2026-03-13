import { ExtractorEventType, processTask, WorkerAdapter } from '@devrev/ts-adaas';
import { State } from '../../common/state';
import { acquireAccessToken, EntraIDClient } from '../../external-system/entra_id_api';
import {
  normalizeApplication,
  normalizeDevice,
  normalizeDirectoryRole,
  normalizeGroup,
  normalizeGroupMember,
  normalizeOrgContact,
  normalizeRoleMember,
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
import { ADAPTER_TIMEOUT_DELAY_MS, ENTITY_NAMES, DEFAULT_RATE_LIMIT_DELAY_SECONDS } from '../../common/constants';
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

processTask({
  onTimeout: async ({ adapter }: { adapter: WorkerAdapter<State> }) => {
    await adapter.emit(ExtractorEventType.DataExtractionProgress);
  },
  task: async ({ adapter }: { adapter: WorkerAdapter<State> }) => {
    try {
      const { org_id: tenantId, key } = adapter.event.payload.connection_data;
      const [clientId, clientSecret] = key.split('|');
      const accessToken = await acquireAccessToken(tenantId, clientId, clientSecret);
      const client = new EntraIDClient(accessToken);
      const isIncremental = adapter.event.payload.event_context.mode !== 'INITIAL';

      // Record sync start timestamp (only on first invocation of this sync)
      if (!adapter.state.lastSyncStarted) {
        adapter.state.lastSyncStarted = new Date().toISOString();
      }

      adapter.initializeRepos([
        { itemType: ENTITY_NAMES.USERS },
        { itemType: ENTITY_NAMES.GROUPS },
        { itemType: ENTITY_NAMES.GROUP_MEMBERS },
        { itemType: ENTITY_NAMES.DIRECTORY_ROLES },
        { itemType: ENTITY_NAMES.ROLE_MEMBERS },
        { itemType: ENTITY_NAMES.APPLICATIONS },
        { itemType: ENTITY_NAMES.SERVICE_PRINCIPALS },
        { itemType: ENTITY_NAMES.DEVICES },
        { itemType: ENTITY_NAMES.ORG_CONTACTS },
        // NEW ENTITIES
        { itemType: ENTITY_NAMES.APP_ROLES },
        { itemType: ENTITY_NAMES.APP_ROLE_ASSIGNMENTS },
        { itemType: ENTITY_NAMES.AUTHENTICATION_METHODS },
        { itemType: ENTITY_NAMES.AUTHENTICATION_METHODS_POLICY },
        { itemType: ENTITY_NAMES.LICENSE_ASSIGNMENTS },
        { itemType: ENTITY_NAMES.PIM_ELIGIBLE_ROLES },
        { itemType: ENTITY_NAMES.CONDITIONAL_ACCESS_POLICIES },
        { itemType: ENTITY_NAMES.LIFECYCLE_WORKFLOWS },
        { itemType: ENTITY_NAMES.DIRECTORY_AUDIT_LOGS },
        { itemType: ENTITY_NAMES.SIGN_IN_LOGS },
      ]);

      const skippedEntities: string[] = [];

      // ── 1. Users ──────────────────────────────────────────────────────────
      if (!adapter.state.users.completed) {
        try {
          let nextLink = adapter.state.users.nextLink;
          let page;
          const collectedIds: string[] = [...adapter.state.users.ids];
          do {
            if (adapter.isTimeout) { await wait(ADAPTER_TIMEOUT_DELAY_MS); return; }

            if (isIncremental && adapter.state.deltaLinks.users) {
              page = await client.getUsersDelta(nextLink || adapter.state.deltaLinks.users);
            } else {
              page = await client.listUsersPage(nextLink);
            }

            if (adapter.isTimeout) { await wait(ADAPTER_TIMEOUT_DELAY_MS); return; }

            const activeItems = page.value.filter((u) => !u['@removed']);
            const normalized = activeItems.map((u) => normalizeUser(u));
            await adapter.getRepo(ENTITY_NAMES.USERS)?.push(normalized);
            collectedIds.push(...activeItems.map((u) => u.id));

            adapter.state.users.ids = collectedIds;
            adapter.state.users.extractedCount += normalized.length;
            nextLink = page['@odata.nextLink'];
            adapter.state.users.nextLink = nextLink;
          } while (nextLink);

          // Store delta link for next incremental sync
          if (page?.['@odata.deltaLink']) {
            adapter.state.deltaLinks.users = page['@odata.deltaLink'];
          }
          adapter.state.users.completed = true;
          adapter.state.users.nextLink = undefined;
          console.log(`[data-extraction] Users extracted: ${adapter.state.users.extractedCount}`);
        } catch (error) {
          if (isRateLimitError(error)) {
            const delay = getRetryAfterSeconds(error, DEFAULT_RATE_LIMIT_DELAY_SECONDS);
            await adapter.emit(ExtractorEventType.DataExtractionDelayed, { delay });
            return;
          }
          if (isAuthError(error)) {
            console.warn('[data-extraction] Auth error on users — requesting delay');
            await adapter.emit(ExtractorEventType.DataExtractionDelayed, { delay: 60 });
            return;
          }
          if (isDeltaExpiredError(error)) {
            console.warn('[data-extraction] Delta token expired for users — resetting to full sync');
            adapter.state.deltaLinks.users = undefined;
            adapter.state.users.completed = false;
            adapter.state.users.nextLink = undefined;
            // Fall through — entity will be re-extracted on next invocation
            return;
          }
          if (isForbiddenError(error)) {
            console.log(`[data-extraction] Permission denied for users (HTTP 403) — skipping`);
            adapter.state.users = { ...adapter.state.users, completed: true, skipped: true };
            skippedEntities.push(ENTITY_NAMES.USERS);
          } else {
            throw error;
          }
        }
      }

      // ── 2. Groups ─────────────────────────────────────────────────────────
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

      // ── 3. Group Members ──────────────────────────────────────────────────
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

      // ── 4. Directory Roles ────────────────────────────────────────────────
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

      // ── 5. Role Members ───────────────────────────────────────────────────
      // NOTE: Role members are skipped because directory_roles are custom objects,
      // and DevRev doesn't support object_member relationships with custom objects.
      if (!adapter.state.roleMembers.completed) {
        adapter.state.roleMembers.completed = true;
        console.log(`[data-extraction] Role members extraction skipped (custom objects not supported)`);
      }

      // ── 6. Applications ───────────────────────────────────────────────────
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

      // ── 7. Service Principals ─────────────────────────────────────────────
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

      // ── 8. Devices ────────────────────────────────────────────────────────
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

      // ── 9. Org Contacts ───────────────────────────────────────────────────
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

      // ── 10. App Roles ─────────────────────────────────────────────────────
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

      // ── 11. App Role Assignments ──────────────────────────────────────────
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
                const normalized = page.value.map((a) => normalizeAppRoleAssignment(a));
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

      // ── 12. Authentication Methods ────────────────────────────────────────
      if (!adapter.state.authenticationMethods.completed) {
        try {
          const userIds = adapter.state.users.ids;
          let currentIndex = adapter.state.authenticationMethods.currentParentIndex;

          while (currentIndex < userIds.length) {
            if (adapter.isTimeout) { await wait(ADAPTER_TIMEOUT_DELAY_MS); return; }

            const userId = userIds[currentIndex];
            try {
              const page = await client.listAuthenticationMethods(userId);
              const normalized = page.value.map((m) => normalizeAuthenticationMethod(m, userId));
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

      // ── 13. Authentication Methods Policy ─────────────────────────────────
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

      // ── 14. License Assignments ───────────────────────────────────────────
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

      // ── 15. PIM Eligible Roles ────────────────────────────────────────────
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

      // ── 16. Conditional Access Policies ───────────────────────────────────
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

      // ── 17. Lifecycle Workflows ───────────────────────────────────────────
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

      // ── 18. Directory Audit Logs ──────────────────────────────────────────
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

      // ── 19. Sign-In Logs ──────────────────────────────────────────────────
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

      // Log summary of skipped entities
      if (skippedEntities.length > 0) {
        console.log(`[data-extraction] Skipped ${skippedEntities.length} entities (not available for this tenant): ${skippedEntities.join(', ')}`);
      }

      // Persist successful sync timestamp
      adapter.state.lastSuccessfulSyncStarted = adapter.state.lastSyncStarted;
      adapter.state.lastSyncStarted = undefined;

      console.log(`[data-extraction] Extraction completed successfully`);
      await adapter.emit(ExtractorEventType.DataExtractionDone);
    } catch (error) {
      console.error('[data-extraction] Unrecoverable error:', formatError(error));
      await adapter.emit(ExtractorEventType.DataExtractionError, {
        error: { message: formatError(error) },
      });
    }
  },
});
