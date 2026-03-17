/**
 * Utility Functions for Azure Entra ID Connector
 *
 * This module provides common utility functions for error handling,
 * delay/retry logic, and HTTP response parsing.
 */

// Import axios library for HTTP error detection
import axios from 'axios';

/**
 * Asynchronous delay utility using Promise-based setTimeout
 *
 * This function creates a promise that resolves after the specified duration.
 * Useful for implementing retry delays, rate limiting, and exponential backoff.
 *
 * @param ms - Number of milliseconds to wait before resolving
 * @returns A Promise that resolves after the specified delay
 *
 * @example
 * // Wait for 1 second before continuing
 * await wait(1000);
 *
 * @example
 * // Implement retry with delay
 * for (let attempt = 1; attempt <= 3; attempt++) {
 *   try {
 *     await apiCall();
 *     break;
 *   } catch (error) {
 *     if (attempt < 3) await wait(attempt * 1000);
 *   }
 * }
 */
export const wait = (ms: number): Promise<void> => {
  // Create and return a new Promise
  return new Promise((resolve) => {
    // Use setTimeout to delay resolution
    setTimeout(resolve, ms);
  });
};

/**
 * Format an error object into a human-readable string message
 *
 * This function handles various error types and extracts meaningful
 * information for logging and debugging purposes.
 *
 * @param error - Unknown error object to format (can be Error, AxiosError, string, etc.)
 * @returns Formatted error message string
 *
 * @example
 * try {
 *   await apiCall();
 * } catch (error) {
 *   console.error(formatError(error));
 *   // Output: "HTTP 401: Unauthorized"
 * }
 */
export function formatError(error: unknown): string {
  // Check if error is an Axios HTTP error
  if (axios.isAxiosError(error)) {
    // Extract HTTP status code from response (or 'unknown' if not available)
    const status = error.response?.status ?? 'unknown';

    // Extract status text from response (or use error message as fallback)
    // Prefer statusText, but if empty, use error message
    const statusText = error.response?.statusText || error.message;

    // Return formatted string with status code and message
    return `HTTP ${status}: ${statusText}`;
  }

  // Check if error is a standard Error object
  if (error instanceof Error) {
    // Return the error message property
    return error.message;
  }

  // For all other types, convert to string
  return String(error);
}

/**
 * Check if an error is caused by API rate limiting
 *
 * Microsoft Graph API returns HTTP 429 when rate limits are exceeded.
 * This function identifies such errors so retry logic can be applied.
 *
 * @param error - Unknown error object to check
 * @returns true if error is a rate limit error (HTTP 429), false otherwise
 *
 * @example
 * try {
 *   await graphAPI.listUsers();
 * } catch (error) {
 *   if (isRateLimitError(error)) {
 *     const delay = getRetryAfterSeconds(error, 60);
 *     await wait(delay * 1000);
 *     // Retry request...
 *   }
 * }
 */
export function isRateLimitError(error: unknown): boolean {
  // Check if error is from Axios HTTP request
  if (!axios.isAxiosError(error)) {
    return false;
  }

  // Check if HTTP status code is 429 (Too Many Requests)
  return error.response?.status === 429;
}

/**
 * Check if an error is caused by authentication failure
 *
 * HTTP 401 errors indicate invalid or expired credentials.
 * These errors are non-retryable and require user intervention.
 *
 * @param error - Unknown error object to check
 * @returns true if error is an authentication error (HTTP 401), false otherwise
 *
 * @example
 * try {
 *   const token = await acquireAccessToken();
 * } catch (error) {
 *   if (isAuthError(error)) {
 *     throw new Error('Invalid credentials. Please check your Client ID and Secret.');
 *   }
 * }
 */
export function isAuthError(error: unknown): boolean {
  // Check if error is from Axios HTTP request
  if (!axios.isAxiosError(error)) {
    return false;
  }

  // Check if HTTP status code is 401 (Unauthorized)
  return error.response?.status === 401;
}

/**
 * Check if an error is caused by insufficient permissions
 *
 * HTTP 403 errors indicate the authenticated user/app lacks required permissions.
 * These errors are non-retryable and require permission grants in Azure AD.
 *
 * @param error - Unknown error object to check
 * @returns true if error is an authorization error (HTTP 403), false otherwise
 *
 * @example
 * try {
 *   await graphAPI.listDirectoryRoles();
 * } catch (error) {
 *   if (isForbiddenError(error)) {
 *     console.warn('Missing RoleManagement.Read.Directory permission - skipping...');
 *     return;
 *   }
 * }
 */
export function isForbiddenError(error: unknown): boolean {
  // Check if error is from Axios HTTP request
  if (!axios.isAxiosError(error)) {
    return false;
  }

  // Check if HTTP status code is 403 (Forbidden)
  return error.response?.status === 403;
}

/**
 * Check if an error is caused by invalid request parameters
 *
 * HTTP 400 errors indicate malformed requests or invalid parameters.
 * These errors are non-retryable and indicate a bug in our request logic.
 *
 * @param error - Unknown error object to check
 * @returns true if error is a bad request error (HTTP 400), false otherwise
 *
 * @example
 * try {
 *   await graphAPI.getUser('invalid-user-id');
 * } catch (error) {
 *   if (isBadRequestError(error)) {
 *     console.error('Invalid user ID format');
 *   }
 * }
 */
export function isBadRequestError(error: unknown): boolean {
  // Check if error is from Axios HTTP request
  if (!axios.isAxiosError(error)) {
    return false;
  }

  // Check if HTTP status code is 400 (Bad Request)
  return error.response?.status === 400;
}

/**
 * Check if an error indicates an expired delta token
 *
 * Microsoft Graph delta tokens expire after 7 days or when major directory changes occur.
 * When a delta token expires, we must fall back to a full sync.
 *
 * Two indicators of expired tokens:
 * - HTTP 410 (Gone) status code
 * - Error code "syncStateNotFound" in response body
 *
 * @param error - Unknown error object to check
 * @returns true if error indicates expired delta token, false otherwise
 *
 * @example
 * try {
 *   const users = await graphAPI.getUsersDelta(storedDeltaLink);
 * } catch (error) {
 *   if (isDeltaExpiredError(error)) {
 *     console.log('Delta token expired - falling back to full sync');
 *     const users = await graphAPI.listUsersPage();
 *   }
 * }
 */
export function isDeltaExpiredError(error: unknown): boolean {
  // Only process Axios HTTP errors
  if (!axios.isAxiosError(error)) {
    return false;
  }

  // Check for HTTP 410 Gone status (token expired)
  if (error.response?.status === 410) {
    return true;
  }

  // Extract error code from response body (if present)
  const errorCode = error.response?.data?.error?.code as string | undefined;

  // Check for Microsoft Graph specific error code
  if (errorCode === 'syncStateNotFound') {
    return true;
  }

  // Token is not expired
  return false;
}

/**
 * Extract retry delay from error response headers
 *
 * When rate limited (HTTP 429), Microsoft Graph API returns a "Retry-After"
 * header indicating how long to wait before retrying. This function parses
 * that header value or returns a default delay.
 *
 * @param error - Unknown error object containing response headers
 * @param defaultSeconds - Default delay in seconds if header is missing or invalid
 * @returns Number of seconds to wait before retrying
 *
 * @example
 * try {
 *   await graphAPI.listUsers();
 * } catch (error) {
 *   if (isRateLimitError(error)) {
 *     const retryAfter = getRetryAfterSeconds(error, 60);
 *     console.log(`Rate limited. Retrying after ${retryAfter} seconds`);
 *     await wait(retryAfter * 1000);
 *   }
 * }
 */
export function getRetryAfterSeconds(error: unknown, defaultSeconds: number): number {
  // Only process Axios HTTP errors
  if (!axios.isAxiosError(error)) {
    // Return default if not an HTTP error
    return defaultSeconds;
  }

  // Extract "Retry-After" header from response (case-insensitive)
  const retryAfter = error.response?.headers?.['retry-after'] as string | undefined;

  // Check if header exists
  if (retryAfter) {
    // Parse header value as integer
    const parsed = parseInt(retryAfter, 10);

    // Validate parsed value is a valid number
    if (!isNaN(parsed) && parsed > 0) {
      // Return parsed delay in seconds
      return parsed;
    }
  }

  // Return default delay if header is missing or invalid
  return defaultSeconds;
}

/**
 * Check if an error is retryable
 *
 * Determines whether an error represents a temporary failure that should
 * be retried (e.g., network issues, server errors) or a permanent failure
 * that should not be retried (e.g., authentication errors, bad requests).
 *
 * @param error - Unknown error object to check
 * @returns true if error should be retried, false otherwise
 *
 * @example
 * for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
 *   try {
 *     return await makeAPICall();
 *   } catch (error) {
 *     if (!isRetryableError(error) || attempt === MAX_RETRIES) {
 *       throw error;
 *     }
 *     await wait(attempt * 1000);
 *   }
 * }
 */
export function isRetryableError(error: unknown): boolean {
  // Only process Axios HTTP errors
  if (!axios.isAxiosError(error)) {
    // Retry non-HTTP errors (e.g., network timeouts)
    return true;
  }

  // Extract HTTP status code
  const status = error.response?.status;

  // Non-retryable client errors (4xx except 429)
  if (status && status >= 400 && status < 500 && status !== 429) {
    // Don't retry authentication, authorization, or validation errors
    return false;
  }

  // Retryable errors: rate limits (429), server errors (5xx), network issues
  return true;
}

/**
 * Sanitize string input to prevent injection attacks
 *
 * Removes or escapes potentially dangerous characters from user input
 * before using in API requests or log messages.
 *
 * Protection Against:
 * - Log injection attacks (newlines, carriage returns)
 * - Terminal escape sequence injection
 * - Null byte injection
 * - Control character attacks
 *
 * @param input - String to sanitize
 * @returns Sanitized string safe for use in requests
 *
 * @example
 * const userInput = getUserInput();
 * const safeInput = sanitizeInput(userInput);
 * await graphAPI.searchUsers(safeInput);
 */
export function sanitizeInput(input: string): string {
  // Return empty string if input is null or undefined
  if (!input) {
    return '';
  }

  // Remove control characters and trim whitespace
  return input
    .replace(/[\x00-\x1F\x7F]/g, '') // Remove control characters (ASCII 0x00-0x1F, 0x7F)
    .trim(); // Remove leading/trailing whitespace
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
 * validateAzureGuid(''); // false
 */
export function validateAzureGuid(guid: string): boolean {
  // Check if input exists
  if (!guid) {
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
    const validHosts = [
      'graph.microsoft.com', // Primary Microsoft Graph API
      'graph.windows.net', // Legacy Azure AD Graph API (still supported)
    ];

    // Return true if hostname matches any valid host
    return validHosts.includes(parsedUrl.hostname.toLowerCase());
  } catch {
    // URL constructor throws on invalid URLs
    return false;
  }
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
 * Sanitize log message to prevent log injection
 *
 * Similar to sanitizeInput but specifically designed for log messages.
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

  // Remove dangerous characters for logging
  // Order matters: replace newlines/ANSI first, then remove control chars
  return message
    .replace(/\u001b\[[0-9;]*m/g, '') // Remove ANSI escape codes first
    .replace(/\n/g, ' ') // Replace newlines with spaces
    .replace(/\r/g, ' ') // Replace carriage returns with spaces
    .replace(/[\x00-\x1F\x7F]/g, '') // Remove remaining control characters
    .trim(); // Remove leading/trailing whitespace
}

/**
 * Validate maximum string length
 *
 * Prevents buffer overflow and resource exhaustion attacks by
 * enforcing maximum string length limits.
 *
 * @param input - String to validate
 * @param maxLength - Maximum allowed length
 * @returns true if string is within limit, false otherwise
 *
 * @example
 * validateMaxLength(userInput, 1000) // true if <= 1000 chars
 */
export function validateMaxLength(input: string, maxLength: number): boolean {
  // Check if input exists
  if (!input) {
    return true; // Empty strings are valid
  }

  // Check length against maximum
  return input.length <= maxLength;
}

/**
 * Validate email address format
 *
 * Basic email validation to ensure format is correct.
 * Note: This is NOT RFC 5322 compliant but catches common errors.
 *
 * @param email - Email address to validate
 * @returns true if email appears valid, false otherwise
 *
 * @example
 * validateEmail('user@contoso.com') // true
 * validateEmail('invalid-email') // false
 */
export function validateEmail(email: string): boolean {
  // Check if input exists
  if (!email) {
    return false;
  }

  // Basic email pattern: localpart@domain.tld
  // This is intentionally simple to avoid false negatives
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  // Test string against pattern
  return emailPattern.test(email);
}
