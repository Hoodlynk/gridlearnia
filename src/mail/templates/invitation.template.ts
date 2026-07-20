import { emailButton, emailLayout, EMAIL_COLORS } from './layout';
import { RenderedEmail } from './verify-email.template';

/**
 * Invite to join a school with pre-assigned roles. The link carries the raw
 * token — only its SHA-256 hash is stored, so this email is the only place it
 * ever appears.
 */
export function invitationTemplate(
  link: string,
  schoolName: string,
  roleKeys: string[],
  expiresInDays: number,
): RenderedEmail {
  const c = EMAIL_COLORS;
  const roles = formatRoles(roleKeys);

  const content = `
    <h1 style="margin:0 0 16px;font-size:22px;line-height:30px;font-weight:600;color:${c.charcoal};">
      You&rsquo;ve been invited to ${escapeHtml(schoolName)}
    </h1>
    <p style="margin:0 0 8px;font-size:15px;line-height:24px;color:${c.secondary};">
      You have been invited to join <strong>${escapeHtml(schoolName)}</strong>
      on GridLearnia as <strong>${escapeHtml(roles)}</strong>.
    </p>
    <p style="margin:0 0 8px;font-size:15px;line-height:24px;color:${c.secondary};">
      Accept the invitation to set up your account and get access.
    </p>
    ${emailButton('Accept invitation', link)}
    <p style="margin:0 0 8px;font-size:13px;line-height:20px;color:${c.muted};">
      Or paste this link into your browser:
    </p>
    <p style="margin:0 0 24px;font-size:13px;line-height:20px;word-break:break-all;">
      <a href="${link}" style="color:${c.secondary};">${link}</a>
    </p>
    <hr style="border:0;border-top:1px solid ${c.edge};margin:0 0 16px;" />
    <p style="margin:0;font-size:12px;line-height:18px;color:${c.muted};">
      This invitation expires in ${expiresInDays} days and can be used once.
      It must be accepted with this email address. If you weren&rsquo;t expecting
      it, you can safely ignore this email.
    </p>`;

  return {
    subject: `You're invited to join ${schoolName} — GridLearnia`,
    text:
      `You've been invited to join ${schoolName} on GridLearnia as ${roles}.\n\n` +
      `Accept the invitation:\n\n${link}\n\n` +
      `This invitation expires in ${expiresInDays} days and can be used once. ` +
      `It must be accepted with this email address. ` +
      `If you weren't expecting it, you can ignore this email.`,
    html: emailLayout({
      previewText: `Join ${schoolName} on GridLearnia as ${roles}`,
      content,
    }),
  };
}

/** "TEACHER" + "CLASS_TEACHER" → "Teacher and Class Teacher" */
function formatRoles(roleKeys: string[]): string {
  const pretty = roleKeys.map((key) =>
    key
      .toLowerCase()
      .split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' '),
  );
  if (pretty.length <= 1) return pretty[0] ?? 'a team member';
  return `${pretty.slice(0, -1).join(', ')} and ${pretty[pretty.length - 1]}`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
