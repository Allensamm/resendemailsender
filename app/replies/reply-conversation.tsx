"use client";
import { ReceivedAttachments } from "./received-attachments";
import type { ReceivedFile } from "../../lib/read-replies";
import { RichComposer, MessageContent } from "../rich-composer";
import { AttachmentPicker } from "../attachment-picker";
import type { MailAttachment } from "../../lib/attachments";
import { mailboxFetch, mailboxKey } from "../mailbox";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Paperclip, Send, Trash2 } from "lucide-react";
import type { ReplyBody, ReplySummary } from "../../lib/read-replies";
import { readReceipts, saveReceipt, type Receipt } from "../receipts";

import { isDeleted } from "./read-state";

import { SignaturePreview } from "../email-signature";
import type { EmailSignature } from "../../lib/signature";

import { splitChatText, chatTextKey } from "./chat-text";

type Parent = NonNullable<Receipt["parent"]>;

function MessageBubble({ sender, date, text, attachments = [], outgoing = false, signature, html, files, messageId }: {
  sender: string; date: string; text: string; attachments?: string[]; outgoing?: boolean; html?: string; files?: ReceivedFile[]; messageId?: string; signature?: EmailSignature;
}) {
  const visible = outgoing || html ? text : splitChatText(text).text;
  return <article className={"thread-item" + (outgoing ? " thread-outgoing" : "")}>
    <strong className="thread-sender">{sender}</strong>
    {visible && <MessageContent text={visible} html={html} />}
    {files?.length && messageId ? <ReceivedAttachments files={files} messageId={messageId} /> : attachments.length > 0 && <div className="thread-attachments">{attachments.map((name, index) =>
      <div className="thread-attachment" key={index}><Paperclip size={17} /><span>{name}</span></div>)}</div>}
    <SignaturePreview signature={signature} />
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
    mailboxFetch("/api/replies?id=" + encodeURIComponent(parent.id), { cache: "no-store", signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw Error("Could not load this message.");
        const result = await response.json() as ReplyBody;
        if (!controller.signal.aborted) setBody(result);
      }).catch(e => { if (!controller.signal.aborted) setError(e.message); });
    return () => controller.abort();
  }, [attempt, parent.id]);
  return <div>
    <MessageBubble sender={parent.from} date={parent.date} text={error || body?.text || (body ? "" : "Loading message…")} attachments={body?.attachments} files={body?.files} messageId={parent.id} />
    {error && <button className="inbox-control" onClick={() => setAttempt(value => value + 1)}>Retry</button>}
  </div>;
}

export function ReplyConversation({ message, body, messages, bodies, onDelete }: {
  message: ReplySummary; body: ReplyBody; messages: ReplySummary[]; bodies: Record<string, ReplyBody>; onDelete: (ids: string[]) => void;
}) {
  const [sender, setSender] = useState("");
  const [signature, setSignature] = useState<EmailSignature | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    mailboxFetch("/api/sender", { signal: controller.signal }).then(response => response.json()).then(result => { setSignature((result as { signature?: EmailSignature }).signature || null); setSender(typeof (result as {from?: string}).from === "string" ? (result as {from: string}).from : ""); }).catch(() => { });
    return () => controller.abort();
  }, []);
  const [history, setHistory] = useState<Receipt[]>([]);
  const [files, setFiles] = useState<MailAttachment[]>([]);
  const [readingFiles, setReadingFiles] = useState(false);
  const scrollArea = useRef<HTMLDivElement>(null);
  const [messageHtml, setMessageHtml] = useState<string | undefined>(undefined);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const pending = useRef(false);
  const token = useRef("");
  const draftKey = mailboxKey("letterpress.reply-draft." + message.id);

  useEffect(() => {
    setHistory(readReceipts());
    try {
      const saved = JSON.parse(sessionStorage.getItem(draftKey) || "null");
      if (typeof saved?.text === "string" && typeof saved.token === "string" && saved.text) {
        setText(saved.text); setMessageHtml(typeof saved.messageHtml === "string" ? saved.messageHtml : undefined); token.current = saved.token;
      }
    } catch { /* Draft storage is optional. */ }
  }, [draftKey]);

  function change(value: string, html = messageHtml) {
    setMessageHtml(html);
    setText(value); setError(""); setNotice("");
    token.current = "reply/" + crypto.randomUUID();
    try { sessionStorage.setItem(draftKey, JSON.stringify({ text: value, messageHtml: html, token: token.current })); } catch { /* Keep the in-memory draft. */ }
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending.current || readingFiles || !text.trim() || !body.threadId) return;
    pending.current = true; setBusy(true); setError(""); setNotice("");
    try {
      const response = await mailboxFetch("/api/replies/send?id=" + encodeURIComponent(message.id), {
        method: "POST", credentials: "same-origin", headers: {
          "Content-Type": "application/json", "Idempotency-Key": token.current,
        }, body: JSON.stringify({ message: text, messageHtml, attachments: files }),
      });
      const result = await response.json() as { id?: string; from?: string; to?: string; subject?: string; signature?: EmailSignature; error?: string };
      if (!response.ok || !result.id || !result.from || !result.to || !result.subject) throw Error(result.error || "Could not confirm this reply. Retry this draft.");
      setHistory(saveReceipt({
        id: result.id, at: new Date().toISOString(), from: result.from, to: result.to, cc: "", bcc: "",
        subject: result.subject, message: text, messageHtml, attachmentNames: files.map(file => file.filename), ...(result.signature && { signature: result.signature }), threadId: body.threadId,
        parent: { id: message.id, from: message.from, date: message.date },
      }, history));
      try { sessionStorage.removeItem(draftKey); } catch { /* The reply was accepted. */ }
      setFiles([]); setText(""); setMessageHtml(undefined); token.current = ""; setNotice("Message sent.");
    } catch (cause) {
      setError(cause instanceof TypeError ? "Connection interrupted. Retry this draft to confirm the send." : cause instanceof Error ? cause.message : "Could not send your reply.");
    } finally { pending.current = false; setBusy(false); }
  }

  const entries = messages.filter(item => !isDeleted(item.id)).map(item => ({
    id: item.id, at: item.date, content:
      item.id === message.id ? <MessageBubble sender={item.from} date={item.date} text={body.text} attachments={body.attachments} files={body.files} messageId={item.id} /> :
        bodies[item.id] ? <MessageBubble sender={item.from} date={item.date} text={bodies[item.id].text} attachments={bodies[item.id].attachments} files={bodies[item.id].files} messageId={item.id} /> :
          <EarlierMessage parent={item} />
  }));
  const included = new Set(messages.map(item => item.id));
  const references = new Set(messages.flatMap(item => [bodies[item.id]?.threadId, ...(bodies[item.id]?.referenceIds || [])]));
  if (body.threadId) references.add(body.threadId);
  for (const receipt of history.filter(r => (r.threadId && references.has(r.threadId)) || (r.parent && included.has(r.parent.id)))) {
    const parent = receipt.parent;
    if (parent && !included.has(parent.id) && !isDeleted(parent.id)) {
      included.add(parent.id);
      entries.push({ id: parent.id, at: parent.date, content: <EarlierMessage parent={parent} /> });
    }
    if (!isDeleted(receipt.id)) entries.push({
      id: receipt.id, at: receipt.at, content:
        <MessageBubble sender="You" date={receipt.at} text={receipt.message} html={receipt.messageHtml} signature={receipt.signature} attachments={receipt.attachmentNames} outgoing />
    });
  }
  // Reconstruct recognizable quoted messages when an original is absent locally.
  const known = new Set([...messages.map(item => chatTextKey(bodies[item.id]?.text || (item.id === message.id ? body.text : ''))), ...history.map(item => chatTextKey(item.message))]);
  const recovered: { sender: string; text: string }[] = [];
  for (const item of messages) {
    for (const earlier of splitChatText(bodies[item.id]?.text || (item.id === message.id ? body.text : '')).history) {
      const key = chatTextKey(earlier.text);
      if (key && !known.has(key)) { known.add(key); recovered.push(earlier); }
    }
  }
  entries.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  useEffect(() => {
    const area = scrollArea.current;
    if (area) area.scrollTop = area.scrollHeight;
  }, [message.id, entries.length]);
  return <>
    <div className="thread-messages" ref={scrollArea} role="log" aria-label="Conversation messages">
      {recovered.map((item, index) => <article key={'history-' + index} className={"thread-item" + (sender.toLowerCase().includes(item.sender.toLowerCase()) ? " thread-outgoing" : "")}><strong className="thread-sender">{item.sender}</strong><MessageContent text={item.text}/><small className="thread-time">Earlier message · from email history</small></article>)}{entries.map(item => <div className="thread-message-wrap" key={item.id}>{item.content}<button type="button" className="inbox-control thread-delete" aria-label="Delete message from this browser" disabled={busy} onClick={() => onDelete([item.id])}><Trash2 size={13} />Delete</button></div>)}</div>
    {notice && <p className="thread-feedback" role="status">{notice}</p>}
    {!body.threadId || !body.replyTo.length ? <p className="reply-meta">This email has no usable reply address or original Message-ID.</p> :
        <form className="thread-compose" onSubmit={submit}>
          <div className="field"><label htmlFor="reply-message">Message to {body.replyTo.join(", ")}</label>
            <RichComposer id="reply-message" label="Message" text={text} html={messageHtml} disabled={busy} onChange={(value, html) => change(value, html)} /></div>
          <AttachmentPicker files={files} disabled={busy || readingFiles} onBusy={setReadingFiles} onChange={value => { setFiles(value); change(text); }} />
          {signature && <p className="signature-note">Signature added automatically to this reply.</p>}
          {error && <p className="notice" role="alert">{error}</p>}
          <div className="thread-actions"><button className="primary" type="submit" disabled={busy || readingFiles || !text.trim()}><Send size={15} />{busy ? "Sending…" : "Send"}</button>
</div>
        </form>}
  </>;
}
