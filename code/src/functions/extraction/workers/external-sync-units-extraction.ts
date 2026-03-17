import { ExtractorEventType, processTask, WorkerAdapter } from '@devrev/ts-adaas';

import { State } from '../../common/state';
import { formatError } from '../../common/utils';
import { acquireAccessToken, EntraIDClient } from '../../external-system/entra_id_api';

processTask({
  onTimeout: async ({ adapter }: { adapter: WorkerAdapter<State> }) => {
    await adapter.emit(ExtractorEventType.ExternalSyncUnitExtractionError, {
      error: { message: 'Timeout during sync unit discovery' },
    });
  },
  task: async ({ adapter }: { adapter: WorkerAdapter<State> }) => {
    try {
      const { org_id: tenantId, key } = adapter.event.payload.connection_data;
      const [clientId, clientSecret] = key.split('|');
      const accessToken = await acquireAccessToken(tenantId, clientId, clientSecret);
      const client = new EntraIDClient(accessToken);

      const org = await client.getOrganization();

      await adapter.emit(ExtractorEventType.ExternalSyncUnitExtractionDone, {
        external_sync_units: [
          {
            id: org.id,
            name: org.displayName || org.id,
            description: `Azure Entra ID tenant: ${org.displayName || org.id}`,
          },
        ],
      });
    } catch (error) {
      console.error('[external-sync-units-extraction] Failed:', formatError(error));
      await adapter.emit(ExtractorEventType.ExternalSyncUnitExtractionError, {
        error: { message: formatError(error) },
      });
    }
  },
});
