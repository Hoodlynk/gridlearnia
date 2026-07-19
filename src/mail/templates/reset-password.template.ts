import { emailButton, emailLayout, EMAIL_COLORS } from './layout';
import { RenderedEmail } from './verify-email.template';

export function resetPasswordTemplate(link: string): RenderedEmail {
  const c = EMAIL_COLORS;

  const content = `
    <h1 style="margin:0 0 16px;font-size:22px;line-height:30px;font-weight:600;color:${c.charcoal};">
      Reset your password
    </h1>
    <p style="margin:0 0 8px;font-size:15px;line-height:24px;color:${c.secondary};">
      We received a request to reset the password for your GridLearnia
      account. Use the button below to choose a new one.
    </p>
    ${emailButton('Reset my password', link)}
    <p style="margin:0 0 8px;font-size:13px;line-height:20px;color:${c.muted};">
      Or paste this link into your browser:
    </p>
    <p style="margin:0 0 24px;font-size:13px;line-height:20px;word-break:break-all;">
      <a href="${link}" style="color:${c.secondary};">${link}</a>
    </p>
    <hr style="border:0;border-top:1px solid ${c.edge};margin:0 0 16px;" />
    <p style="margin:0;font-size:12px;line-height:18px;color:${c.muted};">
      The link expires in 1 hour. If you didn&rsquo;t request a password
      reset, you can safely ignore this email — your password is unchanged.
    </p>`;

  return {
    subject: 'Reset your password — GridLearnia',
    text:
      `We received a request to reset the password for your GridLearnia account.\n\n` +
      `Choose a new password here:\n\n` +
      `${link}\n\n` +
      `The link expires in 1 hour. If you didn't request a password reset, you can ignore this email — your password is unchanged.`,
    html: emailLayout({
      previewText: 'Choose a new password for your GridLearnia account.',
      content,
    }),
  };
}
