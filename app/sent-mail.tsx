"use client";
import dynamic from "next/dynamic";
const SentFollowUp = dynamic(() => import("./sent-follow-up").then(module => module.SentFollowUp), { loading: () => <p>Loading follow-up composer…</p> });
import { MessageContent } from "./rich-composer";
import { mailboxFetch, mailboxUrl } from "./mailbox";

import { useEffect, useRef, useState } from "react";
import { Check, Inbox, Mail, MailOpen, PenLine, RefreshCw } from "lucide-react";
import { SignaturePreview } from "./email-signature";
import { isDeleted, onInboxChange } from "./replies/read-state";

import { saveReceipt, type Receipt } from "./receipts";

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
  const response = await mailboxFetch("/api/replies?" + query, { cache: "no-store", signal });
  if (!response.ok) {
    const result = await response.json() as { error?: string };
    throw new StatusError(result.error || "Could not refresh delivery status.", response.status);
  }
  return (await response.json() as Result).events;
}

export function SentMail({ history, onCompose, onHistory }: { history: Receipt[]; onCompose: () => void; onHistory: (history: Receipt[]) => void }) {
  const [shown, setShown] = useState<string | null>(null);
  const [events, setEvents] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState("");
  const [locked, setLocked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    if (!history.length) return;
    let active: AbortController | null = null;
    const ids = [...new Set(history.map(r => r.id).filter(id => /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(id)))];
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
        const result: Record<string, string> = {};
        for (let offset = 0; offset < ids.length; offset += 30) {
          if (offset) await new Promise(resolve => setTimeout(resolve, 350));
          if (request.signal.aborted) return;
          Object.assign(result, await getEvents(ids.slice(offset, offset + 30), request.signal));
        }
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
    {locked && <p className="sent-notice"><a href={mailboxUrl("/replies")}>Unlock Replies</a> to see the latest delivery status.</p>}
    {notice && <p className="sent-notice" role="status">{notice} Showing the last known status.</p>}
    {visibleHistory.length === 0 ? <div className="empty"><MailOpen size={38}/><h3>No sent messages yet</h3><p>Your sent messages will appear here after Resend accepts them.</p><button className="primary" onClick={onCompose}><PenLine size={16}/>Compose email</button></div> :
      visibleHistory.map(r => {
        const event = r.canceled ? "canceled" : events[r.id] || (r.scheduledAt ? "scheduled" : "accepted");
        const [label, color, description] = Object.hasOwn(labels, event) ? labels[event] : labels.unavailable;
        return <article className="receipt sent-receipt" key={r.id}>
          <button type="button" aria-expanded={shown === r.id} onClick={() => setShown(shown === r.id ? null : r.id)}>
            <Mail size={18}/><span className="sent-summary"><b>{r.subject}</b><small>{r.to}</small>{r.scheduledAt && <small>Send time: {new Date(r.scheduledAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })} ({Intl.DateTimeFormat().resolvedOptions().timeZone})</small>}</span>
            <span className={"delivery-label " + color} title={description}>{label}</span><time>{new Date(r.at).toLocaleDateString()}</time>
          </button>
          {shown === r.id && <div className="details"><small>From {r.from}</small>{r.cc && <small>Cc {r.cc}</small>}{r.bcc && <small>Bcc {r.bcc}</small>}<MessageContent text={r.message} html={r.messageHtml}/>{r.attachmentNames?.map((name, index) => <small key={index}>Attachment: {name}</small>)}<SignaturePreview signature={r.signature}/><small>{description}</small><small><Check size={14}/> Accepted · {r.id}</small>
            {r.scheduledAt && event === "scheduled" && <CancelSchedule id={r.id} locked={locked} disabled={busy} onCanceled={() => {
              onHistory(saveReceipt({ ...r, canceled: true }, history)); setEvents(previous => ({ ...previous, [r.id]: "canceled" }));
            }}/>}
            {!r.canceled && !(r.scheduledAt && Date.parse(r.scheduledAt) > Date.now()) && <SentFollowUp receipt={r} locked={locked} onHistory={onHistory}/>}</div>}
        </article>;
      })}
    {visibleHistory.length > 0 && <details className="status-guide"><summary>About delivery labels</summary>
      <p>Each label shows the latest event for the whole message. Delivered means the receiving server accepted it. Only the recipient’s provider knows which folder it landed in. Reported as spam means a complaint reached Resend.</p>
      <p>Opened means a tracking image loaded. Privacy tools can load it automatically or block it. To record opens on new emails, enable open tracking for your sending domain. <a href="https://resend.com/docs/dashboard/domains/tracking" target="_blank" rel="noreferrer">Tracking settings guide</a></p>
    </details>}
  </section>;
}


function CancelSchedule({ id, locked, disabled, onCanceled }: { id: string; locked: boolean; disabled: boolean; onCanceled: () => void }) {
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);
  async function cancel() {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError("");
    try {
      const response = await mailboxFetch("/api/replies/scheduled?id=" + encodeURIComponent(id), { method: "DELETE", credentials: "same-origin" });
      const result = await response.json() as { canceled?: boolean; error?: string };
      if (!response.ok || !result.canceled) throw Error(result.error || "Could not confirm cancellation.");
      onCanceled();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not cancel. Try again."); }
    finally { pending.current = false; setBusy(false); }
  }
  if (locked) return <p><a href={mailboxUrl("/replies")}>Unlock Replies</a> to cancel this scheduled email.</p>;
  return <div className="schedule-cancel">
    {!confirm ? <button className="inbox-control" disabled={disabled} onClick={() => setConfirm(true)}>Cancel scheduled send</button> : <>
      <span>Stop this email from sending?</span>
      <button className="inbox-control" disabled={busy || disabled} onClick={() => void cancel()}>{busy ? "Canceling…" : "Yes, cancel send"}</button>
      <button className="inbox-control" disabled={busy} onClick={() => setConfirm(false)}>Keep scheduled</button>
    </>}
    {error && <p role="alert">{error}</p>}
  </div>;
}
