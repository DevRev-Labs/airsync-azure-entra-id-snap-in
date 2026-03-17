/**
 * Metadata Extraction Worker for Azure Entra ID Connector
 *
 * This worker is responsible for discovering and extracting schema metadata from
 * Azure Entra ID, specifically focusing on dynamic extension attributes that can
 * be defined by organizations to extend the standard Azure AD user schema.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * PURPOSE & OVERVIEW
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Azure AD Extension Attributes allow organizations to add custom fields to users
 * (e.g., EmployeeID, CostCenter, BadgeNumber). These are not part of the standard
 * Azure AD schema and vary by organization.
 *
 * This worker:
 * 1. Discovers all registered extension properties in the tenant
 * 2. Identifies which ones apply to User objects
 * 3. Enriches the External Domain Metadata (EDM) with these custom fields
 * 4. Publishes the enriched EDM to DevRev
 *
 * This enables the data extraction worker to properly extract and map custom
 * user attributes to DevRev custom fields.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * EXTENSION PROPERTIES EXPLAINED
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Extension Properties are custom attributes registered via Azure AD applications.
 * They allow organizations to extend the directory schema without modifying the
 * base Azure AD schema.
 *
 * Structure:
 * - Name: Prefixed with "extension_{appId}_{propertyName}" (e.g., "extension_abc123_EmployeeID")
 * - Data Type: Boolean, Integer, LargeInteger, DateTime, String, Binary
 * - Target Objects: Which directory objects can have this property (User, Group, etc.)
 *
 * Common Use Cases:
 * - Employee metadata (hire date, employee ID, manager email)
 * - Department/cost center information
 * - Security clearance levels
 * - Custom business attributes
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WORKFLOW
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * 1. Authenticate with Azure AD and create Graph API client
 * 2. Load base External Domain Metadata (static schema definition)
 * 3. Query all applications in the tenant (first 100)
 * 4. For each application, list its registered extension properties
 * 5. Filter for properties that target "User" objects
 * 6. Map Azure AD data types to DevRev EDM data types
 * 7. Merge discovered properties into the users record type fields
 * 8. Publish enriched EDM to DevRev
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * ERROR HANDLING STRATEGY
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Extension discovery is non-fatal:
 * - If discovery fails for one app: Log warning, continue with others
 * - If entire discovery fails: Log warning, use base EDM without extensions
 * - If metadata extraction fails completely: Emit error event
 *
 * This ensures the connector can still function even without custom attributes.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * PERFORMANCE NOTES
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * - Only queries first 100 applications (sufficient for most tenants)
 * - Typically completes in seconds (much faster than data extraction)
 * - Runs once at the start of each sync (before data extraction)
 * - Results are cached by DevRev for the duration of the sync
 */

// Import DevRev Airdrop framework types and functions
import { ExtractorEventType, processTask, WorkerAdapter } from '@devrev/ts-adaas';

// Import common utilities and security functions
import { validateConnectionData } from '../../common/security';
import { State } from '../../common/state';
import { formatError } from '../../common/utils';
import { acquireAccessToken, EntraIDClient } from '../../external-system/entra_id_api';
import baseEdm from '../../external-system/external_domain_metadata.json';

// ══════════════════════════════════════════════════════════════════════════════
// PROCESSTASK: DevRev Airdrop Framework Entry Point
// ══════════════════════════════════════════════════════════════════════════════
// This is the main entry point invoked by the DevRev Airdrop framework
// Defines two callbacks: onTimeout (if worker exceeds time limit) and task (main logic)
processTask({
  // ────────────────────────────────────────────────────────────────────────────
  // TIMEOUT HANDLER
  // ────────────────────────────────────────────────────────────────────────────
  // If metadata extraction takes too long (unlikely), emit completion event
  // This ensures the sync can proceed even if extension discovery is incomplete
  onTimeout: async ({ adapter }: { adapter: WorkerAdapter<State> }) => {
    // Emit done event to allow data extraction to begin
    await adapter.emit(ExtractorEventType.MetadataExtractionDone);
  },

  // ────────────────────────────────────────────────────────────────────────────
  // MAIN TASK HANDLER
  // ────────────────────────────────────────────────────────────────────────────
  // Executes the metadata extraction and EDM enrichment workflow
  task: async ({ adapter }: { adapter: WorkerAdapter<State> }) => {
    try {
      // ── Step 1: Extract and Validate Connection Credentials ────────────────
      // Get Azure AD connection details from DevRev event payload
      // Security validation prevents injection attacks and malformed credentials
      const { tenantId, clientId, clientSecret } = validateConnectionData(adapter.event.payload.connection_data);

      // ── Step 2: Authenticate with Azure AD ─────────────────────────────────
      // Acquire OAuth 2.0 access token using client credentials flow
      // Token is valid for 1 hour and grants access to Microsoft Graph API
      const accessToken = await acquireAccessToken(tenantId, clientId, clientSecret);

      // ── Step 3: Create Microsoft Graph API Client ──────────────────────────
      // Initialize client with access token for making Graph API calls
      const client = new EntraIDClient(accessToken);

      // ── Step 4: Load Base External Domain Metadata ──────────────────────────
      // Clone the static EDM schema to avoid mutating the original
      // This base EDM includes all standard Azure AD fields for users, groups, etc.
      // Clone base EDM for enrichment with discovered extension properties
      // 'any' is required here because we dynamically add extension fields at runtime
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const enrichedEdm = structuredClone(baseEdm) as any;

      // ── Step 5: Discover Extension Properties ───────────────────────────────
      // Try to discover custom extension attributes and enrich the EDM
      // This entire block is non-fatal: if discovery fails, use static metadata
      try {
        // Query first 100 applications in the tenant
        // Extension properties are registered per application
        const apps = await client.listApplicationsForExtensionDiscovery();

        // Initialize map to store discovered user extension fields
        // Key: extension field name, Value: field metadata (name, type)
        const userExtensionFields: Record<string, unknown> = {};

        // ── Iterate Through Each Application ──────────────────────────────────
        for (const app of apps) {
          try {
            // Query this application's registered extension properties
            const extensions = await client.listExtensionProperties(app.id);

            // ── Process Each Extension Property ─────────────────────────────────
            for (const ext of extensions) {
              // Check if this extension applies to User objects and has a name
              // targetObjects is an array like ["User"] or ["User", "Group"]
              if (ext.targetObjects.includes('User') && ext.name) {
                // Use the full extension name as field key (e.g., "extension_abc123_EmployeeID")
                const fieldKey = ext.name;

                // Map Azure AD data type to DevRev EDM data type
                // Boolean → bool, Integer → int, DateTime → timestamp, etc.
                const edmType = mapExtensionDataType(ext.dataType);

                // Add field to userExtensionFields map with name and type
                userExtensionFields[fieldKey] = {
                  name: ext.name, // Full extension property name
                  type: edmType,  // Mapped DevRev data type
                };
              }
            }
          } catch (extError) {
            // ── Per-Application Error (Non-Fatal) ─────────────────────────────
            // If we can't list extensions for one app, skip it and continue
            // This prevents one bad application from blocking all extension discovery
            console.warn(`[metadata-extraction] Could not load extensions for app ${app.id}: ${formatError(extError)}`);
          }
        }

        // ── Step 6: Merge Extension Fields into EDM ───────────────────────────
        // Check if any user extension fields were discovered
        if (Object.keys(userExtensionFields).length > 0) {
          // Merge discovered extension fields with existing user fields
          // Spread operator creates new object with both static and dynamic fields
          enrichedEdm.record_types.users.fields = {
            ...enrichedEdm.record_types.users.fields, // Standard fields (display_name, email, etc.)
            ...userExtensionFields,                    // Custom extension fields
          };

          // Log success message with count of discovered extension fields
          console.log(`[metadata-extraction] Added ${Object.keys(userExtensionFields).length} extension attribute field(s) to users EDM`);
        }
      } catch (discoverError) {
        // ── Global Discovery Error (Non-Fatal) ─────────────────────────────────
        // If entire extension discovery process fails, fall back to static metadata
        // This ensures connector can function even without custom attributes
        console.warn(`[metadata-extraction] Extension property discovery failed, using static metadata: ${formatError(discoverError)}`);
      }

      // ── Step 7: Publish Enriched EDM to DevRev ────────────────────────────
      // Initialize external_domain_metadata repository
      adapter.initializeRepos([{ itemType: 'external_domain_metadata' }]);

      // Push the enriched EDM (static + dynamic extension fields) to DevRev
      // This EDM will be used by data extraction worker to properly extract all fields
      await adapter.getRepo('external_domain_metadata')?.push([enrichedEdm]);

      // ── Step 8: Emit Completion Event ──────────────────────────────────────
      // Signal to Airdrop framework that metadata extraction is complete
      // This triggers the data extraction worker to begin
      await adapter.emit(ExtractorEventType.MetadataExtractionDone);
    } catch (error) {
      // ── Fatal Error Handler ─────────────────────────────────────────────────
      // If authentication or EDM publishing fails, emit error event
      // This prevents data extraction from starting with invalid/missing metadata
      console.error('[metadata-extraction] Failed:', formatError(error));

      // Emit error event with formatted error message
      await adapter.emit(ExtractorEventType.MetadataExtractionError, {
        error: { message: formatError(error) }, // DevRev-compatible error structure
      });
    }
  },
});

// ══════════════════════════════════════════════════════════════════════════════
// DATA TYPE MAPPING UTILITY
// ══════════════════════════════════════════════════════════════════════════════
/**
 * Map Azure AD Extension Property Data Types to DevRev EDM Data Types
 *
 * Azure AD supports the following extension property data types:
 * - Boolean: True/false values
 * - Integer: 32-bit signed integers
 * - LargeInteger: 64-bit signed integers (for large values like timestamps)
 * - DateTime: ISO 8601 date-time strings
 * - String: Unicode text values (default for most custom fields)
 * - Binary: Base64-encoded binary data (rarely used)
 *
 * DevRev EDM supports these data types:
 * - bool: Boolean values
 * - int: Integer values (supports both 32-bit and 64-bit)
 * - timestamp: Date-time values
 * - text: String values (default for unmapped types)
 *
 * @param dataType - Azure AD extension property data type string
 * @returns DevRev EDM-compatible data type string
 *
 * @example
 * mapExtensionDataType('Boolean')     // Returns: 'bool'
 * mapExtensionDataType('Integer')     // Returns: 'int'
 * mapExtensionDataType('DateTime')    // Returns: 'timestamp'
 * mapExtensionDataType('String')      // Returns: 'text' (default)
 */
function mapExtensionDataType(dataType: string): string {
  // Switch on Azure AD data type and return corresponding DevRev type
  switch (dataType) {
    // Boolean values → bool type
    case 'Boolean': return 'bool';

    // 32-bit integers → int type
    case 'Integer': return 'int';

    // 64-bit integers → int type (DevRev int handles both)
    case 'LargeInteger': return 'int';

    // DateTime values → timestamp type
    case 'DateTime': return 'timestamp';

    // Default: map all other types (String, Binary, Unknown) to text
    // This is a safe fallback since text can represent any value as a string
    default: return 'text'; // String, Binary, etc.
  }
}
