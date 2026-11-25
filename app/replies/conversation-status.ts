import type { ReplyBody, ReplySummary } from '../../lib/read-replies';
import type { Receipt } from '../receipts';

export function conversationStatus(messages: ReplySummary[], bodies: Record<string, ReplyBody>, receipts: Receipt[], wasRead: (id: string) => boolean): 'unread' | 'read' | 'replied' {
  if (messages.some(message => !wasRead(message.id))) return 'unread';
  const ids = new Set(messages.map(message => message.id));
  const references = new Set(messages.flatMap(message => [bodies[message.id]?.threadId, ...(bodies[message.id]?.referenceIds || [])]).filter(Boolean));
  const latest = Math.max(...messages.map(message => Date.parse(message.date)));
  const replied = receipts.some(receipt => !receipt.canceled && !receipt.scheduledAt && Date.parse(receipt.at) >= latest &&
    ((receipt.parent && ids.has(receipt.parent.id)) || (receipt.threadId && references.has(receipt.threadId))));
  return replied ? 'replied' : 'read';
}
