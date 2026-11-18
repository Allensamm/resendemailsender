"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Paperclip, Reply, Send } from "lucide-react";
import type { ReplyBody, ReplySummary } from "../../lib/read-replies";
import { readReceipts, saveReceipt, type Receipt } from "../receipts";

type Parent = NonNullable<Receipt["parent"]>;

function MessageBubble({ sender, date, text, attachments = [], outgoing = false }: {
  sender: string; date: string; text: string; attachments?: string[]; outgoing?: boolean;
}) {
  const lines = text.split("\n");
  const quoteStart = lines.findIndex(line => /^\s*(On .+wrote:|>+|[-_]{3,}\s*(Original Message|Forwarded message))/i.test(line));
  const visible = quoteStart > 0 ? lines.slice(0, quoteStart).join("\n").trim() : text;
  const quoted = quoteStart > 0 ? lines.slice(quoteStart).join("\n") : "";
  return <article className={"thread-item" + (outgoing ? " thread-outgoing" : "")}>
    <strong className="thread-sender">{sender}</strong>
    {visible && <p className="thread-text">{visible}</p>}
    {quoted && <details className="thread-quoted"><summary>Earlier quoted text</summary><p className="thread-text">{quoted}</p></details>}
    {attachments.length > 0 && <div className="thread-attachments">{attachments.map((name, index) =>
      <div className="thread-attachment" key={index}><Paperclip size={17}/><span>{name}</span></div>)}</div>}
    <time className="thread-time" dateTime={date} title={new Date(date).toLocaleString()}>{new Date(date).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</time>
  </article>;
}

function EarlierMessage({ parent }: { parent: Parent }) {
  const [body, setBody] = useState<ReplyBody | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setError("");
    fetch("/api/replies?id=" + encodeURIComponent(parent.id), { cache: "no-store", signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw Error("Could not load this message.");
        const result = await response.json() as ReplyBody;
        if (!controller.signal.aborted) setBody(result);
      }).catch(e => { if (!controller.signal.aborted) setError(e.message); });
    return () => controller.abort();
  }, [attempt, parent.id]);
  return <div>
    <MessageBubble sender={parent.from} date={parent.date} text={error || body?.text || (body ? "" : "Loading message…")} attachments={body?.attachments}/>
    {error && <button className="inbox-control" onClick={() => setAttempt(value => value + 1)}>Retry</button>}
  </div>;
}

export function ReplyConversation({ message, body }: { message: ReplySummary; body: ReplyBody }) {
  const [history, setHistory] = useState<Receipt[]>([]);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const pending = useRef(false);
  const token = useRef("");
  const draftKey = "letterpress.reply-draft." + message.id;

  useEffect(() => {
    setHistory(readReceipts());
    try {
      const saved = JSON.parse(sessionStorage.getItem(draftKey) || "null");
      if (typeof saved?.text === "string" && typeof saved.token === "string" && saved.text) {
        setText(saved.text); token.current = saved.token; setEditing(true);
      }
    } catch { /* Draft storage is optional. */ }
  }, [draftKey]);

  function change(value: string) {
    setText(value); setError(""); setNotice("");
    token.current = "reply/" + crypto.randomUUID();
    try { sessionStorage.setItem(draftKey, JSON.stringify({ text: value, token: token.current })); } catch { /* Keep the in-memory draft. */ }
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending.current || !text.trim() || !body.threadId) return;
    pending.current = true; setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/replies/send?id=" + encodeURIComponent(message.id), {
        method: "POST", credentials: "same-origin", headers: {
          "Content-Type": "application/json", "Idempotency-Key": token.current,
        }, body: JSON.stringify({ message: text }),
      });
      const result = await response.json() as { id?: string; from?: string; to?: string; subject?: string; error?: string };
      if (!response.ok || !result.id || !result.from || !result.to || !result.subject) throw Error(result.error || "Could not confirm this reply. Retry this draft.");
      setHistory(saveReceipt({
        id: result.id, at: new Date().toISOString(), from: result.from, to: result.to, cc: "", bcc: "",
        subject: result.subject, message: text, threadId: body.threadId,
        parent: { id: message.id, from: message.from, date: message.date },
      }, history));
      try { sessionStorage.removeItem(draftKey); } catch { /* The reply was accepted. */ }
      setText(""); token.current = ""; setEditing(false); setNotice("Reply accepted by Resend.");
    } catch (cause) {
      setError(cause instanceof TypeError ? "Connection interrupted. Retry this draft to confirm the send." : cause instanceof Error ? cause.message : "Could not send your reply.");
    } finally { pending.current = false; setBusy(false); }
  }

  const entries = [{ id: message.id, at: message.date, content:
    <MessageBubble sender={message.from} date={message.date} text={body.text} attachments={body.attachments}/>
  }];
  const included = new Set([message.id]);
  for (const receipt of history.filter(r => body.threadId && r.threadId === body.threadId)) {
    const parent = receipt.parent;
    if (parent && !included.has(parent.id)) {
      included.add(parent.id);
      entries.push({ id: parent.id, at: parent.date, content: <EarlierMessage parent={parent}/> });
    }
    entries.push({ id: receipt.id, at: receipt.at, content:
      <MessageBubble sender="You" date={receipt.at} text={receipt.message} outgoing/> });

  }
  entries.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  return <>
    <div className="thread-messages">{entries.map(item => <div key={item.id}>{item.content}</div>)}</div>
    {notice && <p className="thread-feedback" role="status">{notice}</p>}
    {!body.threadId || !body.replyTo.length ? <p className="reply-meta">This email has no usable reply address or original Message-ID.</p> :
      !editing ? <button type="button" className="primary" onClick={() => { setEditing(true); setNotice(""); }}><Reply size={15}/>Reply</button> :
      <form className="thread-compose" onSubmit={submit}>
        <div className="field"><label htmlFor="reply-message">Reply to {body.replyTo.join(", ")}</label>
          <div className="text-wrap"><textarea id="reply-message" autoFocus required maxLength={50000} value={text} disabled={busy} onChange={e => change(e.target.value)} placeholder="Write your reply…"/></div></div>
        {error && <p className="notice" role="alert">{error}</p>}
        <div className="thread-actions"><button className="primary" type="submit" disabled={busy || !text.trim()}><Send size={15}/>{busy ? "Sending…" : "Send reply"}</button>
          <button className="inbox-control" type="button" disabled={busy} onClick={() => setEditing(false)}>Close</button></div>
      </form>}
  </>;
}
