import { mailboxKey } from "../mailbox";
const readPrefix = "letterpress.reply.read.";
const sessionKey = "letterpress.inbox.session-change";
const eventName = "letterpress-inbox-change";
const memory = new Set<string>();

export function wasRead(id: string) {
  try { return memory.has(mailboxKey(id)) || localStorage.getItem(mailboxKey(readPrefix + id)) === "1"; }
  catch { return memory.has(mailboxKey(id)); }
}

export function markRead(id: string) {
  if (wasRead(id)) return;
  memory.add(mailboxKey(id));
  try { localStorage.setItem(mailboxKey(readPrefix + id), "1"); } catch { /* Keep this tab's read state. */ }
  window.dispatchEvent(new CustomEvent(eventName, { detail: "read" }));
}

type Change = "deleted" | "read" | "unlock" | "lock";

export function sessionChanged(change: "unlock" | "lock") {
  try { localStorage.setItem(sessionKey, change + "/" + Date.now()); } catch { /* Notify this tab below. */ }
  window.dispatchEvent(new CustomEvent(eventName, { detail: change }));
}

export function onInboxChange(listener: (change: Change) => void) {
  function local(event: Event) { listener((event as CustomEvent<Change>).detail); }
  function remote(event: StorageEvent) {
    if (event.key?.startsWith("letterpress.reply.deleted.")) listener("deleted");
    if (event.key?.startsWith(readPrefix)) listener("read");
    if (event.key === sessionKey) listener(event.newValue?.startsWith("unlock/") ? "unlock" : "lock");
  }
  window.addEventListener(eventName, local);
  window.addEventListener("storage", remote);
  return () => {
    window.removeEventListener(eventName, local);
    window.removeEventListener("storage", remote);
  };
}

const deletedPrefix = "letterpress.reply.deleted.";
export function isDeleted(id: string) {
  try { return localStorage.getItem(mailboxKey(deletedPrefix + id)) === "1"; }
  catch { return false; }
}
export function setDeleted(ids: string[], hidden: boolean) {
  // Fail visibly when persistence is unavailable rather than promising a saved deletion.
  for (const id of ids) {
    if (hidden) localStorage.setItem(mailboxKey(deletedPrefix + id), "1");
    else localStorage.removeItem(mailboxKey(deletedPrefix + id));
  }
  window.dispatchEvent(new CustomEvent(eventName, { detail: "deleted" }));
}
