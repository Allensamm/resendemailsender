import type { ReplyBody, ReplySummary } from "../../lib/read-replies";

export type Conversation = { id: string; messages: ReplySummary[] };

// Join by actual Internet Message-IDs, never just a matching subject or sender.
export function groupReplies(messages: ReplySummary[], bodies: Record<string, ReplyBody>): Conversation[] {
  const parents = new Map<string, string>();
  function root(id: string): string {
    const parent = parents.get(id);
    if (!parent) { parents.set(id, id); return id; }
    if (parent === id) return id;
    const result = root(parent); parents.set(id, result); return result;
  }
  for (const message of messages) {
    const body = bodies[message.id];
    for (const ref of new Set([...(body?.referenceIds || []), ...(body?.threadId ? [body.threadId] : [])])) {
      parents.set(root("mail:" + ref), root(message.id));
    }
  }
  const groups = new Map<string, Conversation>();
  for (const message of messages) {
    const id = root(message.id);
    if (!groups.has(id)) groups.set(id, { id, messages: [] });
    groups.get(id)!.messages.push(message);
  }
  return [...groups.values()].map(group => ({ ...group, messages: group.messages.sort((a, b) => Date.parse(a.date) - Date.parse(b.date)) }))
    .sort((a, b) => Date.parse(b.messages.at(-1)!.date) - Date.parse(a.messages.at(-1)!.date));
}
