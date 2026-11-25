// Keep quoted history out of the newest bubble. Only recognizable email headers
// become earlier messages; ordinary prose (including inline answers) is preserved.
export function splitChatText(text: string): { text: string; history: { sender: string; text: string }[] } {
  const clean = text.replace(/\r\n/g, '\n');
  const marker = /(?:^|\n)\s*On ([\s\S]{1,500}?)wrote:\s*\n/i.exec(clean);
  if (!marker) return { text: clean.trim(), history: [] };
  const header = marker[1].replace(/\s+/g, ' ').trim();
  const email = header.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0];
  if (!email) return { text: clean.trim(), history: [] };
  const quoted = clean.slice(marker.index + marker[0].length).split('\n').map(line => line.replace(/^\s*> ?/, '')).join('\n');
  const earlier = splitChatText(quoted);
  return { text: clean.slice(0, marker.index).trim(), history: [...earlier.history, ...(earlier.text ? [{ sender: email, text: earlier.text }] : [])] };
}
export function chatTextKey(text: string) { return splitChatText(text).text.replace(/\s+/g, ' ').trim().toLowerCase(); }
