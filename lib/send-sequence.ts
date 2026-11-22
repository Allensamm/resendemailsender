import { emailBody } from "./email-body.ts";
import { Resend } from 'resend';
import { validateAttachments } from './attachments.ts';
import { senderAddress, replyMailbox, type MailSettings } from './send-email.ts';

export async function sendSequence(request: Request, settings: MailSettings) {
  const fail = (error: string, status = 400) => Response.json({ error }, { status });
  const mailbox = new URL(request.url).searchParams.get('mailbox');
  if (mailbox !== 'allen' && mailbox !== 'design') return fail('Individual sequences are available in Allen Samuel and Design mailboxes only.');
  if (request.headers.get('origin') && request.headers.get('origin') !== new URL(request.url).origin) return fail('Request origin is invalid.', 403);
  let raw: unknown;
  try { raw = await request.json(); } catch { return fail('Invalid message.'); }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return fail("Invalid message.");
  const data = raw as Record<string, unknown>;
  const token = request.headers.get('idempotency-key');
  if (!token || !/^[\w/-]{1,200}$/.test(token)) return fail('A request identifier is required.');
  if (!data || !Array.isArray(data.recipients) || !data.recipients.length || data.recipients.length > 20) return fail('Enter between 1 and 20 recipients.');
  const recipients: string[] = data.recipients;
  if (recipients.some(address => typeof address !== 'string' || address.length > 254 || !/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(address))) return fail('Enter one valid email address per box.');
  if (new Set(recipients.map(address => address.toLowerCase())).size !== recipients.length) return fail('Remove duplicate recipient addresses.');
  if (typeof data.subject !== 'string' || !data.subject.trim() || data.subject.length > 500 || /[\r\n]/.test(data.subject)) return fail('Enter a valid subject.');
  if (typeof data.message !== 'string' || !data.message.trim() || data.message.length > 50000) return fail('Enter a message of up to 50,000 characters.');
  if (data.intervalMinutes !== undefined && data.intervalMinutes !== 1 && data.intervalMinutes !== 4) return fail('Invalid batch interval.');
  // Legacy saved Design batches omit this field; preserve their original retry payloads.
  const intervalMinutes = data.intervalMinutes === 1 ? 1 : 4;
  const start = typeof data.startedAt === 'string' ? Date.parse(data.startedAt) : NaN;
  // Retries keep exactly the same timestamps and provider keys, including past slots.
  // Never convert an expired scheduled slot into an immediate send.
  if (!Number.isFinite(start) || start > Date.now() + 60000 || start < Date.now() - 23 * 3600000) return fail('This sequence has expired. Check Sent mail before starting another.');
  let attachments;
  try { attachments = validateAttachments(data.attachments); } catch (error) { return fail(error instanceof Error ? error.message : 'Invalid attachments.'); }
  const from = senderAddress(settings), replyTo = replyMailbox(settings);
  if (!settings.RESEND_API_KEY || !from || !replyTo) return fail('Configure the sender and Resend key first.', 503);
  const resend = new Resend(settings.RESEND_API_KEY);
  const receipts: { id: string; to: string; scheduledAt: string }[] = [];
  let body;
  try { body = emailBody(data.message, data.messageHtml); } catch (error) { return fail(error instanceof Error ? error.message : "Invalid message."); }
  const deadline = Date.now() + 45000;
  for (let index = 0; index < recipients.length; index++) {
    if (Date.now() > deadline) return Response.json({ receipts, error: 'Some schedules still need confirmation. Retry to continue safely.' });
    const scheduledAt = new Date(start + 120000 + (mailbox === 'design' ? index * intervalMinutes * 60000 : recipients.length === 1 ? 0 : Math.round(index * 1080000 / (recipients.length - 1)))).toISOString();
    try {
      const { data: sent, error } = await resend.emails.send({ from, replyTo, to: [recipients[index]], subject: data.subject.trim(), text: body.text, html: body.html, scheduledAt, ...(attachments.length ? { attachments } : {}) }, { idempotencyKey: token + '/' + index, signal: AbortSignal.timeout(10000) });
      if (error || !sent?.id) return Response.json({ receipts, error: error?.message || 'Could not confirm this schedule. Retry safely.' });
      receipts.push({ id: sent.id, to: recipients[index], scheduledAt });
    } catch { return Response.json({ receipts, error: 'Connection interrupted. Retry to confirm the same schedules.' }); }
    if (index < recipients.length - 1) await new Promise(resolve => setTimeout(resolve, 650));
  }
  return Response.json({ receipts });
}
