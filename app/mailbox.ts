export type Mailbox = "samantha" | "design" | "allen";
export function currentMailbox(): Mailbox {
  const selected = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("mailbox") : null;
  return selected === "design" || selected === "allen" ? selected : "samantha";
}
export function mailboxKey(key: string) {
  return currentMailbox() === "samantha" ? key : key + "." + currentMailbox();
}
export function mailboxUrl(path: string, mailbox = currentMailbox()) {
  const url = new URL(path, "https://letterpress.local");
  if (mailbox !== "samantha") url.searchParams.set("mailbox", mailbox);
  else url.searchParams.delete("mailbox");
  return url.pathname + url.search + url.hash;
}
export function mailboxFetch(path: string, init?: RequestInit) {
  return fetch(mailboxUrl(path), init);
}
