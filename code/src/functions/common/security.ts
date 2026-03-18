/**
 * Security Module - Centralized Security Functions
 *
 * This module provides security-focused validation and sanitization functions
 * to protect against common vulnerabilities and attacks.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * PURPOSE
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Centralizes all security-related functions to:
 * - Prevent injection attacks (log injection, command injection)
 * - Validate input formats (GUIDs, URLs, tenant IDs)
 * - Enforce maximum length limits (prevent buffer overflow, DoS)
 * - Sanitize strings for safe use in logs and requests
 * - Protect against SSRF (Server-Side Request Forgery)
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * USAGE GUIDELINES
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * 1. Validate ALL external input before use
 * 2. Sanitize ALL strings before logging
 * 3. Validate URLs before making HTTP requests
 * 4. Enforce maximum length limits on all inputs
 * 5. Use type-safe functions (TypeScript strict mode)
 *
 * ══════════════════════════════════════════════════════════════════════════════
 */

// Import security-related constants
import {
  MAX_CLIENT_SECRET_LENGTH,
  MAX_TENANT_ID_LENGTH,
  MAX_CLIENT_ID_LENGTH,
  MAX_LOG_MESSAGE_LENGTH,
  MAX_ENTITY_ID_LENGTH,
  ALLOWED_GRAPH_HOSTS,
} from './constants';

/**
 * Validate Connection Data from DevRev Event
 *
 * Validates and sanitizes connection credentials received from DevRev.
 * This is the first line of defense against malicious or malformed input.
 *
 * Validation Rules:
 * - Tenant ID must be valid GUID or domain format
 * - Key must contain exactly one pipe separator
 * - Client ID must be valid GUID format
 * - Client Secret must be non-empty and within length limits
 *
 * @param connectionData - Connection data object from DevRev event payload
 * @returns Validated and parsed credentials
 * @throws Error if validation fails
 *
 * @example
 * const credentials = validateConnectionData(adapter.event.payload.connection_data);
 * const { tenantId, clientId, clientSecret } = credentials;
 */
export function validateConnectionData(connectionData: {
  org_id: string;
  key: string;
}): { tenantId: string; clientId: string; clientSecret: string } {
  // Extract tenant ID from connection data
  const tenantId = connectionData.org_id;

  // Validate tenant ID exists
  if (!tenantId) {
    throw new Error('Security: Tenant ID is missing from connection data');
  }

  // Validate tenant ID length
  if (tenantId.length > MAX_TENANT_ID_LENGTH) {
    throw new Error(
      `Security: Tenant ID exceeds maximum length (${MAX_TENANT_ID_LENGTH} characters)`
    );
  }

  // Validate tenant ID format (GUID or domain)
  if (!validateTenantId(tenantId)) {
    throw new Error('Security: Invalid tenant ID format. Expected GUID or domain name.');
  }

  // Extract key from connection data
  const key = connectionData.key;

  // Validate key exists
  if (!key) {
    throw new Error('Security: Key is missing from connection data');
  }

  // Parse key into client ID and client secret
  // Expected format: "clientId|clientSecret"
  const keyParts = key.split('|');

  // Validate key has exactly 2 parts
  if (keyParts.length !== 2) {
    throw new Error('Security: Invalid key format. Expected "clientId|clientSecret"');
  }

  // Extract client ID and client secret
  const [clientId, clientSecret] = keyParts;

  // Validate client ID exists
  if (!clientId) {
    throw new Error('Security: Client ID is missing from key');
  }

  // Validate client ID length
  if (clientId.length > MAX_CLIENT_ID_LENGTH) {
    throw new Error(`Security: Client ID exceeds maximum length (${MAX_CLIENT_ID_LENGTH} characters)`);
  }

  // Validate client ID format (must be GUID)
  if (!validateAzureGuid(clientId)) {
    throw new Error('Security: Invalid client ID format. Expected GUID.');
  }

  // Validate client secret exists
  if (!clientSecret) {
    throw new Error('Security: Client secret is missing from key');
  }

  // Validate client secret length
  if (clientSecret.length > MAX_CLIENT_SECRET_LENGTH) {
    throw new Error(
      `Security: Client secret exceeds maximum length (${MAX_CLIENT_SECRET_LENGTH} characters)`
    );
  }

  // Return validated credentials
  return { tenantId, clientId, clientSecret };
}

/**
 * Validate Azure AD GUID format
 *
 * Azure AD uses GUIDs (Globally Unique Identifiers) for all entity IDs.
 * This function validates that a string matches the expected GUID format
 * to prevent injection attacks or malformed API requests.
 *
 * GUID Format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
 * - 8 hex digits, hyphen, 4 hex digits, hyphen, 4 hex digits, hyphen, 4 hex digits, hyphen, 12 hex digits
 * - Case-insensitive (accepts both uppercase and lowercase)
 *
 * @param guid - String to validate as GUID
 * @returns true if string is valid GUID format, false otherwise
 *
 * @example
 * validateAzureGuid('12345678-1234-1234-1234-123456789012') // true
 * validateAzureGuid('invalid-guid') // false
 * validateAzureGuid('') // false
 */
export function validateAzureGuid(guid: string): boolean {
  // Check if input exists
  if (!guid) {
    return false;
  }

  // Check maximum length
  if (guid.length > MAX_ENTITY_ID_LENGTH) {
    return false;
  }

  // Regex pattern for GUID validation
  // ^[0-9a-fA-F]{8} - 8 hex characters at start
  // -[0-9a-fA-F]{4} - hyphen followed by 4 hex characters (repeated 3 times)
  // -[0-9a-fA-F]{12}$ - hyphen followed by 12 hex characters at end
  const guidPattern = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

  // Test string against pattern
  return guidPattern.test(guid);
}

/**
 * Validate Azure AD Tenant ID format
 *
 * Tenant IDs can be in two formats:
 * 1. GUID format: 12345678-1234-1234-1234-123456789012
 * 2. Domain format: contoso.onmicrosoft.com or custom domain
 *
 * @param tenantId - Tenant ID to validate
 * @returns true if tenant ID is valid format, false otherwise
 *
 * @example
 * validateTenantId('12345678-1234-1234-1234-123456789012') // true
 * validateTenantId('contoso.onmicrosoft.com') // true
 * validateTenantId('contoso.com') // true
 * validateTenantId('invalid tenant!') // false
 */
export function validateTenantId(tenantId: string): boolean {
  // Check if input exists
  if (!tenantId) {
    return false;
  }

  // Check maximum length
  if (tenantId.length > MAX_TENANT_ID_LENGTH) {
    return false;
  }

  // Check if it's a GUID format
  if (validateAzureGuid(tenantId)) {
    return true;
  }

  // Check if it's a domain format
  // Domain pattern: alphanumeric characters, hyphens, dots
  // Must contain at least one dot (e.g., contoso.com)
  const domainPattern = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/;

  // Test string against pattern
  return domainPattern.test(tenantId);
}

/**
 * Validate URL is a Microsoft Graph API endpoint
 *
 * This function prevents Server-Side Request Forgery (SSRF) attacks by
 * ensuring that all URLs used in API requests point to legitimate
 * Microsoft Graph endpoints.
 *
 * Allowed domains:
 * - graph.microsoft.com (primary Microsoft Graph API)
 * - graph.windows.net (legacy Azure AD Graph API)
 *
 * @param url - URL to validate
 * @returns true if URL is a valid Microsoft Graph endpoint, false otherwise
 *
 * @example
 * validateGraphUrl('https://graph.microsoft.com/v1.0/users') // true
 * validateGraphUrl('https://evil.com/api') // false
 */
export function validateGraphUrl(url: string): boolean {
  // Check if input exists
  if (!url) {
    return false;
  }

  try {
    // Parse URL using built-in URL constructor
    // This throws if URL is malformed
    const parsedUrl = new URL(url);

    // Check protocol is HTTPS (security requirement)
    if (parsedUrl.protocol !== 'https:') {
      return false;
    }

    // Check hostname is a Microsoft Graph domain
    // Use array from constants for consistency
    const validHosts = ALLOWED_GRAPH_HOSTS;

    // Return true if hostname matches any valid host
    return validHosts.includes(parsedUrl.hostname.toLowerCase() as (typeof validHosts)[number]);
  } catch {
    // URL constructor throws on invalid URLs
    return false;
  }
}

/**
 * Sanitize log message to prevent log injection
 *
 * Removes characters that could be used to inject fake log entries or
 * manipulate log analysis tools.
 *
 * Removes:
 * - Newlines (\n, \r) - prevent multi-line log injection
 * - Control characters - prevent terminal escape sequences
 * - ANSI escape codes - prevent log tampering
 *
 * @param message - Log message to sanitize
 * @returns Sanitized message safe for logging
 *
 * @example
 * console.log(sanitizeLogMessage(userInput));
 */
export function sanitizeLogMessage(message: string): string {
  // Return empty string if input is null or undefined
  if (!message) {
    return '';
  }

  // Enforce maximum log message length (prevent log flooding)
  let sanitized = message;
  if (sanitized.length > MAX_LOG_MESSAGE_LENGTH) {
    // Truncate and add indicator
    sanitized = sanitized.substring(0, MAX_LOG_MESSAGE_LENGTH) + '... [truncated]';
  }

  // Remove dangerous characters for logging
  // Order matters: replace newlines/ANSI first, then remove control chars
  return sanitized
    .replace(/\u001b\[[0-9;]*m/g, '') // Remove ANSI escape codes first
    .replace(/\n/g, ' ') // Replace newlines with spaces
    .replace(/\r/g, ' ') // Replace carriage returns with spaces
    .replace(/[\x00-\x1F\x7F]/g, '') // Remove remaining control characters (ASCII 0x00-0x1F, 0x7F)
    .trim(); // Remove leading/trailing whitespace
}

/**
 * Sanitize string input for general use
 *
 * Removes control characters that could be used in injection attacks.
 * Use this for any user-influenced input before using in API requests.
 *
 * @param input - String to sanitize
 * @returns Sanitized string
 *
 * @example
 * const safe = sanitizeInput(untrustedInput);
 */
export function sanitizeInput(input: string): string {
  // Return empty string if input is null or undefined
  if (!input) {
    return '';
  }

  // Remove control characters and trim whitespace
  return input
    .replace(/[\x00-\x1F\x7F]/g, '') // Remove control characters
    .trim(); // Remove leading/trailing whitespace
}

/**
 * Validate entity ID before API request
 *
 * Ensures entity ID is a valid Azure AD GUID before using in API requests.
 * Prevents injection attacks and malformed requests.
 *
 * @param entityId - Entity ID to validate
 * @param entityType - Type of entity (for error messages)
 * @throws Error if entity ID is invalid
 *
 * @example
 * validateEntityId(userId, 'user');
 * validateEntityId(groupId, 'group');
 */
export function validateEntityId(entityId: string, entityType: string): void {
  // Check if entity ID exists
  if (!entityId) {
    throw new Error(`Security: ${entityType} ID is missing`);
  }

  // Check maximum length
  if (entityId.length > MAX_ENTITY_ID_LENGTH) {
    throw new Error(
      `Security: ${entityType} ID exceeds maximum length (${MAX_ENTITY_ID_LENGTH} characters)`
    );
  }

  // Validate GUID format
  if (!validateAzureGuid(entityId)) {
    throw new Error(`Security: Invalid ${entityType} ID format. Expected GUID.`);
  }
}

/**
 * Mask sensitive data in strings
 *
 * Replaces sensitive data (tokens, secrets, passwords) with asterisks
 * for safe logging and error messages.
 *
 * @param data - String potentially containing sensitive data
 * @param showFirst - Number of characters to show at start
 * @param showLast - Number of characters to show at end
 * @returns Masked string
 *
 * @example
 * maskSensitiveData('my-secret-token-12345', 3, 3)
 * // Returns: 'my-***-345'
 */
export function maskSensitiveData(data: string, showFirst = 0, showLast = 0): string {
  // Return empty if no data
  if (!data) {
    return '';
  }

  // If data is too short, mask entirely
  if (data.length < showFirst + showLast) {
    return '*'.repeat(data.length);
  }

  // Extract visible parts
  const first = data.substring(0, showFirst);
  const last = data.substring(data.length - showLast);
  const middleLength = data.length - showFirst - showLast;

  // Return masked string
  return `${first}${'*'.repeat(middleLength)}${last}`;
}

/**
 * Check if response contains expected structure
 *
 * Validates API response has expected properties to prevent
 * processing malformed or malicious responses.
 *
 * @param response - Response object to validate
 * @param requiredFields - Array of required field names
 * @returns true if all fields present, false otherwise
 *
 * @example
 * validateResponseStructure(response, ['value', '@odata.nextLink'])
 */
export function validateResponseStructure(
  response: Record<string, unknown>,
  requiredFields: string[]
): boolean {
  // Check if response exists
  if (!response || typeof response !== 'object') {
    return false;
  }

  // Check all required fields are present
  return requiredFields.every((field) => field in response);
}
