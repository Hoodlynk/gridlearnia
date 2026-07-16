import { Injectable, OnModuleDestroy } from '@nestjs/common';

export interface BucketDecision {
  allowed: boolean;
  /** Whole tokens left after this request. */
  remaining: number;
  /** Seconds until a token is available (0 when allowed). */
  retryAfterSeconds: number;
}

/**
 * Storage abstraction so the guards don't care where buckets live.
 * Swap in a Redis implementation (atomic Lua refill+consume) when scaling
 * past one instance — the guards stay untouched.
 */
export abstract class TokenBucketStore {
  abstract consume(
    key: string,
    capacity: number,
    refillPerSecond: number,
    cost?: number,
  ): Promise<BucketDecision>;
}

interface BucketState {
  tokens: number;
  lastRefillMs: number;
  capacity: number;
}

const CLEANUP_INTERVAL_MS = 10 * 60 * 1000;

/**
 * Classic lazy-refill token bucket: no timers per bucket, O(1) state per key.
 *   tokens = min(capacity, tokens + elapsedSeconds * refillPerSecond)
 * Correct for a single process; per-process buckets multiply limits when
 * running multiple instances (same caveat as any in-memory limiter).
 */
@Injectable()
export class InMemoryTokenBucketStore
  extends TokenBucketStore
  implements OnModuleDestroy
{
  private readonly buckets = new Map<string, BucketState>();
  private readonly cleanupTimer: NodeJS.Timeout;

  constructor() {
    super();
    // Evict buckets that have refilled to full — they hold no information.
    this.cleanupTimer = setInterval(() => this.evictFullBuckets(), CLEANUP_INTERVAL_MS);
    this.cleanupTimer.unref();
  }

  consume(
    key: string,
    capacity: number,
    refillPerSecond: number,
    cost = 1,
  ): Promise<BucketDecision> {
    const now = Date.now();
    const bucket = this.buckets.get(key) ?? {
      tokens: capacity,
      lastRefillMs: now,
      capacity,
    };

    const elapsedSeconds = (now - bucket.lastRefillMs) / 1000;
    bucket.tokens = Math.min(
      capacity,
      bucket.tokens + elapsedSeconds * refillPerSecond,
    );
    bucket.lastRefillMs = now;
    bucket.capacity = capacity;

    if (bucket.tokens >= cost) {
      bucket.tokens -= cost;
      this.buckets.set(key, bucket);
      return Promise.resolve({
        allowed: true,
        remaining: Math.floor(bucket.tokens),
        retryAfterSeconds: 0,
      });
    }

    this.buckets.set(key, bucket);
    const deficit = cost - bucket.tokens;
    return Promise.resolve({
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.ceil(deficit / refillPerSecond),
    });
  }

  private evictFullBuckets(): void {
    const now = Date.now();
    for (const [key, bucket] of this.buckets) {
      // A bucket idle long enough to be full again carries no state.
      const idleSeconds = (now - bucket.lastRefillMs) / 1000;
      if (bucket.tokens >= bucket.capacity || idleSeconds > 24 * 60 * 60) {
        this.buckets.delete(key);
      }
    }
  }

  onModuleDestroy(): void {
    clearInterval(this.cleanupTimer);
  }
}
