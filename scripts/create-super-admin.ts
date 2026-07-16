/**
 * Create (or promote) a platform SUPER_ADMIN.
 *
 * Usage:
 *   npm run admin:create -- admin@example.com
 *
 * Requires PLATFORM_ADMIN_SECRET in the environment (.env). The script
 * prompts for it interactively — never pass secrets as CLI arguments,
 * they end up in shell history.
 *
 * Note: this gate is defense-in-depth against casual/accidental use.
 * Anyone holding the full .env already has DATABASE_URL and could edit
 * the database directly — protect the .env itself accordingly.
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import { timingSafeEqual } from 'crypto';
import { createInterface } from 'readline';
import { Writable } from 'stream';

const prisma = new PrismaClient();

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 72; // bcrypt truncates beyond 72 bytes

function promptHidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    const muted = new Writable({
      write(_chunk, _encoding, callback) {
        callback();
      },
    });
    const rl = createInterface({
      input: process.stdin,
      output: muted,
      terminal: true,
    });
    process.stdout.write(question);
    rl.question('', (answer) => {
      process.stdout.write('\n');
      rl.close();
      resolve(answer.trim());
    });
  });
}

function secretsMatch(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email || !EMAIL_PATTERN.test(email)) {
    console.error('Usage: npm run admin:create -- <admin-email>');
    process.exit(1);
  }

  const platformSecret = process.env.PLATFORM_ADMIN_SECRET;
  if (!platformSecret) {
    console.error('❌ PLATFORM_ADMIN_SECRET is not set in the environment.');
    process.exit(1);
  }

  const provided = await promptHidden('Platform password: ');
  if (!secretsMatch(provided, platformSecret)) {
    console.error('❌ Invalid platform password.');
    process.exit(1);
  }

  const superAdminRole = await prisma.role.findFirst({
    where: { key: 'SUPER_ADMIN', tenantId: null },
  });
  if (!superAdminRole) {
    console.error('❌ System roles not seeded — run `npm run prisma:seed` first.');
    process.exit(1);
  }

  const existing = await prisma.user.findUnique({ where: { email } });

  if (existing?.tenantId) {
    console.error(
      `❌ ${email} belongs to a school (tenant ${existing.tenantId}). ` +
        'Tenant users cannot be promoted to platform SUPER_ADMIN.',
    );
    process.exit(1);
  }

  if (existing) {
    // Existing platform-level user: promote, keep their password.
    await prisma.userRole.upsert({
      where: {
        userId_roleId: { userId: existing.id, roleId: superAdminRole.id },
      },
      update: {},
      create: { userId: existing.id, roleId: superAdminRole.id },
    });
    await audit('SUPER_ADMIN_PROMOTED', existing.id, email);
    console.log(`✅ Promoted existing platform user ${email} to SUPER_ADMIN.`);
    return;
  }

  const password = await promptHidden('New admin password: ');
  if (
    password.length < MIN_PASSWORD_LENGTH ||
    password.length > MAX_PASSWORD_LENGTH
  ) {
    console.error(
      `❌ Password must be ${MIN_PASSWORD_LENGTH}-${MAX_PASSWORD_LENGTH} characters.`,
    );
    process.exit(1);
  }
  const confirmation = await promptHidden('Confirm admin password: ');
  if (password !== confirmation) {
    console.error('❌ Passwords do not match.');
    process.exit(1);
  }

  const user = await prisma.user.create({
    data: {
      email,
      passwordHash: await bcrypt.hash(password, 10),
      firstName: 'Platform',
      lastName: 'Admin',
      isActive: true,
      emailVerified: true,
    },
  });
  await prisma.userRole.create({
    data: { userId: user.id, roleId: superAdminRole.id },
  });
  await audit('SUPER_ADMIN_CREATED', user.id, email);

  console.log(`✅ SUPER_ADMIN created: ${email}`);
}

/** Audit trail + alert webhook — a new platform admin should never be silent. */
async function audit(action: string, userId: string, email: string) {
  const summary = `${action}: ${email} (via create-super-admin script on ${process.env.NODE_ENV ?? 'development'})`;

  await prisma.auditLog
    .create({
      data: {
        action,
        userId,
        resourceType: 'user',
        resourceId: userId,
        metadata: { email, source: 'create-super-admin script' },
      },
    })
    .catch((error) =>
      console.error('⚠️ Audit write failed:', error?.message ?? error),
    );

  const webhook = process.env.ALERT_WEBHOOK_URL;
  if (webhook) {
    await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: `🚨 [GridLearnia] ${summary}`,
        content: `🚨 [GridLearnia] ${summary}`,
      }),
    }).catch((error) =>
      console.error('⚠️ Alert webhook failed:', error?.message ?? error),
    );
  }
}

main()
  .catch((error) => {
    console.error('❌ Failed:', error instanceof Error ? error.message : error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
