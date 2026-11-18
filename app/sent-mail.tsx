"use client";

import { useEffect, useState } from "react";
import { Check, Inbox, Mail, MailOpen, PenLine, RefreshCw } from "lucide-react";
import { isDeleted, onInboxChange } from "./replies/read-state";

import type { Receipt } from "./receipts";

const labels: Record<string, [string, string, string]> = {
  accepted: ["Accepted", "neutral", "Resend accepted this message for sending."],
  queued: ["Queued", "neutral", "Resend is preparing to send this message."],
  scheduled: ["Scheduled", "neutral", "Resend has scheduled this message."],
  sent: ["Sent", "blue", "Resend sent the message toward the recipient’s mail server."],
  delivered: ["Delivered", "green", "The receiving mail server accepted the email. Folder placement is unknown."],
  opened: ["Opened", "green", "The tracking image loaded. Mail apps and privacy services can load it automatically."],
  clicked: ["Clicked", "green", "Resend recorded a tracked link click."],
  complained: ["Reported as spam", "red", "A mailbox provider reported a spam complaint for this message."],
  bounced: ["Bounced", "red", "The receiving mail server rejected the email."],
  delivery_delayed: ["Delivery delayed", "amber", "The receiving mail server temporarily delayed delivery."],
  failed: ["Failed", "red", "Resend reported that sending failed."],
  suppressed: ["Suppressed", "amber", "Resend skipped delivery to a suppressed address."],
  canceled: ["Canceled", "neutral", "The scheduled send was canceled."],
  unavailable: ["Status unavailable", "neutral", "Resend has no recognized delivery status available for this receipt."],
};

type Result = { events: Record<string, string> };
class StatusError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}
async function getEvents(ids: string[], signal: AbortSignal) {
  const query = new URLSearchParams({ view: "sent-status" });
  ids.forEach(id => query.append("receipt", id));
  const response = await fetch("/api/replies?" + query, { cache: "no-store", signal });
  if (!response.ok) {
    const result = await response.json() as { error?: string };
    throw new StatusError(result.error || "Could not refresh delivery status.", response.status);
  }
  return (await response.json() as Result).events;
}

export function SentMail({ history, onCompose }: { history: Receipt[]; onCompose: () => void }) {
  const [shown, setShown] = useState<string | null>(null);
  const [events, setEvents] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState("");
  const [locked, setLocked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    if (!history.length) return;
    let active: AbortController | null = null;
    const ids = [...new Set(history.map(r => r.id).filter(id => /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(id)))].slice(0, 30);
    if (!ids.length) return;
    let authenticated = true;
    function forget() {
      active?.abort(); active = null;
      authenticated = false; setEvents({}); setLocked(true); setBusy(false); setNotice("");
    }
    async function refresh() {
      if (document.hidden || active || !authenticated) return;
      const request = new AbortController();
      active = request; setBusy(true);
      try {
        const result = await getEvents(ids, request.signal);
        if (request.signal.aborted) return;
        setLocked(false); setNotice("");
        setEvents(previous => ({ ...previous, ...result }));
        // Older receipts may be outside the recent list. Retrieve them by their original IDs.
        for (const id of ids.filter(id => !Object.hasOwn(result, id))) {
          let event = "unavailable";
          if (ids.length > 1) {
            await new Promise(resolve => setTimeout(resolve, 350));
            if (request.signal.aborted) return;
            const older = await getEvents([id], request.signal);
            if (request.signal.aborted) return;
            event = older[id] || event;
          }
          setEvents(previous => ({ ...previous, [id]: event }));
        }
      } catch (error) {
        if (request.signal.aborted) return;
        if (error instanceof StatusError && error.status === 401) forget();
        else setNotice(error instanceof Error ? error.message : "Could not refresh delivery status.");
      } finally {
        if (active === request) { active = null; setBusy(false); }
      }
    }
    function resume() { if (!document.hidden) { authenticated = true; void refresh(); } }
    const unsubscribe = onInboxChange(change => {
      if (change === "deleted") setRevision(value => value + 1);
      if (change === "lock") forget();
      if (change === "unlock") resume();
    });
    void refresh();
    const timer = window.setInterval(refresh, 60000);
    document.addEventListener("visibilitychange", resume);
    return () => { active?.abort(); unsubscribe(); clearInterval(timer); document.removeEventListener("visibilitychange", resume); };
  }, [history, revision]);

  const visibleHistory = history.filter(receipt => !isDeleted(receipt.id));
  return <section className="card sent"><header className="card-heading"><span className="tile"><Inbox/></span><h2>Sent messages</h2>
    <span className="count">{visibleHistory.length}</span>
    {visibleHistory.length > 0 && <button type="button" className="inbox-control" disabled={busy} onClick={() => setRevision(r => r + 1)}><RefreshCw size={14}/>{busy ? "Updating…" : "Refresh"}</button>}
  </header>
    {locked && <p className="sent-notice"><a href="/replies">Unlock Replies</a> to see the latest delivery status.</p>}
    {notice && <p className="sent-notice" role="status">{notice} Showing the last known status.</p>}
    {visibleHistory.length === 0 ? <div className="empty"><MailOpen size={38}/><h3>No sent messages yet</h3><p>Your sent messages will appear here after Resend accepts them.</p><button className="primary" onClick={onCompose}><PenLine size={16}/>Compose email</button></div> :
      visibleHistory.map(r => {
        const event = events[r.id] || "accepted";
        const [label, color, description] = Object.hasOwn(labels, event) ? labels[event] : labels.unavailable;
        return <article className="receipt sent-receipt" key={r.id}>
          <button type="button" aria-expanded={shown === r.id} onClick={() => setShown(shown === r.id ? null : r.id)}>
            <Mail size={18}/><span className="sent-summary"><b>{r.subject}</b><small>{r.to}</small></span>
            <span className={"delivery-label " + color} title={description}>{label}</span><time>{new Date(r.at).toLocaleDateString()}</time>
          </button>
          {shown === r.id && <div className="details"><small>From {r.from}</small>{r.cc && <small>Cc {r.cc}</small>}{r.bcc && <small>Bcc {r.bcc}</small>}<p>{r.message}</p><small>{description}</small><small><Check size={14}/> Accepted · {r.id}</small></div>}
        </article>;
      })}
    {visibleHistory.length > 0 && <details className="status-guide"><summary>About delivery labels</summary>
      <p>Each label shows the latest event for the whole message. Delivered means the receiving server accepted it. Only the recipient’s provider knows which folder it landed in. Reported as spam means a complaint reached Resend.</p>
      <p>Opened means a tracking image loaded. Privacy tools can load it automatically or block it. To record opens on new emails, enable open tracking for your sending domain. <a href="https://resend.com/docs/dashboard/domains/tracking" target="_blank" rel="noreferrer">Tracking settings guide</a></p>
    </details>}
  </section>;
}
