import {
  AirSyncDefaultItemTypes,
  ExtractionAdapter,
  processExtractionTask,
} from '@devrev/airsync-sdk';

import {
  DEFAULT_RATE_LIMIT_DELAY_SECONDS,
  EXTERNAL_SYNC_UNITS_BATCH_SIZE,
} from '../../common/constants';
import { State } from '../../common/state';
import { formatError, getRetryAfterSeconds, isRateLimitError } from '../../common/utils';
import { acquireAccessToken, EntraIDClient } from '../../external-system/entra-id-api';

processExtractionTask({
  // Non-resumable phase: SDK maps timeout to an error (no Progress event exists).
  task: async ({ adapter }: { adapter: ExtractionAdapter<State> }) => {
    try {
      const { org_id: tenantId, key } = adapter.event.payload.connection_data;
      const [clientId, clientSecret] = key.split('|');
      const accessToken = await acquireAccessToken(tenantId, clientId, clientSecret);
      const client = new EntraIDClient(accessToken);

      const org = await client.getOrganization();

      adapter.initializeRepos([
        {
          itemType: AirSyncDefaultItemTypes.EXTERNAL_SYNC_UNITS,
          overriddenOptions: {
            batchSize: EXTERNAL_SYNC_UNITS_BATCH_SIZE,
          },
        },
      ]);

      await adapter.getRepo(AirSyncDefaultItemTypes.EXTERNAL_SYNC_UNITS)?.push([
        {
          id: org.id,
          name: org.displayName || org.id,
          description: `Azure Entra ID tenant: ${org.displayName || org.id}`,
        },
      ]);

      return { status: 'success' };
    } catch (error) {
      // This phase is non-resumable, so the SDK reports a delay as an error;
      // returning it still carries Retry-After instead of a generic failure.
      if (isRateLimitError(error)) {
        return {
          status: 'delay',
          delaySeconds: getRetryAfterSeconds(error, DEFAULT_RATE_LIMIT_DELAY_SECONDS),
        };
      }
      console.error('[external-sync-units-extraction] Failed:', formatError(error));
      return {
        status: 'error',
        error: { message: formatError(error) },
      };
    }
  },
});
