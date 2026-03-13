import axios from 'axios';

export const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export function formatError(error: unknown): string {
  if (axios.isAxiosError(error)) {
    return `HTTP ${error.response?.status ?? 'unknown'}: ${error.response?.statusText ?? error.message}`;
  }
  return error instanceof Error ? error.message : String(error);
}

export function isRateLimitError(error: unknown): boolean {
  return axios.isAxiosError(error) && error.response?.status === 429;
}

export function isAuthError(error: unknown): boolean {
  return axios.isAxiosError(error) && error.response?.status === 401;
}

export function isForbiddenError(error: unknown): boolean {
  return axios.isAxiosError(error) && error.response?.status === 403;
}

export function isBadRequestError(error: unknown): boolean {
  return axios.isAxiosError(error) && error.response?.status === 400;
}

export function isDeltaExpiredError(error: unknown): boolean {
  if (axios.isAxiosError(error)) {
    if (error.response?.status === 410) return true;
    const errorCode = error.response?.data?.error?.code;
    if (errorCode === 'syncStateNotFound') return true;
  }
  return false;
}

export function getRetryAfterSeconds(error: unknown, defaultSeconds: number): number {
  if (axios.isAxiosError(error)) {
    const retryAfter = error.response?.headers?.['retry-after'];
    if (retryAfter) {
      const parsed = parseInt(retryAfter, 10);
      if (!isNaN(parsed)) return parsed;
    }
  }
  return defaultSeconds;
}
