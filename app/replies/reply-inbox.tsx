"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { ChevronLeft, Inbox, LockKeyhole, Mail, MailOpen, Paperclip, RefreshCw } from "lucide-react";
import type { ReplyBody, ReplyPage, ReplySummary } from "../../lib/read-replies";

async function load<T>(password: string, query: string, signal: AbortSignal): Promise<T> {
  const response = await fetch("/api/replies" + query, {
    headers: { Authorization: "Bearer " + encodeURIComponent(password) },
    cache: "no-store", signal,
  });
  if (!response.ok) {
    const result = await response.json() as { error?: string };
    throw new Error(result.error || "Could not load the inbox.");
  }
  return await response.json() as T;
}

export function ReplyInbox({ passwordConfigured }: { passwordConfigured: boolean }) {
  const [password, setPassword] = useState("");
  const [page, setPage] = useState<ReplyPage | null>(null);
  const [selected, setSelected] = useState<{ message: ReplySummary; body: ReplyBody } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const active = useRef<AbortController | null>(null);

  function lock() {
    active.current?.abort();
    setPassword(""); setPage(null); setSelected(null); setError(""); setBusy(false);
  }
  useEffect(() => {
    window.addEventListener("pagehide", lock);
    return () => { window.removeEventListener("pagehide", lock); active.current?.abort(); };
  }, []);

  async function run(operation: (signal: AbortSignal) => Promise<void>) {
    active.current?.abort();
    const request = new AbortController();
    active.current = request;
    setBusy(true); setError("");
    try {
      await operation(request.signal);
    } catch (cause) {
      if (!request.signal.aborted) setError(cause instanceof Error ? cause.message : "Could not load replies.");
    } finally {
      if (!request.signal.aborted) setBusy(false);
    }
  }
  function fetchPage(after?: string) {
    return run(async signal => {
      const result = await load<ReplyPage>(password, after ? "?after=" + encodeURIComponent(after) : "", signal);
      if (signal.aborted) return;
      setPage(previous => {
        if (!after || !previous) return result;
        const existing = new Set(previous.messages.map(item => item.id));
        return { ...result, messages: [...previous.messages, ...result.messages.filter(item => !existing.has(item.id))] };
      });
    });
  }
  function open(message: ReplySummary) {
    return run(async signal => {
      const body = await load<ReplyBody>(password, "?id=" + encodeURIComponent(message.id), signal);
      if (!signal.aborted) setSelected({ message, body });
    });
  }
  function unlock(event: FormEvent) { event.preventDefault(); void fetchPage(); }

  return <section className="card reply-inbox">
    <header className="card-heading"><span className="tile"><Inbox/></span><h2>Reply inbox</h2>
      {page && <div className="inbox-controls">
        {!selected && <button type="button" className="inbox-control" disabled={busy} onClick={() => void fetchPage()}><RefreshCw size={15}/>Refresh</button>}
        <button type="button" className="inbox-control" onClick={lock}><LockKeyhole size={15}/>Lock</button>
      </div>}
    </header>
    {!passwordConfigured ? <div className="inbox-unlock"><LockKeyhole size={26}/><h3>Set your inbox password</h3>
      <p>Save a password as <code>INBOX_PASSWORD</code> in the Vercel Production environment, then redeploy to open this inbox.</p></div> :
     !page ? <form onSubmit={unlock} className="inbox-unlock"><LockKeyhole size={26}/><h3>Open your private inbox</h3>
      <div className="field"><label htmlFor="inbox-password">Inbox password</label><input id="inbox-password" type="password" required autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)}/></div>
      <button className="primary" type="submit" disabled={busy}>{busy ? "Opening…" : "Open inbox"}</button></form> :
     selected ? <article className="reply-reader">
      <button type="button" className="inbox-control" onClick={() => { setSelected(null); setError(""); }}><ChevronLeft size={15}/>All replies</button>
      <h3>{selected.message.subject || "(No subject)"}</h3>
      <p className="reply-meta">From {selected.message.from} · {new Date(selected.message.date).toLocaleString()}</p>
      <div className="reply-text">{selected.body.text || "This message has no text body."}</div>
      {selected.body.attachments.length > 0 && <div className="reply-files"><Paperclip size={15}/>{selected.body.attachments.join(", ")}</div>}
    </article> : <>
      <div className="mailbox-label"><Mail size={14}/>{page.mailbox}</div>
      {page.messages.map(message => <article className="receipt" key={message.id}>
        <button type="button" disabled={busy} onClick={() => void open(message)}><Mail size={18}/>
          <span><b>{message.subject || "(No subject)"}</b><small>{message.from}</small></span>
          <time dateTime={message.date}>{new Date(message.date).toLocaleDateString()}</time></button>
      </article>)}
      {!page.messages.length && <div className="empty"><MailOpen size={35}/><h3>No replies yet</h3>
        <p>Messages received by Resend at {page.mailbox} appear here. Use Refresh to check again.</p></div>}
      {page.next && <div className="inbox-more"><button className="inbox-control" disabled={busy} onClick={() => void fetchPage(page.next!)}>Load older messages</button></div>}
    </>}
    {page && busy && <p className="inbox-status" role="status">Loading…</p>}
    {error && <p className="notice" role="alert">{error}</p>}
  </section>;
}
