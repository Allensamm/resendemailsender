import { mailboxKey } from "./mailbox.ts";
import type { EmailSignature } from "../lib/signature";
export type Draft = { to: string; cc: string; bcc: string; subject: string; message: string; scheduledAt?: string };
export type Receipt = Draft & {
  id: string; at: string; from: string; canceled?: boolean; signature?: EmailSignature;
  threadId?: string;
  parent?: { id: string; from: string; date: string };
};

const historyKey = "letterpress.receipts.v1";
export function isDraft(value: unknown): value is Draft {
  return Boolean(value && typeof value === "object" &&
    ((value as Record<string, unknown>).scheduledAt === undefined || typeof (value as Record<string, unknown>).scheduledAt === "string") &&
    ["to", "cc", "bcc", "subject", "message"].every(k => typeof (value as Record<string, unknown>)[k] === "string"));
}

export function readReceipts(): Receipt[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(mailboxKey(historyKey)) || "[]");
    return Array.isArray(value) ? value.filter(r => isDraft(r) &&
      ["id", "at", "from"].every(k => typeof (r as Record<string, unknown>)[k] === "string")) : [];
  } catch { return []; }
}

export function saveReceipt(receipt: Receipt, fallback: Receipt[] = []) {
  const stored = readReceipts();
  const all = [receipt, ...(stored.length ? stored : fallback).filter(r => r.id !== receipt.id)];
  // Keep future schedules visible even after 30 more messages are composed.
  let ordinary = 0;
  const records = all.filter(r => (r.scheduledAt && !r.canceled && Date.parse(r.scheduledAt) > Date.now()) || ordinary++ < 30);
  try { localStorage.setItem(mailboxKey(historyKey), JSON.stringify(records)); } catch { /* Keep this view usable without storage. */ }
  return records;
}
