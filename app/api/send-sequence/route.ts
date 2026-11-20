import type { MailSettings } from '../../../lib/send-email';
import { env } from 'node:process';
import { mailboxSettings } from '../../../lib/mailboxes';
import { sendSequence } from '../../../lib/send-sequence';
export const maxDuration = 60;
export function POST(request: Request) {
  const settings = mailboxSettings(request, env as MailSettings);
  if (settings instanceof Response) return settings;
  return sendSequence(request, settings);
}
