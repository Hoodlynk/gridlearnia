import { emailLayout, EMAIL_COLORS } from './layout';
import { RenderedEmail } from './verify-email.template';

/** Notify a teacher whether their timetable swap request was approved. */
export function timetableSwapTemplate(
  firstName: string,
  lesson: string,
  outcome: 'approved' | 'rejected',
  note?: string,
): RenderedEmail {
  const c = EMAIL_COLORS;
  const approved = outcome === 'approved';
  const heading = approved ? 'Your swap was approved' : 'Your swap wasn’t approved';

  const content = `
    <h1 style="margin:0 0 16px;font-size:22px;line-height:30px;font-weight:600;color:${c.charcoal};">
      ${heading}
    </h1>
    <p style="margin:0 0 8px;font-size:15px;line-height:24px;color:${c.secondary};">
      Hi ${escapeHtml(firstName)}, your request to reschedule
      <strong>${escapeHtml(lesson)}</strong> was <strong>${outcome}</strong>.
    </p>
    ${
      note
        ? `<p style="margin:0 0 8px;font-size:14px;line-height:22px;color:${c.secondary};">
             Note from the reviewer: “${escapeHtml(note)}”
           </p>`
        : ''
    }
    <p style="margin:16px 0 0;font-size:13px;line-height:20px;color:${c.muted};">
      ${approved ? 'Your timetable has been updated.' : 'Your timetable is unchanged.'}
    </p>`;

  return {
    subject: `Timetable swap ${outcome} — GridLearnia`,
    text:
      `Hi ${firstName}, your request to reschedule ${lesson} was ${outcome}.` +
      (note ? `\n\nNote: ${note}` : '') +
      `\n\n${approved ? 'Your timetable has been updated.' : 'Your timetable is unchanged.'}`,
    html: emailLayout({
      previewText: `Your timetable swap was ${outcome}`,
      content,
    }),
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
