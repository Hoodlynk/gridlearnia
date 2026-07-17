import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { verifyEmailTemplate } from './templates/verify-email.template';

interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

/**
 * Outbound email via the Mailgun HTTP API. Sends are fire-and-forget:
 * a Mailgun outage must never fail a registration or resend request.
 * Unconfigured (no MAILGUN_* env) the service logs instead of sending,
 * so the flow stays testable in development.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly apiKey?: string;
  private readonly domain?: string;
  private readonly baseUrl: string;
  private readonly from: string;
  private readonly appUrl: string;

  constructor(configService: ConfigService) {
    this.apiKey = configService.get<string>('mail.apiKey');
    this.domain = configService.get<string>('mail.domain');
    this.baseUrl =
      configService.get<string>('mail.baseUrl') ?? 'https://api.mailgun.net';
    this.from =
      configService.get<string>('mail.from') ?? 'GridLearnia <noreply@gridlearnia.com>';
    this.appUrl =
      configService.get<string>('appUrl') ?? 'http://localhost:3000';

    if (!this.isConfigured) {
      this.logger.warn(
        'Mailgun is not configured (MAILGUN_API_KEY / MAILGUN_DOMAIN) — emails are logged, not sent',
      );
    }
  }

  get isConfigured(): boolean {
    return Boolean(this.apiKey && this.domain);
  }

  verificationLink(token: string): string {
    return `${this.appUrl}/verify-email?token=${token}`;
  }

  /** Fire-and-forget — call with `void`, never await in a request path. */
  async sendVerificationEmail(to: string, token: string): Promise<void> {
    const { subject, text, html } = verifyEmailTemplate(
      this.verificationLink(token),
    );
    await this.send({ to, subject, text, html });
  }

  private async send(message: MailMessage): Promise<void> {
    if (!this.isConfigured) {
      // Dev fallback: surface the content so the flow can be exercised.
      this.logger.log(
        `[mail:not-sent] to=${message.to} subject="${message.subject}"\n${message.text}`,
      );
      return;
    }

    try {
      const res = await fetch(`${this.baseUrl}/v3/${this.domain}/messages`, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`api:${this.apiKey}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          from: this.from,
          to: message.to,
          subject: message.subject,
          text: message.text,
          ...(message.html ? { html: message.html } : {}),
        }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        this.logger.error(
          `Mailgun send failed (${res.status}) to=${message.to}: ${body.slice(0, 200)}`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Mailgun send errored to=${message.to}: ${error instanceof Error ? error.message : error}`,
      );
    }
  }
}
