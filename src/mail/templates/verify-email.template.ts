import { emailButton, emailLayout, EMAIL_COLORS } from './layout';

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

export function verifyEmailTemplate(link: string): RenderedEmail {
  const c = EMAIL_COLORS;

  const content = `
    <h1 style="margin:0 0 16px;font-size:22px;line-height:30px;font-weight:600;color:${c.charcoal};">
      Verify your email address
    </h1>
    <p style="margin:0 0 8px;font-size:15px;line-height:24px;color:${c.secondary};">
      Welcome to GridLearnia! Confirm this email address to continue setting
      up your account and unlock school onboarding.
    </p>
    ${emailButton('Verify my email', link)}
    <p style="margin:0 0 8px;font-size:13px;line-height:20px;color:${c.muted};">
      Or paste this link into your browser:
    </p>
    <p style="margin:0 0 24px;font-size:13px;line-height:20px;word-break:break-all;">
      <a href="${link}" style="color:${c.secondary};">${link}</a>
    </p>
    <hr style="border:0;border-top:1px solid ${c.edge};margin:0 0 16px;" />
    <p style="margin:0;font-size:12px;line-height:18px;color:${c.muted};">
      The link expires in 24 hours. If you didn&rsquo;t create this account,
      you can safely ignore this email.
    </p>`;

  return {
    subject: 'Verify your email — GridLearnia',
    text:
      `Welcome to GridLearnia!\n\n` +
      `Confirm your email address to continue setting up your account:\n\n` +
      `${link}\n\n` +
      `The link expires in 24 hours. If you didn't create this account, you can ignore this email.`,
    html: emailLayout({
      previewText: 'Confirm your email address to finish setting up GridLearnia.',
      content,
    }),
  };
}
