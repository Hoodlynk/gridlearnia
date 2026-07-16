import { SetMetadata } from '@nestjs/common';

export const RATE_LIMIT_KEY = 'rateLimitPolicy';

export interface RateLimitPolicy {
  /** Burst allowance — max tokens in the bucket. */
  capacity: number;
  /** Sustained rate — tokens added per second. */
  refillPerSecond: number;
}

/** Per-route override of the default per-IP bucket, e.g. tight login limits. */
export const RateLimit = (policy: RateLimitPolicy) =>
  SetMetadata(RATE_LIMIT_KEY, policy);

/** Helper: N requests per minute sustained, with a burst of N. */
export const perMinute = (n: number): RateLimitPolicy => ({
  capacity: n,
  refillPerSecond: n / 60,
});
