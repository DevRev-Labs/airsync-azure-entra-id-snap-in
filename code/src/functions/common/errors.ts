/**
 * Custom Error Classes for Azure Entra ID Connector
 *
 * This module defines custom error types to provide better error handling
 * and more descriptive error messages throughout the application.
 */

/**
 * Base class for all custom errors in the application
 * Extends the native Error class with additional context
 */
export class ConnectorError extends Error {
  // HTTP status code if applicable (e.g., 401, 403, 500)
  public readonly statusCode?: number;

  // Original error that caused this error (for error chaining)
  public readonly cause?: Error;

  // Additional context data for debugging
  public readonly context?: Record<string, unknown>;

  /**
   * Constructor for ConnectorError
   * @param message - Human-readable error message
   * @param statusCode - Optional HTTP status code
   * @param cause - Optional original error
   * @param context - Optional context data for debugging
   */
  constructor(
    message: string,
    statusCode?: number,
    cause?: Error,
    context?: Record<string, unknown>
  ) {
    // Call parent Error constructor with message
    super(message);

    // Set the error name to the class name for better error identification
    this.name = this.constructor.name;

    // Store optional parameters
    this.statusCode = statusCode;
    this.cause = cause;
    this.context = context;

    // Maintains proper stack trace for where error was thrown (V8 only)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

/**
 * Authentication Error - thrown when authentication fails
 * HTTP 401 errors from Azure AD or Microsoft Graph API
 */
export class AuthenticationError extends ConnectorError {
  /**
   * Constructor for AuthenticationError
   * @param message - Error message explaining authentication failure
   * @param cause - Original error from authentication attempt
   * @param context - Additional context (e.g., tenant ID, client ID)
   */
  constructor(message: string, cause?: Error, context?: Record<string, unknown>) {
    // Always use 401 status code for authentication errors
    super(message, 401, cause, context);
  }
}

/**
 * Authorization Error - thrown when user lacks required permissions
 * HTTP 403 errors from Microsoft Graph API
 */
export class AuthorizationError extends ConnectorError {
  /**
   * Constructor for AuthorizationError
   * @param message - Error message explaining permission issue
   * @param cause - Original error from authorization check
   * @param context - Additional context (e.g., required permission, resource)
   */
  constructor(message: string, cause?: Error, context?: Record<string, unknown>) {
    // Always use 403 status code for authorization errors
    super(message, 403, cause, context);
  }
}

/**
 * Rate Limit Error - thrown when API rate limits are exceeded
 * HTTP 429 errors from Microsoft Graph API
 */
export class RateLimitError extends ConnectorError {
  // Number of seconds to wait before retrying
  public readonly retryAfter: number;

  /**
   * Constructor for RateLimitError
   * @param message - Error message about rate limit
   * @param retryAfter - Seconds to wait before retrying
   * @param cause - Original error from API
   * @param context - Additional context (e.g., endpoint, request count)
   */
  constructor(message: string, retryAfter: number, cause?: Error, context?: Record<string, unknown>) {
    // Always use 429 status code for rate limit errors
    super(message, 429, cause, context);

    // Store retry delay for exponential backoff logic
    this.retryAfter = retryAfter;
  }
}

/**
 * Bad Request Error - thrown when request parameters are invalid
 * HTTP 400 errors from Microsoft Graph API
 */
export class BadRequestError extends ConnectorError {
  /**
   * Constructor for BadRequestError
   * @param message - Error message explaining what's invalid
   * @param cause - Original error from API
   * @param context - Additional context (e.g., invalid parameters)
   */
  constructor(message: string, cause?: Error, context?: Record<string, unknown>) {
    // Always use 400 status code for bad request errors
    super(message, 400, cause, context);
  }
}

/**
 * Delta Token Expired Error - thrown when incremental sync token expires
 * HTTP 410 errors or syncStateNotFound from Microsoft Graph delta queries
 */
export class DeltaTokenExpiredError extends ConnectorError {
  /**
   * Constructor for DeltaTokenExpiredError
   * @param message - Error message about expired delta token
   * @param cause - Original error from delta query
   * @param context - Additional context (e.g., entity type, last sync time)
   */
  constructor(message: string, cause?: Error, context?: Record<string, unknown>) {
    // Use 410 status code for gone/expired resources
    super(message, 410, cause, context);
  }
}

/**
 * Network Error - thrown when network connectivity issues occur
 * Covers timeouts, DNS failures, connection refused, etc.
 */
export class NetworkError extends ConnectorError {
  /**
   * Constructor for NetworkError
   * @param message - Error message about network issue
   * @param cause - Original network error
   * @param context - Additional context (e.g., URL, timeout duration)
   */
  constructor(message: string, cause?: Error, context?: Record<string, unknown>) {
    // No specific status code for network errors
    super(message, undefined, cause, context);
  }
}

/**
 * External API Error - thrown when Microsoft Graph API returns server errors
 * HTTP 5xx errors from Microsoft Graph API
 */
export class ExternalAPIError extends ConnectorError {
  /**
   * Constructor for ExternalAPIError
   * @param message - Error message about API failure
   * @param statusCode - HTTP status code from API (500-599)
   * @param cause - Original error from API
   * @param context - Additional context (e.g., endpoint, response body)
   */
  constructor(message: string, statusCode: number, cause?: Error, context?: Record<string, unknown>) {
    // Use actual status code from API response
    super(message, statusCode, cause, context);
  }
}

/**
 * Validation Error - thrown when data validation fails
 * Used for input validation before making API calls
 */
export class ValidationError extends ConnectorError {
  /**
   * Constructor for ValidationError
   * @param message - Error message explaining validation failure
   * @param context - Additional context (e.g., field name, expected format)
   */
  constructor(message: string, context?: Record<string, unknown>) {
    // Use 422 (Unprocessable Entity) for validation errors
    super(message, 422, undefined, context);
  }
}

/**
 * Configuration Error - thrown when connector configuration is invalid
 * Used during initialization when required config is missing or invalid
 */
export class ConfigurationError extends ConnectorError {
  /**
   * Constructor for ConfigurationError
   * @param message - Error message explaining config issue
   * @param context - Additional context (e.g., missing field, invalid value)
   */
  constructor(message: string, context?: Record<string, unknown>) {
    // No specific status code for config errors
    super(message, undefined, undefined, context);
  }
}
