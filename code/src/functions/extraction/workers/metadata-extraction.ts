import { ExtractorEventType, processTask, WorkerAdapter } from '@devrev/ts-adaas';
import { State } from '../../common/state';
import { acquireAccessToken, EntraIDClient } from '../../external-system/entra_id_api';
import { formatError } from '../../common/utils';
import baseEdm from '../../external-system/external_domain_metadata.json';

processTask({
  onTimeout: async ({ adapter }: { adapter: WorkerAdapter<State> }) => {
    await adapter.emit(ExtractorEventType.MetadataExtractionDone);
  },
  task: async ({ adapter }: { adapter: WorkerAdapter<State> }) => {
    try {
      const { org_id: tenantId, key } = adapter.event.payload.connection_data;
      const [clientId, clientSecret] = key.split('|');
      const accessToken = await acquireAccessToken(tenantId, clientId, clientSecret);
      const client = new EntraIDClient(accessToken);

      // Discover extension properties and enrich the EDM dynamically
      const enrichedEdm = structuredClone(baseEdm) as any;

      try {
        const apps = await client.listApplicationsForExtensionDiscovery();
        const userExtensionFields: Record<string, unknown> = {};

        for (const app of apps) {
          try {
            const extensions = await client.listExtensionProperties(app.id);
            for (const ext of extensions) {
              if (ext.targetObjects.includes('User') && ext.name) {
                const fieldKey = ext.name;
                const edmType = mapExtensionDataType(ext.dataType);
                userExtensionFields[fieldKey] = {
                  name: ext.name,
                  type: edmType,
                };
              }
            }
          } catch (extError) {
            // Non-fatal: skip this app's extension properties
            console.warn(`[metadata-extraction] Could not load extensions for app ${app.id}: ${formatError(extError)}`);
          }
        }

        // Merge discovered extension fields into the users record type
        if (Object.keys(userExtensionFields).length > 0) {
          enrichedEdm.record_types.users.fields = {
            ...enrichedEdm.record_types.users.fields,
            ...userExtensionFields,
          };
          console.log(`[metadata-extraction] Added ${Object.keys(userExtensionFields).length} extension attribute field(s) to users EDM`);
        }
      } catch (discoverError) {
        // Non-fatal: fall back to static metadata
        console.warn(`[metadata-extraction] Extension property discovery failed, using static metadata: ${formatError(discoverError)}`);
      }

      adapter.initializeRepos([{ itemType: 'external_domain_metadata' }]);
      await adapter.getRepo('external_domain_metadata')?.push([enrichedEdm]);
      await adapter.emit(ExtractorEventType.MetadataExtractionDone);
    } catch (error) {
      console.error('[metadata-extraction] Failed:', formatError(error));
      await adapter.emit(ExtractorEventType.MetadataExtractionError, {
        error: { message: formatError(error) },
      });
    }
  },
});

function mapExtensionDataType(dataType: string): string {
  switch (dataType) {
    case 'Boolean': return 'bool';
    case 'Integer': return 'int';
    case 'LargeInteger': return 'int';
    case 'DateTime': return 'timestamp';
    default: return 'text'; // String, Binary, etc.
  }
}
