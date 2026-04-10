/**
 * Attachments extraction worker for the Azure Entra ID AirSync connector.
 *
 * This worker handles EXTRACTION_ATTACHMENTS_START and EXTRACTION_ATTACHMENTS_CONTINUE
 * events dispatched by the DevRev ADaaS platform.
 *
 * Azure Entra ID does not include binary file attachments, so this worker is a no-op
 * stub that immediately signals completion. It is required by the ADaaS framework
 * because every extractor must handle attachment events.
 *
 * If attachment support is added in the future (e.g., user profile photos or
 * policy documents), the implementation should go here.
 */

import { ExtractorEventType, processTask, WorkerAdapter } from '@devrev/ts-adaas';
// Import the State type to satisfy the generic WorkerAdapter type parameter
import { State } from '../../common/state';
import { LabsUsageTracker } from '../../common/labs_usage';

/**
 * Register the attachment extraction task with the ADaaS worker framework.
 *
 * `processTask` must be called at the module's top level — not inside a function —
 * because the ADaaS framework resolves and invokes the exported task at module load time.
 */
processTask({
  /**
   * onTimeout handler — called when the ADaaS platform signals that the worker
   * is approaching its execution time limit.
   *
   * For attachments, we emit `AttachmentExtractionProgress` (a no-op progress event)
   * to acknowledge the timeout without failing the extraction.
   *
   * @param adapter - The worker adapter providing event access and event emission
   */
  onTimeout: async ({ adapter }: { adapter: WorkerAdapter<State> }) => {
    // Emit a progress event to acknowledge the timeout gracefully
    await adapter.emit(ExtractorEventType.AttachmentExtractionProgress);
  },

  /**
   * task handler — the main business logic for attachment extraction.
   *
   * This connector does not have any binary attachments to extract from Azure Entra ID,
   * so we immediately emit the done event to signal successful (empty) completion.
   *
   * @param adapter - The worker adapter providing event access and event emission
   */
  task: async ({ adapter }: { adapter: WorkerAdapter<State> }) => {
    // No attachments to extract — immediately signal completion
    // TODO: Implement attachment extraction if Azure Entra ID adds attachment endpoints in the future
    await adapter.emit(ExtractorEventType.AttachmentExtractionDone);

    // Track usage event for marketplace telemetry (non-blocking)
    // This runs at the very end of the entire snap-in execution (after all extraction phases)
    // Wrapped in try-catch to ensure telemetry issues never impact the snap-in functionality
    try {
      console.info('[LabsUsageTracker] Initiating usage tracking for Azure Entra ID AirSync connector');

      const serviceToken = adapter.event.context?.secrets?.service_account_token as string | undefined;
      const tracker = LabsUsageTracker.fromServiceToken(
        serviceToken,
        'Azure Entra ID AirSync connector',
        '1.0'
      );

      if (tracker) {
        // Build usage statistics payload with entity counts and extraction metadata
        const state = adapter.state;
        const mode = (adapter.event.payload?.event_context?.mode || 'INITIAL').toUpperCase();

        console.info('[LabsUsageTracker] Extraction mode detected:', { mode });

        // Verify that the extraction completed successfully
        // Only send usage event if at least one entity extraction completed
        const hasCompletedEntities =
          state.users?.completed ||
          state.groups?.completed ||
          state.groupMembers?.completed ||
          state.directoryRoles?.completed ||
          state.roleMembers?.completed ||
          state.applications?.completed ||
          state.servicePrincipals?.completed ||
          state.devices?.completed ||
          state.orgContacts?.completed ||
          state.appRoles?.completed ||
          state.appRoleAssignments?.completed ||
          state.authenticationMethods?.completed ||
          state.authenticationMethodsPolicy?.completed ||
          state.licenseAssignments?.completed ||
          state.pimEligibleRoles?.completed ||
          state.conditionalAccessPolicies?.completed ||
          state.lifecycleWorkflows?.completed ||
          state.directoryAuditLogs?.completed ||
          state.signInLogs?.completed;

        if (!hasCompletedEntities) {
          console.info('[LabsUsageTracker] No entities completed extraction, skipping usage tracking', {
            reason: 'No completed entities found in state',
          });
          return;
        }

        console.info('[LabsUsageTracker] Extraction completed successfully, building usage payload');

        // Collect entity counts from state
        const usagePayload: Record<string, unknown> = {
          mode,
          usersCount: state.users?.extractedCount || 0,
          groupsCount: state.groups?.extractedCount || 0,
          groupMembersCount: state.groupMembers?.extractedCount || 0,
          directoryRolesCount: state.directoryRoles?.extractedCount || 0,
          roleMembersCount: state.roleMembers?.extractedCount || 0,
          applicationsCount: state.applications?.extractedCount || 0,
          servicePrincipalsCount: state.servicePrincipals?.extractedCount || 0,
          devicesCount: state.devices?.extractedCount || 0,
          orgContactsCount: state.orgContacts?.extractedCount || 0,
          appRolesCount: state.appRoles?.extractedCount || 0,
          appRoleAssignmentsCount: state.appRoleAssignments?.extractedCount || 0,
          authenticationMethodsCount: state.authenticationMethods?.extractedCount || 0,
          authenticationMethodsPolicyCount: state.authenticationMethodsPolicy?.extractedCount || 0,
          licenseAssignmentsCount: state.licenseAssignments?.extractedCount || 0,
          pimEligibleRolesCount: state.pimEligibleRoles?.extractedCount || 0,
          conditionalAccessPoliciesCount: state.conditionalAccessPolicies?.extractedCount || 0,
          lifecycleWorkflowsCount: state.lifecycleWorkflows?.extractedCount || 0,
          directoryAuditLogsCount: state.directoryAuditLogs?.extractedCount || 0,
          signInLogsCount: state.signInLogs?.extractedCount || 0,
        };

        // Identify skipped entities (completed with 0 count or marked as skipped)
        const skippedEntities: string[] = [];
        const entities = [
          'users', 'groups', 'groupMembers', 'directoryRoles', 'roleMembers',
          'applications', 'servicePrincipals', 'devices', 'orgContacts',
          'appRoles', 'appRoleAssignments', 'authenticationMethods',
          'authenticationMethodsPolicy', 'licenseAssignments', 'pimEligibleRoles',
          'conditionalAccessPolicies', 'lifecycleWorkflows', 'directoryAuditLogs', 'signInLogs'
        ];

        for (const entity of entities) {
          const entityState = (state as any)[entity];
          if (entityState?.skipped || (entityState?.completed && (entityState?.extractedCount || 0) === 0)) {
            skippedEntities.push(entity);
          }
        }

        if (skippedEntities.length > 0) {
          usagePayload.skippedEntities = skippedEntities;
          console.info('[LabsUsageTracker] Skipped entities identified:', {
            count: skippedEntities.length,
            entities: skippedEntities,
          });
        }

        // Calculate total extracted entities
        const totalExtracted = Object.keys(usagePayload)
          .filter(key => key.endsWith('Count'))
          .reduce((sum, key) => sum + (Number(usagePayload[key]) || 0), 0);

        console.info('[LabsUsageTracker] Usage statistics summary:', {
          mode,
          totalEntitiesExtracted: totalExtracted,
          skippedEntitiesCount: skippedEntities.length,
        });

        // Log the full usage payload in JSON format
        console.info('[LabsUsageTracker] Complete usage payload:', JSON.stringify(usagePayload, null, 2));

        await tracker.trackUsageEvent('airsync_operation_completed', {
          payload: usagePayload,
        });

        console.info('[LabsUsageTracker] Usage tracking completed successfully');
      }
    } catch (error) {
      // Log the error but don't throw - telemetry failures should never impact snap-in execution
      console.info('[LabsUsageTracker] Failed to track usage event (non-blocking)', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
  },
});
