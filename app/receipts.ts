export type Draft = { to: string; cc: string; bcc: string; subject: string; message: string };
export type Receipt = Draft & {
  id: string; at: string; from: string;
  threadId?: string;
  parent?: { id: string; from: string; date: string };
};

const historyKey = "letterpress.receipts.v1";
export function isDraft(value: unknown): value is Draft {
  return Boolean(value && typeof value === "object" &&
    ["to", "cc", "bcc", "subject", "message"].every(k => typeof (value as Record<string, unknown>)[k] === "string"));
}

export function readReceipts(): Receipt[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(historyKey) || "[]");
    return Array.isArray(value) ? value.filter(r => isDraft(r) &&
      ["id", "at", "from"].every(k => typeof (r as Record<string, unknown>)[k] === "string")) : [];
  } catch { return []; }
}

export function saveReceipt(receipt: Receipt, fallback: Receipt[] = []) {
  const stored = readReceipts();
  const records = [receipt, ...(stored.length ? stored : fallback).filter(r => r.id !== receipt.id)].slice(0, 30);
  try { localStorage.setItem(historyKey, JSON.stringify(records)); } catch { /* Keep this view usable without storage. */ }
  return records;
}
