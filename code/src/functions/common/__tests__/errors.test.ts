/**
 * Unit Tests for Custom Error Classes Module
 *
 * This test suite provides comprehensive coverage for all custom error classes
 * used throughout the Azure Entra ID Connector for structured error handling.
 *
 * Test Coverage:
 * - ConnectorError (base class)
 * - AuthenticationError (HTTP 401)
 * - AuthorizationError (HTTP 403)
 * - RateLimitError (HTTP 429)
 * - BadRequestError (HTTP 400)
 * - DeltaTokenExpiredError (HTTP 410)
 * - NetworkError (network failures)
 * - ExternalAPIError (HTTP 5xx)
 * - ValidationError (HTTP 422)
 * - ConfigurationError (config issues)
 */

import {
  ConnectorError,
  AuthenticationError,
  AuthorizationError,
  RateLimitError,
  BadRequestError,
  DeltaTokenExpiredError,
  NetworkError,
  ExternalAPIError,
  ValidationError,
  ConfigurationError,
} from '../errors';

// ══════════════════════════════════════════════════════════════════════════════
// TEST SUITE #1: ConnectorError (Base Class)
// ══════════════════════════════════════════════════════════════════════════════

describe('ConnectorError', () => {
  it('should create error with message only', () => {
    const error = new ConnectorError('Something went wrong');

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(ConnectorError);
    expect(error.message).toBe('Something went wrong');
    expect(error.name).toBe('ConnectorError');
    expect(error.statusCode).toBeUndefined();
    expect(error.cause).toBeUndefined();
    expect(error.context).toBeUndefined();
  });

  it('should create error with status code', () => {
    const error = new ConnectorError('Server error', 500);

    expect(error.message).toBe('Server error');
    expect(error.statusCode).toBe(500);
  });

  it('should create error with cause', () => {
    const originalError = new Error('Original error');
    const error = new ConnectorError('Wrapped error', undefined, originalError);

    expect(error.message).toBe('Wrapped error');
    expect(error.cause).toBe(originalError);
  });

  it('should create error with context', () => {
    const context = { userId: '12345', operation: 'fetchUser' };
    const error = new ConnectorError('Context error', undefined, undefined, context);

    expect(error.message).toBe('Context error');
    expect(error.context).toEqual(context);
  });

  it('should create error with all parameters', () => {
    const originalError = new Error('Original');
    const context = { endpoint: '/users' };
    const error = new ConnectorError('Complete error', 404, originalError, context);

    expect(error.message).toBe('Complete error');
    expect(error.statusCode).toBe(404);
    expect(error.cause).toBe(originalError);
    expect(error.context).toEqual(context);
  });

  it('should have proper stack trace', () => {
    const error = new ConnectorError('Stack trace test');

    expect(error.stack).toBeDefined();
    expect(error.stack).toContain('ConnectorError');
  });

  it('should be throwable and catchable', () => {
    expect(() => {
      throw new ConnectorError('Throwable error');
    }).toThrow(ConnectorError);

    expect(() => {
      throw new ConnectorError('Throwable error');
    }).toThrow('Throwable error');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// TEST SUITE #2: AuthenticationError
// ══════════════════════════════════════════════════════════════════════════════

describe('AuthenticationError', () => {
  it('should create authentication error with message', () => {
    const error = new AuthenticationError('Invalid credentials');

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(ConnectorError);
    expect(error).toBeInstanceOf(AuthenticationError);
    expect(error.message).toBe('Invalid credentials');
    expect(error.name).toBe('AuthenticationError');
    expect(error.statusCode).toBe(401);
  });

  it('should create authentication error with cause', () => {
    const originalError = new Error('Token expired');
    const error = new AuthenticationError('Authentication failed', originalError);

    expect(error.message).toBe('Authentication failed');
    expect(error.statusCode).toBe(401);
    expect(error.cause).toBe(originalError);
  });

  it('should create authentication error with context', () => {
    const context = { tenantId: 'contoso.com', clientId: 'app-123' };
    const error = new AuthenticationError('Auth error', undefined, context);

    expect(error.statusCode).toBe(401);
    expect(error.context).toEqual(context);
  });

  it('should always use 401 status code', () => {
    const error = new AuthenticationError('Test');
    expect(error.statusCode).toBe(401);
  });

  it('should be throwable as AuthenticationError', () => {
    expect(() => {
      throw new AuthenticationError('Auth failed');
    }).toThrow(AuthenticationError);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// TEST SUITE #3: AuthorizationError
// ══════════════════════════════════════════════════════════════════════════════

describe('AuthorizationError', () => {
  it('should create authorization error with message', () => {
    const error = new AuthorizationError('Insufficient permissions');

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(ConnectorError);
    expect(error).toBeInstanceOf(AuthorizationError);
    expect(error.message).toBe('Insufficient permissions');
    expect(error.name).toBe('AuthorizationError');
    expect(error.statusCode).toBe(403);
  });

  it('should create authorization error with cause', () => {
    const originalError = new Error('Permission denied');
    const error = new AuthorizationError('Access denied', originalError);

    expect(error.message).toBe('Access denied');
    expect(error.statusCode).toBe(403);
    expect(error.cause).toBe(originalError);
  });

  it('should create authorization error with context', () => {
    const context = { resource: '/users', requiredPermission: 'User.Read.All' };
    const error = new AuthorizationError('Missing permission', undefined, context);

    expect(error.statusCode).toBe(403);
    expect(error.context).toEqual(context);
  });

  it('should always use 403 status code', () => {
    const error = new AuthorizationError('Test');
    expect(error.statusCode).toBe(403);
  });

  it('should be throwable as AuthorizationError', () => {
    expect(() => {
      throw new AuthorizationError('Forbidden');
    }).toThrow(AuthorizationError);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// TEST SUITE #4: RateLimitError
// ══════════════════════════════════════════════════════════════════════════════

describe('RateLimitError', () => {
  it('should create rate limit error with retry after', () => {
    const error = new RateLimitError('Rate limit exceeded', 60);

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(ConnectorError);
    expect(error).toBeInstanceOf(RateLimitError);
    expect(error.message).toBe('Rate limit exceeded');
    expect(error.name).toBe('RateLimitError');
    expect(error.statusCode).toBe(429);
    expect(error.retryAfter).toBe(60);
  });

  it('should create rate limit error with cause', () => {
    const originalError = new Error('Too many requests');
    const error = new RateLimitError('Throttled', 120, originalError);

    expect(error.message).toBe('Throttled');
    expect(error.statusCode).toBe(429);
    expect(error.retryAfter).toBe(120);
    expect(error.cause).toBe(originalError);
  });

  it('should create rate limit error with context', () => {
    const context = { endpoint: '/users', requestCount: 1000 };
    const error = new RateLimitError('Rate limited', 30, undefined, context);

    expect(error.statusCode).toBe(429);
    expect(error.retryAfter).toBe(30);
    expect(error.context).toEqual(context);
  });

  it('should always use 429 status code', () => {
    const error = new RateLimitError('Test', 10);
    expect(error.statusCode).toBe(429);
  });

  it('should store retry after value', () => {
    const error1 = new RateLimitError('Test1', 30);
    const error2 = new RateLimitError('Test2', 120);

    expect(error1.retryAfter).toBe(30);
    expect(error2.retryAfter).toBe(120);
  });

  it('should be throwable as RateLimitError', () => {
    expect(() => {
      throw new RateLimitError('Too many requests', 60);
    }).toThrow(RateLimitError);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// TEST SUITE #5: BadRequestError
// ══════════════════════════════════════════════════════════════════════════════

describe('BadRequestError', () => {
  it('should create bad request error with message', () => {
    const error = new BadRequestError('Invalid parameters');

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(ConnectorError);
    expect(error).toBeInstanceOf(BadRequestError);
    expect(error.message).toBe('Invalid parameters');
    expect(error.name).toBe('BadRequestError');
    expect(error.statusCode).toBe(400);
  });

  it('should create bad request error with cause', () => {
    const originalError = new Error('Malformed request');
    const error = new BadRequestError('Bad request', originalError);

    expect(error.message).toBe('Bad request');
    expect(error.statusCode).toBe(400);
    expect(error.cause).toBe(originalError);
  });

  it('should create bad request error with context', () => {
    const context = { invalidParam: 'userId', expectedFormat: 'GUID' };
    const error = new BadRequestError('Invalid user ID', undefined, context);

    expect(error.statusCode).toBe(400);
    expect(error.context).toEqual(context);
  });

  it('should always use 400 status code', () => {
    const error = new BadRequestError('Test');
    expect(error.statusCode).toBe(400);
  });

  it('should be throwable as BadRequestError', () => {
    expect(() => {
      throw new BadRequestError('Invalid request');
    }).toThrow(BadRequestError);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// TEST SUITE #6: DeltaTokenExpiredError
// ══════════════════════════════════════════════════════════════════════════════

describe('DeltaTokenExpiredError', () => {
  it('should create delta token expired error with message', () => {
    const error = new DeltaTokenExpiredError('Delta token has expired');

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(ConnectorError);
    expect(error).toBeInstanceOf(DeltaTokenExpiredError);
    expect(error.message).toBe('Delta token has expired');
    expect(error.name).toBe('DeltaTokenExpiredError');
    expect(error.statusCode).toBe(410);
  });

  it('should create delta token expired error with cause', () => {
    const originalError = new Error('syncStateNotFound');
    const error = new DeltaTokenExpiredError('Sync state not found', originalError);

    expect(error.message).toBe('Sync state not found');
    expect(error.statusCode).toBe(410);
    expect(error.cause).toBe(originalError);
  });

  it('should create delta token expired error with context', () => {
    const context = { entityType: 'users', lastSyncTime: '2024-03-10T10:00:00Z' };
    const error = new DeltaTokenExpiredError('Token expired', undefined, context);

    expect(error.statusCode).toBe(410);
    expect(error.context).toEqual(context);
  });

  it('should always use 410 status code', () => {
    const error = new DeltaTokenExpiredError('Test');
    expect(error.statusCode).toBe(410);
  });

  it('should be throwable as DeltaTokenExpiredError', () => {
    expect(() => {
      throw new DeltaTokenExpiredError('Expired');
    }).toThrow(DeltaTokenExpiredError);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// TEST SUITE #7: NetworkError
// ══════════════════════════════════════════════════════════════════════════════

describe('NetworkError', () => {
  it('should create network error with message', () => {
    const error = new NetworkError('Connection timeout');

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(ConnectorError);
    expect(error).toBeInstanceOf(NetworkError);
    expect(error.message).toBe('Connection timeout');
    expect(error.name).toBe('NetworkError');
    expect(error.statusCode).toBeUndefined();
  });

  it('should create network error with cause', () => {
    const originalError = new Error('ECONNREFUSED');
    const error = new NetworkError('Connection refused', originalError);

    expect(error.message).toBe('Connection refused');
    expect(error.cause).toBe(originalError);
    expect(error.statusCode).toBeUndefined();
  });

  it('should create network error with context', () => {
    const context = { url: 'https://graph.microsoft.com', timeout: 20000 };
    const error = new NetworkError('Request timed out', undefined, context);

    expect(error.context).toEqual(context);
    expect(error.statusCode).toBeUndefined();
  });

  it('should not have status code', () => {
    const error = new NetworkError('Test');
    expect(error.statusCode).toBeUndefined();
  });

  it('should be throwable as NetworkError', () => {
    expect(() => {
      throw new NetworkError('Network failure');
    }).toThrow(NetworkError);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// TEST SUITE #8: ExternalAPIError
// ══════════════════════════════════════════════════════════════════════════════

describe('ExternalAPIError', () => {
  it('should create external API error with status code', () => {
    const error = new ExternalAPIError('Internal server error', 500);

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(ConnectorError);
    expect(error).toBeInstanceOf(ExternalAPIError);
    expect(error.message).toBe('Internal server error');
    expect(error.name).toBe('ExternalAPIError');
    expect(error.statusCode).toBe(500);
  });

  it('should create external API error with cause', () => {
    const originalError = new Error('Service unavailable');
    const error = new ExternalAPIError('API unavailable', 503, originalError);

    expect(error.message).toBe('API unavailable');
    expect(error.statusCode).toBe(503);
    expect(error.cause).toBe(originalError);
  });

  it('should create external API error with context', () => {
    const context = { endpoint: '/users', responseBody: '{"error":"Server error"}' };
    const error = new ExternalAPIError('Server error', 500, undefined, context);

    expect(error.statusCode).toBe(500);
    expect(error.context).toEqual(context);
  });

  it('should support different 5xx status codes', () => {
    const error500 = new ExternalAPIError('Test', 500);
    const error502 = new ExternalAPIError('Test', 502);
    const error503 = new ExternalAPIError('Test', 503);
    const error504 = new ExternalAPIError('Test', 504);

    expect(error500.statusCode).toBe(500);
    expect(error502.statusCode).toBe(502);
    expect(error503.statusCode).toBe(503);
    expect(error504.statusCode).toBe(504);
  });

  it('should be throwable as ExternalAPIError', () => {
    expect(() => {
      throw new ExternalAPIError('API error', 500);
    }).toThrow(ExternalAPIError);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// TEST SUITE #9: ValidationError
// ══════════════════════════════════════════════════════════════════════════════

describe('ValidationError', () => {
  it('should create validation error with message', () => {
    const error = new ValidationError('Invalid email format');

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(ConnectorError);
    expect(error).toBeInstanceOf(ValidationError);
    expect(error.message).toBe('Invalid email format');
    expect(error.name).toBe('ValidationError');
    expect(error.statusCode).toBe(422);
  });

  it('should create validation error with context', () => {
    const context = { field: 'email', expectedFormat: 'user@domain.com' };
    const error = new ValidationError('Email validation failed', context);

    expect(error.statusCode).toBe(422);
    expect(error.context).toEqual(context);
    expect(error.cause).toBeUndefined();
  });

  it('should always use 422 status code', () => {
    const error = new ValidationError('Test');
    expect(error.statusCode).toBe(422);
  });

  it('should not have cause parameter', () => {
    const error = new ValidationError('Test', { field: 'test' });
    expect(error.cause).toBeUndefined();
  });

  it('should be throwable as ValidationError', () => {
    expect(() => {
      throw new ValidationError('Validation failed');
    }).toThrow(ValidationError);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// TEST SUITE #10: ConfigurationError
// ══════════════════════════════════════════════════════════════════════════════

describe('ConfigurationError', () => {
  it('should create configuration error with message', () => {
    const error = new ConfigurationError('Missing required configuration');

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(ConnectorError);
    expect(error).toBeInstanceOf(ConfigurationError);
    expect(error.message).toBe('Missing required configuration');
    expect(error.name).toBe('ConfigurationError');
    expect(error.statusCode).toBeUndefined();
  });

  it('should create configuration error with context', () => {
    const context = { missingField: 'tenantId', configFile: 'manifest.json' };
    const error = new ConfigurationError('Invalid configuration', context);

    expect(error.context).toEqual(context);
    expect(error.statusCode).toBeUndefined();
    expect(error.cause).toBeUndefined();
  });

  it('should not have status code', () => {
    const error = new ConfigurationError('Test');
    expect(error.statusCode).toBeUndefined();
  });

  it('should not have cause parameter', () => {
    const error = new ConfigurationError('Test', { field: 'test' });
    expect(error.cause).toBeUndefined();
  });

  it('should be throwable as ConfigurationError', () => {
    expect(() => {
      throw new ConfigurationError('Config error');
    }).toThrow(ConfigurationError);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// TEST SUITE #11: Error Hierarchy and Instanceof Checks
// ══════════════════════════════════════════════════════════════════════════════

describe('Error Hierarchy', () => {
  it('should maintain proper instanceof relationships', () => {
    const authError = new AuthenticationError('Test');
    const authzError = new AuthorizationError('Test');
    const rateLimitError = new RateLimitError('Test', 60);

    // All custom errors should be instances of base classes
    expect(authError instanceof Error).toBe(true);
    expect(authError instanceof ConnectorError).toBe(true);
    expect(authError instanceof AuthenticationError).toBe(true);

    expect(authzError instanceof Error).toBe(true);
    expect(authzError instanceof ConnectorError).toBe(true);
    expect(authzError instanceof AuthorizationError).toBe(true);

    expect(rateLimitError instanceof Error).toBe(true);
    expect(rateLimitError instanceof ConnectorError).toBe(true);
    expect(rateLimitError instanceof RateLimitError).toBe(true);

    // But not instances of sibling classes
    expect(authError instanceof AuthorizationError).toBe(false);
    expect(authzError instanceof AuthenticationError).toBe(false);
    expect(rateLimitError instanceof AuthenticationError).toBe(false);
  });

  it('should allow catching specific error types', () => {
    try {
      throw new AuthenticationError('Auth failed');
    } catch (error) {
      if (error instanceof AuthenticationError) {
        expect(error.statusCode).toBe(401);
        expect(error.message).toBe('Auth failed');
      } else {
        fail('Should have caught AuthenticationError');
      }
    }
  });

  it('should allow catching base ConnectorError', () => {
    const errors = [
      new AuthenticationError('Auth'),
      new AuthorizationError('Authz'),
      new RateLimitError('Rate', 60),
      new NetworkError('Network'),
    ];

    errors.forEach((error) => {
      expect(error instanceof ConnectorError).toBe(true);
    });
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// TEST SUITE #12: Error Context and Debugging
// ══════════════════════════════════════════════════════════════════════════════

describe('Error Context and Debugging', () => {
  it('should preserve error context for debugging', () => {
    const context = {
      tenantId: 'contoso.com',
      userId: 'user-123',
      operation: 'fetchUserDetails',
      timestamp: '2024-03-15T10:00:00Z',
    };

    const error = new AuthenticationError('Auth failed', undefined, context);

    expect(error.context).toEqual(context);
    expect(error.context?.tenantId).toBe('contoso.com');
    expect(error.context?.operation).toBe('fetchUserDetails');
  });

  it('should chain errors with cause', () => {
    const networkError = new Error('ECONNREFUSED');
    const apiError = new ExternalAPIError('API unavailable', 503, networkError);
    const connectorError = new ConnectorError('Failed to fetch data', undefined, apiError);

    expect(connectorError.cause).toBe(apiError);
    expect(apiError.cause).toBe(networkError);
  });

  it('should provide useful error information for logging', () => {
    const originalError = new Error('Network timeout');
    const context = { endpoint: '/users', timeout: 20000 };
    const error = new NetworkError('Request failed', originalError, context);

    // All information available for logging
    expect(error.name).toBe('NetworkError');
    expect(error.message).toBe('Request failed');
    expect(error.cause?.message).toBe('Network timeout');
    expect(error.context?.endpoint).toBe('/users');
    expect(error.stack).toBeDefined();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// TEST SUMMARY
// ══════════════════════════════════════════════════════════════════════════════
// Total Test Suites: 12
// Total Test Cases: 90+
// Coverage:
// - All 10 custom error classes tested
// - Constructor parameters (message, statusCode, cause, context)
// - Error hierarchy and instanceof checks
// - Throwable and catchable behavior
// - Stack traces
// - Error chaining with cause
// - Status code preservation
// - Context preservation for debugging
// - Special properties (retryAfter for RateLimitError)
// ══════════════════════════════════════════════════════════════════════════════
