import { emailLayout, EMAIL_COLORS } from './layout';
import { RenderedEmail } from './verify-email.template';

export function loginCodeTemplate(
  code: string,
  ttlMinutes: number,
): RenderedEmail {
  const c = EMAIL_COLORS;

  const content = `
    <h1 style="margin:0 0 16px;font-size:22px;line-height:30px;font-weight:600;color:${c.charcoal};">
      Your sign-in code
    </h1>
    <p style="margin:0 0 8px;font-size:15px;line-height:24px;color:${c.secondary};">
      Enter this code to finish signing in to GridLearnia:
    </p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:28px 0;">
      <tr>
        <td style="background-color:${c.background};border:1px solid ${c.edge};border-radius:12px;padding:16px 32px;">
          <span style="font-size:32px;line-height:40px;font-weight:700;letter-spacing:0.35em;color:${c.charcoalDeep};font-family:'SF Mono',Menlo,Consolas,monospace;">${code}</span>
        </td>
      </tr>
    </table>
    <hr style="border:0;border-top:1px solid ${c.edge};margin:0 0 16px;" />
    <p style="margin:0;font-size:12px;line-height:18px;color:${c.muted};">
      The code expires in ${ttlMinutes} minutes and can be used once. If you
      didn&rsquo;t try to sign in, change your password now &mdash; someone may
      know it.
    </p>`;

  return {
    subject: `${code} is your GridLearnia sign-in code`,
    text:
      `Your GridLearnia sign-in code is: ${code}\n\n` +
      `Enter it to finish signing in. The code expires in ${ttlMinutes} minutes and can be used once.\n\n` +
      `If you didn't try to sign in, change your password now — someone may know it.`,
    html: emailLayout({
      previewText: 'Enter this code to finish signing in to GridLearnia.',
      content,
    }),
  };
}
