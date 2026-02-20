// ---------------------------------------------------------------------------
// Email delivery via SendGrid
// ---------------------------------------------------------------------------

const SENDGRID_API_URL = 'https://api.sendgrid.com/v3/mail/send';
const FROM_EMAIL = process.env.SENDGRID_FROM_EMAIL ?? 'notifications@buildo.app';
const FROM_NAME = process.env.SENDGRID_FROM_NAME ?? 'Buildo';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EmailPayload {
  to: string;
  subject: string;
  html: string;
}

// ---------------------------------------------------------------------------
// Sending
// ---------------------------------------------------------------------------

/**
 * Send a single email through the SendGrid v3 Mail Send API.
 *
 * If the `SENDGRID_API_KEY` environment variable is not set the call is
 * skipped and the function returns `false` (useful during local development).
 *
 * @returns `true` if SendGrid accepted the message (HTTP 2xx), `false` otherwise.
 */
export async function sendEmail(payload: EmailPayload): Promise<boolean> {
  const apiKey = process.env.SENDGRID_API_KEY;

  if (!apiKey) {
    console.warn(
      '[notifications/email] SENDGRID_API_KEY is not set -- skipping email delivery.',
      { to: payload.to, subject: payload.subject }
    );
    return false;
  }

  try {
    const response = await fetch(SENDGRID_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [
          {
            to: [{ email: payload.to }],
          },
        ],
        from: {
          email: FROM_EMAIL,
          name: FROM_NAME,
        },
        subject: payload.subject,
        content: [
          {
            type: 'text/html',
            value: payload.html,
          },
        ],
      }),
    });

    if (response.ok) {
      return true;
    }

    const errorBody = await response.text();
    console.error(
      `[notifications/email] SendGrid returned ${response.status}:`,
      errorBody
    );
    return false;
  } catch (err) {
    console.error('[notifications/email] Failed to send email:', err);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Email template builders
// ---------------------------------------------------------------------------

/**
 * Build the subject and HTML body for a "new lead" notification email.
 */
export function buildNewLeadEmail(permit: {
  address: string;
  permit_type: string;
  description: string;
  trades: string[];
}): { subject: string; html: string } {
  const tradeList = permit.trades.length > 0
    ? permit.trades.join(', ')
    : 'General';

  const subject = `New Lead: ${permit.permit_type} at ${permit.address}`;

  const html = `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8" /></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background:#f4f4f7;color:#333;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;">
    <tr>
      <td style="background:#2563eb;padding:24px 32px;">
        <h1 style="margin:0;font-size:20px;color:#fff;">New Permit Lead</h1>
      </td>
    </tr>
    <tr>
      <td style="padding:32px;">
        <p style="margin:0 0 16px;font-size:16px;line-height:1.5;">
          A new permit matching your preferences has been filed:
        </p>
        <table width="100%" cellpadding="8" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:6px;font-size:14px;">
          <tr style="background:#f9fafb;">
            <td style="font-weight:600;width:120px;">Address</td>
            <td>${escapeHtml(permit.address)}</td>
          </tr>
          <tr>
            <td style="font-weight:600;">Type</td>
            <td>${escapeHtml(permit.permit_type)}</td>
          </tr>
          <tr style="background:#f9fafb;">
            <td style="font-weight:600;">Trades</td>
            <td>${escapeHtml(tradeList)}</td>
          </tr>
          <tr>
            <td style="font-weight:600;">Description</td>
            <td>${escapeHtml(truncate(permit.description, 200))}</td>
          </tr>
        </table>
        <p style="margin:24px 0 0;">
          <a href="${process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.buildo.app'}/leads"
             style="display:inline-block;padding:12px 24px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;">
            View Lead
          </a>
        </p>
      </td>
    </tr>
    <tr>
      <td style="padding:16px 32px;font-size:12px;color:#9ca3af;border-top:1px solid #e5e7eb;">
        You received this email because of your notification preferences on Buildo.
        <a href="${process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.buildo.app'}/settings/notifications"
           style="color:#6b7280;">Manage preferences</a>
      </td>
    </tr>
  </table>
</body>
</html>`.trim();

  return { subject, html };
}

/**
 * Build the subject and HTML body for a daily or weekly digest email.
 */
export function buildDigestEmail(
  leads: { address: string; trades: string[]; score: number }[]
): { subject: string; html: string } {
  const count = leads.length;
  const subject = `Your Buildo Digest: ${count} new lead${count === 1 ? '' : 's'}`;

  const leadRows = leads
    .map(
      (lead) => `
        <tr>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">
            ${escapeHtml(lead.address)}
          </td>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">
            ${escapeHtml(lead.trades.length > 0 ? lead.trades.join(', ') : 'General')}
          </td>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:center;">
            <span style="display:inline-block;padding:2px 8px;border-radius:12px;font-size:12px;font-weight:600;${scoreStyle(lead.score)}">
              ${lead.score}
            </span>
          </td>
        </tr>`
    )
    .join('');

  const html = `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8" /></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background:#f4f4f7;color:#333;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;">
    <tr>
      <td style="background:#2563eb;padding:24px 32px;">
        <h1 style="margin:0;font-size:20px;color:#fff;">Your Permit Digest</h1>
      </td>
    </tr>
    <tr>
      <td style="padding:32px;">
        <p style="margin:0 0 16px;font-size:16px;line-height:1.5;">
          ${count} new lead${count === 1 ? '' : 's'} matched your preferences since your last digest:
        </p>
        <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:6px;font-size:14px;">
          <thead>
            <tr style="background:#f9fafb;">
              <th style="padding:10px 12px;text-align:left;font-weight:600;">Address</th>
              <th style="padding:10px 12px;text-align:left;font-weight:600;">Trades</th>
              <th style="padding:10px 12px;text-align:center;font-weight:600;">Score</th>
            </tr>
          </thead>
          <tbody>
            ${leadRows}
          </tbody>
        </table>
        <p style="margin:24px 0 0;">
          <a href="${process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.buildo.app'}/leads"
             style="display:inline-block;padding:12px 24px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;">
            View All Leads
          </a>
        </p>
      </td>
    </tr>
    <tr>
      <td style="padding:16px 32px;font-size:12px;color:#9ca3af;border-top:1px solid #e5e7eb;">
        You received this email because of your notification preferences on Buildo.
        <a href="${process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.buildo.app'}/settings/notifications"
           style="color:#6b7280;">Manage preferences</a>
      </td>
    </tr>
  </table>
</body>
</html>`.trim();

  return { subject, html };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Escape HTML special characters to prevent XSS in email templates. */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Truncate a string to a maximum length, appending an ellipsis if needed. */
function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength).trimEnd() + '...';
}

/** Return inline CSS colour values for a lead score badge. */
function scoreStyle(score: number): string {
  if (score >= 70) return 'background:#dcfce7;color:#166534;';
  if (score >= 40) return 'background:#fef9c3;color:#854d0e;';
  return 'background:#fee2e2;color:#991b1b;';
}
