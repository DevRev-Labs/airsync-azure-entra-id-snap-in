/**
 * Labs Usage Tracker for DevRev Marketplace Telemetry
 *
 * This module provides telemetry tracking for marketplace snap-ins.
 * It performs health checks and sends usage events to DevRev's usage API.
 *
 * All operations are non-blocking and failures are logged without throwing errors,
 * ensuring that telemetry issues never impact the main snap-in functionality.
 */

import axios from 'axios';
import { formatError } from './utils';

/**
 * Configuration for the Labs Usage Tracker
 */
interface LabsUsageConfig {
  /** Service account token for authentication */
  serviceToken: string;
  /** Solution name to report in usage events */
  solutionName: string;
  /** Solution version to report in usage events */
  version: string;
  /** Timeout for HTTP requests in milliseconds (default: 5000) */
  timeout?: number;
}

/**
 * Usage event payload structure
 */
interface UsageEventPayload {
  solution_name: string;
  version: string;
  event_type: string;
  payload: Record<string, unknown>;
}

/**
 * Labs Usage Tracker
 *
 * Handles health checks and usage event reporting for DevRev marketplace telemetry.
 * Designed to be non-blocking and fail-safe.
 *
 * @example
 * ```typescript
 * const tracker = new LabsUsageTracker({
 *   serviceToken: 'your-token',
 *   solutionName: 'Azure Entra ID AirSync connector',
 *   version: '1.0'
 * });
 * await tracker.trackUsageEvent('airsync_operation_completed');
 * ```
 */
export class LabsUsageTracker {
  private readonly serviceToken: string;
  private readonly solutionName: string;
  private readonly version: string;
  private readonly timeout: number;
  private readonly healthCheckUrl = 'https://usage.devrevlabs.ai/health';
  private readonly usageEventUrl = 'https://usage.devrevlabs.ai/usage_event';

  constructor(config: LabsUsageConfig) {
    this.serviceToken = config.serviceToken;
    this.solutionName = config.solutionName;
    this.version = config.version;
    this.timeout = config.timeout ?? 5000;
  }

  /**
   * Performs a health check against the usage API
   *
   * @returns Promise that resolves when health check completes (success or failure)
   */
  private async performHealthCheck(): Promise<void> {
    console.info('[LabsUsageTracker] Performing health check...', {
      url: this.healthCheckUrl,
      timeout: this.timeout,
    });

    try {
      const response = await axios.get(this.healthCheckUrl, {
        timeout: this.timeout,
      });
      console.info('[LabsUsageTracker] Health check completed successfully', {
        status: response.status,
        statusText: response.statusText,
      });
    } catch (error) {
      console.info('[LabsUsageTracker] Health check failed (non-blocking)', {
        error: formatError(error),
        url: this.healthCheckUrl,
      });
    }
  }

  /**
   * Sends a usage event to the DevRev usage API
   *
   * @param eventType - The type of event to report (e.g., 'airsync_operation_completed')
   * @param payload - Optional additional payload data
   * @returns Promise that resolves when the event is sent (success or failure)
   */
  private async sendUsageEvent(
    eventType: string,
    payload: Record<string, unknown> = {}
  ): Promise<void> {
    try {
      const eventPayload: UsageEventPayload = {
        solution_name: this.solutionName,
        version: this.version,
        event_type: eventType,
        payload,
      };

      console.info('[LabsUsageTracker] Sending usage event...', {
        url: this.usageEventUrl,
        eventType,
        solutionName: this.solutionName,
        version: this.version,
      });

      console.info('[LabsUsageTracker] Usage event payload:', JSON.stringify(eventPayload, null, 2));

      const response = await axios.post(this.usageEventUrl, eventPayload, {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.serviceToken}`,
        },
        timeout: this.timeout,
      });

      console.info('[LabsUsageTracker] Usage event sent successfully', {
        status: response.status,
        statusText: response.statusText,
        eventType,
      });
    } catch (error) {
      console.info('[LabsUsageTracker] Usage event failed (non-blocking)', {
        error: formatError(error),
        url: this.usageEventUrl,
        eventType,
      });
    }
  }

  /**
   * Tracks a usage event with optional health check
   *
   * This is the main entry point for tracking usage. It performs a health check
   * (if enabled) and then sends the usage event. Both operations are non-blocking
   * and failures are logged without throwing errors.
   *
   * @param eventType - The type of event to report (e.g., 'airsync_operation_completed')
   * @param options - Optional configuration
   * @param options.skipHealthCheck - Skip the health check (default: false)
   * @param options.payload - Additional payload data to include in the event
   * @returns Promise that resolves when tracking is complete
   */
  async trackUsageEvent(
    eventType: string,
    options: {
      skipHealthCheck?: boolean;
      payload?: Record<string, unknown>;
    } = {}
  ): Promise<void> {
    console.info('[LabsUsageTracker] Starting usage event tracking');

    // Perform health check unless explicitly skipped
    if (!options.skipHealthCheck) {
      await this.performHealthCheck();
    }

    // Send usage event
    await this.sendUsageEvent(eventType, options.payload);

    console.info('[LabsUsageTracker] Usage event tracking completed');
  }

  /**
   * Factory method to create a tracker from adapter event context
   *
   * @param serviceToken - Service account token from adapter.event.context.secrets
   * @param solutionName - Name of the solution
   * @param version - Version of the solution
   * @returns A new LabsUsageTracker instance, or null if token is not available
   */
  static fromServiceToken(
    serviceToken: string | undefined,
    solutionName: string,
    version: string
  ): LabsUsageTracker | null {
    if (!serviceToken) {
      console.info('[LabsUsageTracker] Service account token not available, skipping usage tracking', {
        solutionName,
        version,
        tokenAvailable: false,
      });
      return null;
    }

    console.info('[LabsUsageTracker] Service account token verified successfully', {
      solutionName,
      version,
      tokenAvailable: true,
    });
    return new LabsUsageTracker({
      serviceToken,
      solutionName,
      version,
    });
  }
}
