import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface AuditEntry {
  /** e.g. ROLE_ASSIGNED, SCHOOL_REQUEST_APPROVED */
  action: string;
  /** null for platform-level events */
  tenantId?: string | null;
  /** who performed the action */
  actorId?: string | null;
  resourceType?: string;
  resourceId?: string;
  metadata?: Record<string, unknown>;
  ip?: string;
  /** human-readable line used for logs + webhook alerts */
  summary: string;
  /** critical events also fire the alert webhook */
  critical?: boolean;
}

/**
 * Audit trail for privileged operations. Writes are best-effort: an audit
 * failure is logged loudly but never breaks the operation being audited.
 *
 * Set ALERT_WEBHOOK_URL (Slack/Discord-compatible: POST {"text": ...})
 * to get pinged on critical events.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async record(entry: AuditEntry): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          tenantId: entry.tenantId ?? null,
          userId: entry.actorId ?? null,
          action: entry.action,
          resourceType: entry.resourceType,
          resourceId: entry.resourceId,
          metadata: (entry.metadata ?? {}) as Prisma.InputJsonValue,
          ipAddress: entry.ip,
        },
      });
    } catch (error) {
      this.logger.error(
        `Audit write failed for ${entry.action}: ${entry.summary}`,
        error instanceof Error ? error.stack : String(error),
      );
    }

    if (entry.critical) {
      this.logger.warn(`🚨 AUDIT ${entry.action}: ${entry.summary}`);
      await this.notify(`🚨 [GridLearnia] ${entry.action}: ${entry.summary}`);
    } else {
      this.logger.log(`AUDIT ${entry.action}: ${entry.summary}`);
    }
  }

  private async notify(text: string): Promise<void> {
    const url = process.env.ALERT_WEBHOOK_URL;
    if (!url) return;
    try {
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, content: text }), // Slack uses text, Discord uses content
      });
    } catch (error) {
      this.logger.error(
        `Alert webhook failed: ${error instanceof Error ? error.message : error}`,
      );
    }
  }
}
