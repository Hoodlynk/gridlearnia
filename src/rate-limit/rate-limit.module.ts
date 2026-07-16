import { Global, Module } from '@nestjs/common';
import {
  InMemoryTokenBucketStore,
  TokenBucketStore,
} from './token-bucket.store';

@Global()
@Module({
  providers: [
    // Swap useClass for a RedisTokenBucketStore when scaling past one instance.
    { provide: TokenBucketStore, useClass: InMemoryTokenBucketStore },
  ],
  exports: [TokenBucketStore],
})
export class RateLimitModule {}
