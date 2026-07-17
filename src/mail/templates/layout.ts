/**
 * Shared branded shell for all outbound emails. Mirrors the frontend
 * design tokens (globals.css): charcoal #1f2937 + lime #a3e635 accent on a
 * soft-gray page with white cards.
 *
 * Email-client constraints: table layout, fully inline styles, system font
 * stack — Gmail/Outlook strip <style> blocks and ignore web fonts.
 */

export const EMAIL_COLORS = {
  background: '#f3f4f6', // page
  card: '#ffffff', // content surface
  edge: '#e5e7eb', // borders
  charcoal: '#1f2937', // brand dark / primary text
  charcoalDeep: '#111827',
  accent: '#a3e635', // lime CTA
  accentText: '#1f2937', // lime is light — label stays charcoal
  secondary: '#4b5563',
  muted: '#6b7280',
};

const FONT_STACK =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

export interface EmailLayoutOptions {
  /** Hidden inbox preview line shown next to the subject. */
  previewText: string;
  /** Inner HTML of the white content card. */
  content: string;
}

export function emailLayout({ previewText, content }: EmailLayoutOptions): string {
  const c = EMAIL_COLORS;
  return `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:0;background-color:${c.background};font-family:${FONT_STACK};">
    <!-- inbox preview text (hidden in the body) -->
    <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${previewText}</div>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${c.background};">
      <tr>
        <td align="center" style="padding:32px 16px;">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;">

            <!-- header: charcoal band with the wordmark -->
            <tr>
              <td style="background-color:${c.charcoal};border-radius:16px 16px 0 0;padding:24px 40px;">
                <span style="font-size:22px;font-weight:bold;color:#ffffff;letter-spacing:-0.02em;">Grid<span style="color:${c.accent};">Learnia</span></span>
              </td>
            </tr>

            <!-- body card -->
            <tr>
              <td style="background-color:${c.card};border:1px solid ${c.edge};border-top:0;border-radius:0 0 16px 16px;padding:40px;">
                ${content}
              </td>
            </tr>

            <!-- footer -->
            <tr>
              <td align="center" style="padding:24px 40px;">
                <p style="margin:0;font-size:12px;line-height:18px;color:${c.muted};">
                  GridLearnia — One Platform. Limitless Learning.
                </p>
              </td>
            </tr>

          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

/** Bulletproof lime CTA button (table-based so Outlook renders the padding). */
export function emailButton(label: string, href: string): string {
  const c = EMAIL_COLORS;
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:28px 0;">
    <tr>
      <td style="background-color:${c.accent};border-radius:12px;">
        <a href="${href}" target="_blank"
           style="display:inline-block;padding:14px 32px;font-size:15px;font-weight:600;color:${c.accentText};text-decoration:none;border-radius:12px;">
          ${label}
        </a>
      </td>
    </tr>
  </table>`;
}
