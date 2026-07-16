import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { FastifyReply, FastifyRequest } from 'fastify';
import {
  RATE_LIMIT_KEY,
  RateLimitPolicy,
} from '../decorators/rate-limit.decorator';
import { TokenBucketStore } from '../token-bucket.store';

/**
 * First guard in the chain — cheap per-IP token bucket before any auth work.
 * Routes with @RateLimit() get their own bucket (keyed per route) on top of
 * the default global-per-IP bucket.
 */
@Injectable()
export class IpRateLimitGuard implements CanActivate {
  private readonly defaultPolicy: RateLimitPolicy;

  constructor(
    private readonly reflector: Reflector,
    private readonly store: TokenBucketStore,
    configService: ConfigService,
  ) {
    const capacity = configService.getOrThrow<number>('throttle.limit');
    const windowMs = configService.getOrThrow<number>('throttle.ttlMs');
    this.defaultPolicy = {
      capacity,
      refillPerSecond: capacity / (windowMs / 1000),
    };
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const reply = context.switchToHttp().getResponse<FastifyReply>();
    const ip = request.ip;

    const override = this.reflector.getAllAndOverride<RateLimitPolicy>(
      RATE_LIMIT_KEY,
      [context.getHandler(), context.getClass()],
    );

    // Route override consumes its own bucket keyed per route,
    // so e.g. hammering /auth/login can't starve normal browsing.
    const policy = override ?? this.defaultPolicy;
    const routeKey = override
      ? `${context.getClass().name}.${context.getHandler().name}`
      : 'global';

    const decision = await this.store.consume(
      `ip:${ip}:${routeKey}`,
      policy.capacity,
      policy.refillPerSecond,
    );

    reply.header('x-ratelimit-remaining', String(decision.remaining));
    if (!decision.allowed) {
      reply.header('retry-after', String(decision.retryAfterSeconds));
      throw new HttpException(
        'Too many requests. Please slow down and try again.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
  }
}
