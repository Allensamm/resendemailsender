export function currentMailbox(): "samantha" | "design" {
  return typeof window !== "undefined" && new URLSearchParams(window.location.search).get("mailbox") === "design" ? "design" : "samantha";
}
export function mailboxKey(key: string) {
  return currentMailbox() === "design" ? key + ".design" : key;
}
export function mailboxUrl(path: string, mailbox = currentMailbox()) {
  const url = new URL(path, "https://letterpress.local");
  if (mailbox === "design") url.searchParams.set("mailbox", "design");
  else url.searchParams.delete("mailbox");
  return url.pathname + url.search + url.hash;
}
export function mailboxFetch(path: string, init?: RequestInit) {
  return fetch(mailboxUrl(path), init);
}
