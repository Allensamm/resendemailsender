import { env } from 'node:process';
import { mailboxSettings } from '../../../../lib/mailboxes';
import { resolveSentTarget } from '../../../../lib/read-replies';
import { sendEmail, senderAddress, type MailSettings } from '../../../../lib/send-email';
export async function POST(request: Request) {
  const settings = mailboxSettings(request, env as MailSettings);
  if (settings instanceof Response) return settings;
  const thread = await resolveSentTarget(request, {password:env.INBOX_PASSWORD, apiKey:settings.RESEND_API_KEY, sender:senderAddress(settings)});
  if (thread instanceof Response) return thread;
  const response = await sendEmail(request, settings, thread);
  if (!response.ok) return response;
  return Response.json({...await response.json() as Record<string, unknown>, threadId:thread.threadId});
}
