import { emailButton, emailLayout, EMAIL_COLORS } from './layout';
import { RenderedEmail } from './verify-email.template';

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

export function schoolApprovedTemplate(
  schoolName: string,
  link: string,
): RenderedEmail {
  const c = EMAIL_COLORS;
  const safeName = escapeHtml(schoolName);

  const content = `
    <h1 style="margin:0 0 16px;font-size:22px;line-height:30px;font-weight:600;color:${c.charcoal};">
      ${safeName} is approved 🎉
    </h1>
    <p style="margin:0 0 8px;font-size:15px;line-height:24px;color:${c.secondary};">
      Great news — your application was verified and approved. You&rsquo;re now
      the school&rsquo;s administrator and can start setting things up.
    </p>
    ${emailButton('Go to my dashboard', link)}
    <hr style="border:0;border-top:1px solid ${c.edge};margin:0 0 16px;" />
    <p style="margin:0;font-size:12px;line-height:18px;color:${c.muted};">
      You&rsquo;re receiving this because you applied to create a school on
      GridLearnia.
    </p>`;

  return {
    subject: `${schoolName} is approved — GridLearnia`,
    text:
      `Great news — your application for ${schoolName} was verified and approved.\n\n` +
      `You're now the school's administrator. Go to your dashboard to start setting things up:\n\n` +
      `${link}`,
    html: emailLayout({
      previewText: `${schoolName} was approved — you're the school administrator.`,
      content,
    }),
  };
}

export function schoolRejectedTemplate(
  schoolName: string,
  reason: string | null,
  attemptsLeft: number,
): RenderedEmail {
  const c = EMAIL_COLORS;
  const safeName = escapeHtml(schoolName);

  const attemptsCopy =
    attemptsLeft > 0
      ? `You can correct the details and apply again — you have ${attemptsLeft} ${attemptsLeft === 1 ? 'attempt' : 'attempts'} remaining.`
      : 'This account has reached the maximum number of applications. Contact support if you believe this is a mistake.';

  const content = `
    <h1 style="margin:0 0 16px;font-size:22px;line-height:30px;font-weight:600;color:${c.charcoal};">
      Your application was not approved
    </h1>
    <p style="margin:0 0 12px;font-size:15px;line-height:24px;color:${c.secondary};">
      We reviewed your application for <strong>${safeName}</strong> and could
      not approve it.
    </p>
    ${
      reason
        ? `<blockquote style="margin:0 0 16px;border-left:3px solid ${c.edge};padding:8px 0 8px 14px;font-size:14px;line-height:22px;color:${c.charcoal};white-space:pre-wrap;">${escapeHtml(reason)}</blockquote>`
        : ''
    }
    <p style="margin:0 0 24px;font-size:15px;line-height:24px;color:${c.secondary};">
      ${escapeHtml(attemptsCopy)}
    </p>
    <hr style="border:0;border-top:1px solid ${c.edge};margin:0 0 16px;" />
    <p style="margin:0;font-size:12px;line-height:18px;color:${c.muted};">
      You&rsquo;re receiving this because you applied to create a school on
      GridLearnia.
    </p>`;

  return {
    subject: `Your ${schoolName} application was not approved — GridLearnia`,
    text:
      `We reviewed your application for ${schoolName} and could not approve it.\n\n` +
      (reason ? `Reason:\n${reason}\n\n` : '') +
      attemptsCopy,
    html: emailLayout({
      previewText: `Your ${schoolName} application was not approved.`,
      content,
    }),
  };
}

export function schoolChangesRequestedTemplate(
  schoolName: string,
  comments: string,
  link: string,
): RenderedEmail {
  const c = EMAIL_COLORS;
  const safeName = escapeHtml(schoolName);
  const safeComments = escapeHtml(comments);

  const content = `
    <h1 style="margin:0 0 16px;font-size:22px;line-height:30px;font-weight:600;color:${c.charcoal};">
      Your application needs a few changes
    </h1>
    <p style="margin:0 0 12px;font-size:15px;line-height:24px;color:${c.secondary};">
      We reviewed your application for <strong>${safeName}</strong> and need
      some corrections before we can approve it. The reviewer left these
      comments:
    </p>
    <blockquote style="margin:0 0 16px;border-left:3px solid ${c.edge};padding:8px 0 8px 14px;font-size:14px;line-height:22px;color:${c.charcoal};white-space:pre-wrap;">${safeComments}</blockquote>
    <p style="margin:0 0 8px;font-size:15px;line-height:24px;color:${c.secondary};">
      Update the application and resubmit — we&rsquo;ll take another look
      right away.
    </p>
    ${emailButton('Update my application', link)}
    <hr style="border:0;border-top:1px solid ${c.edge};margin:0 0 16px;" />
    <p style="margin:0;font-size:12px;line-height:18px;color:${c.muted};">
      You&rsquo;re receiving this because you applied to create a school on
      GridLearnia.
    </p>`;

  return {
    subject: `Action needed on your ${schoolName} application — GridLearnia`,
    text:
      `We reviewed your application for ${schoolName} and need some corrections before we can approve it.\n\n` +
      `Reviewer comments:\n${comments}\n\n` +
      `Update the application and resubmit here:\n\n${link}`,
    html: emailLayout({
      previewText: `Your ${schoolName} application needs corrections before approval.`,
      content,
    }),
  };
}
