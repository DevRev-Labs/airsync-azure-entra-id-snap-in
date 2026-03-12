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
} from '../../external-system/data-normalization';
import { ADAPTER_TIMEOUT_DELAY_MS, ENTITY_NAMES, DEFAULT_RATE_LIMIT_DELAY_SECONDS } from '../../common/constants';
import {
  formatError,
  isAuthError,
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
      ]);

      const skippedEntities: string[] = [];

      // ── 1. Users ──────────────────────────────────────────────────────────
      if (!adapter.state.users.completed) {
        try {
          let nextLink = adapter.state.users.nextLink;
          let page;
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

            // Collect IDs for potential future use
            adapter.state.users.ids = [];
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
            console.warn(`[data-extraction] Permission denied for users (HTTP 403) — skipping`);
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
            console.warn(`[data-extraction] Permission denied for groups (HTTP 403) — skipping`);
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
            console.warn(`[data-extraction] Permission denied for group_members (HTTP 403) — skipping`);
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
            console.warn(`[data-extraction] Permission denied for directory_roles (HTTP 403) — skipping`);
            adapter.state.directoryRoles = { ...adapter.state.directoryRoles, completed: true, skipped: true };
            skippedEntities.push(ENTITY_NAMES.DIRECTORY_ROLES);
          } else {
            throw error;
          }
        }
      }

      // ── 5. Role Members ───────────────────────────────────────────────────
      if (!adapter.state.roleMembers.completed) {
        try {
          const roleIds = adapter.state.directoryRoles.ids;
          let currentIndex = adapter.state.roleMembers.currentParentIndex;

          while (currentIndex < roleIds.length) {
            if (adapter.isTimeout) { await wait(ADAPTER_TIMEOUT_DELAY_MS); return; }

            const roleId = roleIds[currentIndex];
            let innerNextLink = adapter.state.roleMembers.currentParentNextLink;

            do {
              if (adapter.isTimeout) { await wait(ADAPTER_TIMEOUT_DELAY_MS); return; }

              const page = await client.listRoleMembers(roleId, innerNextLink);

              if (adapter.isTimeout) { await wait(ADAPTER_TIMEOUT_DELAY_MS); return; }

              const normalized = page.value.map((m) => normalizeRoleMember(m, roleId));
              await adapter.getRepo(ENTITY_NAMES.ROLE_MEMBERS)?.push(normalized);

              adapter.state.roleMembers.extractedCount += normalized.length;
              innerNextLink = page['@odata.nextLink'];
              adapter.state.roleMembers.currentParentNextLink = innerNextLink;
            } while (innerNextLink);

            currentIndex++;
            adapter.state.roleMembers.currentParentIndex = currentIndex;
            adapter.state.roleMembers.currentParentNextLink = undefined;
          }

          adapter.state.roleMembers.completed = true;
          console.log(`[data-extraction] Role members extracted: ${adapter.state.roleMembers.extractedCount}`);
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
            console.warn(`[data-extraction] Permission denied for role_members (HTTP 403) — skipping`);
            adapter.state.roleMembers = { ...adapter.state.roleMembers, completed: true, skipped: true };
            skippedEntities.push(ENTITY_NAMES.ROLE_MEMBERS);
          } else {
            throw error;
          }
        }
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
            console.warn(`[data-extraction] Permission denied for applications (HTTP 403) — skipping`);
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
            console.warn(`[data-extraction] Permission denied for service_principals (HTTP 403) — skipping`);
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
            console.warn(`[data-extraction] Permission denied for devices (HTTP 403) — skipping`);
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
            console.warn(`[data-extraction] Permission denied for org_contacts (HTTP 403) — skipping`);
            adapter.state.orgContacts = { ...adapter.state.orgContacts, completed: true, skipped: true };
            skippedEntities.push(ENTITY_NAMES.ORG_CONTACTS);
          } else {
            throw error;
          }
        }
      }

      // Log summary of skipped entities
      if (skippedEntities.length > 0) {
        console.warn(`[data-extraction] Skipped entities due to missing permissions: ${skippedEntities.join(', ')}`);
      }

      // Persist successful sync timestamp
      adapter.state.lastSuccessfulSyncStarted = adapter.state.lastSyncStarted;
      adapter.state.lastSyncStarted = undefined;

      await adapter.emit(ExtractorEventType.DataExtractionDone);
    } catch (error) {
      console.error('[data-extraction] Unrecoverable error:', formatError(error));
      await adapter.emit(ExtractorEventType.DataExtractionError, {
        error: { message: formatError(error) },
      });
    }
  },
});
