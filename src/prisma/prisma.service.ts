import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      log:
        process.env.NODE_ENV === 'development'
          ? ['query', 'error', 'warn']
          : ['error'],
    });
  }

  async onModuleInit(): Promise<void> {
    const startedAt = Date.now();
    try {
      await this.$connect();
      // $connect alone doesn't guarantee the pool works — run a real query
      await this.$queryRaw`SELECT 1`;
      this.logger.log(
        `✅ Database connected to ${this.databaseHost()} (${Date.now() - startedAt}ms)`,
      );
    } catch (error) {
      this.logger.error(
        `❌ Database connection failed for ${this.databaseHost()}`,
        error instanceof Error ? error.message : String(error),
      );
      throw error;
    }

    // Pre-open pool connections in the background: establishing a connection
    // to a remote DB costs seconds (TLS + auth), and Prisma grows the pool
    // lazily — without this, random requests pay that setup cost mid-session.
    void Promise.all(
      Array.from({ length: 4 }, () => this.$queryRaw`SELECT 1`),
    ).then(
      () => this.logger.log('🔥 Connection pool warmed'),
      () => undefined,
    );
  }

  /** Hostname only — never log the full URL, it contains the password. */
  private databaseHost(): string {
    try {
      return new URL(process.env.DATABASE_URL ?? '').host || 'unknown-host';
    } catch {
      return 'unknown-host';
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
    this.logger.log('🔌 Database disconnected');
  }
}
