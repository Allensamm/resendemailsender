"use client";
import { mailboxFetch } from "../mailbox";

import { useEffect, useState } from "react";
import { isDeleted, onInboxChange, wasRead } from "./read-state";

type BadgePage = { ids: string[]; next: string | null };

export function ReplyBadge() {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    let request: AbortController | null = null;
    let known = new Set<string>();
    let more = false;
    let locked = false;
    const unread = (ids: Set<string>) => {
      let total = 0;
      for (const id of ids) if (!wasRead(id) && !isDeleted(id)) total++;
      return total;
    };
    function clear() {
      request?.abort(); request = null;
      known.clear(); more = false; setCount(null);
    }
    async function refresh() {
      if (document.hidden || request || locked) return;
      const current = new AbortController();
      request = current;
      const ids = new Set<string>();
      let after: string | null = null;
      const cursors = new Set<string>();
      try {
        do {
          const query = new URLSearchParams({ view: "badge" });
          if (after) query.set("after", after);
          const response = await mailboxFetch("/api/replies?" + query, { cache: "no-store", signal: current.signal });
          if (current.signal.aborted) return;
          if (!response.ok) {
            if (response.status === 401 || response.status === 503) { locked = true; clear(); }
            return;
          }
          const page = await response.json() as BadgePage;
          if (current.signal.aborted) return;
          for (const id of page.ids) ids.add(id);
          after = page.next;
          if (after && cursors.has(after)) return;
          if (after) cursors.add(after);
        } while (after && unread(ids) < 100);
        known = ids; more = Boolean(after); setCount(unread(ids));
      } catch { /* Keep the previous count until the next successful refresh. */ }
      finally { if (request === current) request = null; }
    }
    function suspend() { clear(); }
    function resume() { if (!document.hidden) { locked = false; void refresh(); } }
    const unsubscribe = onInboxChange(change => {
      if (change === "lock") { locked = true; clear(); }
      if (change === "unlock") { clear(); locked = false; void refresh(); }
      if (change === "read" || change === "deleted") {
        const value = unread(known);
        setCount(previous => previous === null ? null : value);
        if (more && value < 100) void refresh();
      }
    });
    void refresh();
    const timer = window.setInterval(refresh, 15000);
    window.addEventListener("focus", resume);
    window.addEventListener("pageshow", resume);
    window.addEventListener("pagehide", suspend);
    document.addEventListener("visibilitychange", resume);
    return () => {
      request?.abort(); unsubscribe(); window.clearInterval(timer);
      window.removeEventListener("focus", resume);
      window.removeEventListener("pageshow", resume);
      window.removeEventListener("pagehide", suspend);
      document.removeEventListener("visibilitychange", resume);
    };
  }, []);

  if (count === null) return null;
  const display = count > 99 ? "99+" : String(count);
  return <span className="reply-badge" role="status" aria-live="polite" aria-atomic="true" title="Unread replies · checks every 15 seconds while this page is open" aria-label={display + " unread replies"}>{display}</span>;
}
