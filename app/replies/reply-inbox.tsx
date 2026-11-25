"use client";
import { mailboxFetch } from "../mailbox";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { CheckCheck, ChevronLeft, Inbox, LockKeyhole, Mail, MailOpen, RefreshCw, Trash2 } from "lucide-react";
import type { ReplyBody, ReplyPage, ReplySummary } from "../../lib/read-replies";

import { ReplyConversation } from "./reply-conversation";
import { isDeleted, setDeleted, markRead, wasRead, onInboxChange, sessionChanged } from "./read-state";

import { conversationStatus } from "./conversation-status";
import { groupReplies } from "./threads";
import { readReceipts } from "../receipts";

class InboxError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

async function load<T>(query: string, signal: AbortSignal, init?: RequestInit): Promise<T> {
  const response = await mailboxFetch("/api/replies" + query, {
    ...init, credentials: "same-origin", cache: "no-store", signal,
  });
  if (!response.ok) {
    const result = await response.json() as { error?: string };
    throw new InboxError(result.error || "Could not load the inbox.", response.status);
  }
  return await response.json() as T;
}

export function ReplyInbox({ passwordConfigured }: { passwordConfigured: boolean }) {
  const [unreadOnly, setUnreadOnly] = useState(false);
  useEffect(() => { setUnreadOnly(new URLSearchParams(location.search).get("filter") === "unread"); }, []);
  const [requiresPassword, setRequiresPassword] = useState(false);
  const [password, setPassword] = useState("");
  const [page, setPage] = useState<ReplyPage | null>(null);
  const [selected, setSelected] = useState<{ message: ReplySummary; body: ReplyBody } | null>(null);
  const [bodies, setBodies] = useState<Record<string, ReplyBody>>({});
  const bodyCache = useRef<Record<string, ReplyBody>>({});
  const [, redraw] = useState(0);
  const [undo, setUndo] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const active = useRef<AbortController | null>(null);

  const clearView = useCallback((locked: boolean) => {
    setRequiresPassword(locked);
    active.current?.abort();
    bodyCache.current = {}; setBodies({});
    setPassword(""); setPage(null); setSelected(null); setError(""); setBusy(false);
  }, []);

  const run = useCallback(async (operation: (signal: AbortSignal) => Promise<void>, silentAuth = false) => {
    active.current?.abort();
    const request = new AbortController();
    active.current = request;
    setBusy(true); setError("");
    try {
      await operation(request.signal);
    } catch (cause) {
      if (request.signal.aborted) return;
      if (cause instanceof InboxError && cause.status === 401) {
        bodyCache.current = {}; setBodies({});
        setRequiresPassword(true); setPage(null); setSelected(null);
        if (silentAuth) return;
      }
      setError(cause instanceof Error ? cause.message : "Could not load replies.");
    } finally {
      if (!request.signal.aborted) setBusy(false);
    }
  }, []);
  const fetchPage = useCallback((after?: string, silentAuth = false) => {
    return run(async signal => {
      const result = await load<ReplyPage>(after ? "?after=" + encodeURIComponent(after) : "", signal);
      if (signal.aborted) return;
      setRequiresPassword(false);
      setPage(previous => {
        if (!after || !previous) return result;
        const existing = new Set(previous.messages.map(item => item.id));
        return { ...result, messages: [...previous.messages, ...result.messages.filter(item => !existing.has(item.id))] };
      });
      for (const message of result.messages) {
        if (bodyCache.current[message.id]) continue;
        // Pace detail lookups to leave room for the unread badge and send requests.
        await new Promise(resolve => setTimeout(resolve, 200));
        if (signal.aborted) return;
        const body = await load<ReplyBody>("?id=" + encodeURIComponent(message.id), signal);
        if (signal.aborted) return;
        bodyCache.current[message.id] = body;
        setBodies({ ...bodyCache.current });
      }
    }, silentAuth);
  }, [run]);

  useEffect(() => {
    if (!passwordConfigured) return;
    const restore = () => { setRequiresPassword(false); void fetchPage(undefined, true); };
    const hide = () => clearView(false);
    const resume = (event: PageTransitionEvent) => { if (event.persisted) restore(); };
    const unsubscribe = onInboxChange(change => {
      if (change === "deleted" || change === "read") redraw(value => value + 1);
      if (change === "lock") clearView(true);
      if (change === "unlock") restore();
    });
    restore();
    window.addEventListener("pagehide", hide);
    window.addEventListener("pageshow", resume);
    return () => {
      unsubscribe(); active.current?.abort();
      window.removeEventListener("pagehide", hide);
      window.removeEventListener("pageshow", resume);
    };
  }, [passwordConfigured, clearView, fetchPage]);

  // Refresh new messages without locking the composer or interrupting a send.
  useEffect(() => {
    if (!page || requiresPassword || busy) return;
    const controller = new AbortController();
    let loading = false;
    const timer = window.setInterval(async () => {
      if (document.hidden || loading) return;
      loading = true;
      try {
        const result = await load<ReplyPage>("", controller.signal);
        if (controller.signal.aborted) return;
        setPage(previous => previous ? { ...previous, messages: [...result.messages, ...previous.messages.filter(item => !result.messages.some(fresh => fresh.id === item.id))] } : result);
        for (const item of result.messages) {
          if (bodyCache.current[item.id]) continue;
          await new Promise(resolve => setTimeout(resolve, 650));
          if (controller.signal.aborted) return;
          bodyCache.current[item.id] = await load<ReplyBody>("?id=" + encodeURIComponent(item.id), controller.signal);
          if (!controller.signal.aborted) setBodies({ ...bodyCache.current });
        }
      } catch { /* Manual Refresh remains available after a temporary failure. */ }
      finally { loading = false; }
    }, 20000);
    return () => { clearInterval(timer); controller.abort(); };
  }, [Boolean(page), requiresPassword, busy]);

  function open(message: ReplySummary) {
    return run(async signal => {
      const body = bodyCache.current[message.id] || await load<ReplyBody>("?id=" + encodeURIComponent(message.id), signal);
      if (!signal.aborted) {
        setSelected({ message, body });
        const group = groupReplies(page?.messages || [message], bodyCache.current).find(group => group.messages.some(item => item.id === message.id));
        for (const item of group?.messages || [message]) markRead(item.id);
      }
    });
  }
  function unlock(event: FormEvent) {
    event.preventDefault();
    void run(async signal => {
      await load("", signal, { method: "POST", headers: { Authorization: "Bearer " + encodeURIComponent(password) } });
      if (!signal.aborted) { setPassword(""); sessionChanged("unlock"); }
    });
  }

  function lock() {
    void run(async signal => {
      await load("", signal, { method: "DELETE" });
      if (!signal.aborted) sessionChanged("lock");
    });
  }

  const receipts = readReceipts();
  const conversations = groupReplies(page?.messages || [], bodies);
  const unreadGroups = conversations.filter(group => group.messages.some(message => !isDeleted(message.id) && !wasRead(message.id)));
  function filterUnread(value: boolean) {
    setUnreadOnly(value); setSelected(null);
    const url = new URL(location.href);
    if (value) url.searchParams.set("filter", "unread"); else url.searchParams.delete("filter");
    window.history.replaceState(null, "", url);
  }
  const selectedGroup = selected ? conversations.find(group => group.messages.some(item => item.id === selected.message.id)) : undefined;
  function hideMessages(ids: string[]) {
    try { setDeleted(ids, true); setUndo(ids); setSelected(null); }
    catch { setError("Your browser could not save this deletion. Allow local storage and try again."); }
  }
  function deleteConversation(messages: ReplySummary[]) {
    const references = new Set(messages.flatMap(message => [bodies[message.id]?.threadId, ...(bodies[message.id]?.referenceIds || [])]));
    const parentIds = new Set(messages.map(message => message.id));
    const sent = readReceipts().filter(receipt => (receipt.threadId && references.has(receipt.threadId)) || (receipt.parent && parentIds.has(receipt.parent.id)));
    hideMessages([...messages.map(message => message.id), ...sent.map(receipt => receipt.id)]);
  }

  return <section className="card reply-inbox">
    <header className="card-heading"><span className="tile"><Inbox/></span><h2>Inbox</h2>
      {passwordConfigured && !requiresPassword && (page || error) && <div className="inbox-controls">
        {<button type="button" className="inbox-control" disabled={busy} onClick={() => void fetchPage(undefined, true)}><RefreshCw size={15}/>Refresh</button>}
        <button type="button" className="inbox-control" onClick={lock}><LockKeyhole size={15}/>Log out</button>
      </div>}
    </header>
    {undo.length > 0 && <p className="inbox-status" role="status">Deleted from this browser. <button className="inbox-control" onClick={() => {
      try { setDeleted(undo, false); setUndo([]); } catch { setError("Could not restore messages. Try again."); }
    }}>Undo</button></p>}
    {!passwordConfigured ? <div className="inbox-unlock"><LockKeyhole size={26}/><h3>Set your inbox password</h3>
      <p>Save a password as <code>INBOX_PASSWORD</code> in the Vercel Production environment, then redeploy to open this inbox.</p></div> :
     requiresPassword ? <form onSubmit={unlock} className="inbox-unlock"><LockKeyhole size={26}/><h3>Open your private inbox</h3>
      <div className="field"><label htmlFor="inbox-password">Inbox password</label><input id="inbox-password" type="password" required autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)}/></div>
      <button className="primary" type="submit" disabled={busy}>{busy ? "Opening…" : "Open inbox"}</button></form> :
     !page ? (!error && <p className="inbox-status" role="status">Opening your inbox…</p>) :
     <div className={"inbox-chat-layout" + (selected ? " has-conversation" : "")}><div className="inbox-chat-main">{selected ? <article className="reply-reader">
      <button type="button" className="inbox-control" onClick={() => { setSelected(null); setError(""); }}><ChevronLeft size={15}/>All conversations</button>
      <h3>{selected.message.subject || "(No subject)"}</h3>
      <ReplyConversation key={selected.message.id} message={selected.message} body={selected.body} messages={selectedGroup?.messages || [selected.message]} bodies={bodies} onDelete={hideMessages}/>
    </article> : <div className="chat-welcome"><MailOpen size={40}/><h3>Your conversations</h3><p>Select a conversation to read and send messages.</p></div>}</div><div className="inbox-chat-list">
      <div className="mailbox-label"><Mail size={14}/>{page.mailbox}</div>
      <div className="inbox-filters" aria-label="Filter conversations"><button type="button" aria-pressed={!unreadOnly} onClick={() => filterUnread(false)}>All</button><button type="button" aria-pressed={unreadOnly} onClick={() => filterUnread(true)}>Unread ({unreadGroups.length})</button></div>
      {unreadOnly && unreadGroups.length === 0 && <p className="inbox-status">{page.next ? "No unread replies in loaded conversations. Load older messages to check more." : "You’re all caught up. No unread replies."}</p>}
      <p className="reply-meta">Delete hides messages in this browser only. Originals stay in Resend.</p>
      {conversations.map(group => {
        const visible = group.messages.filter(message => !isDeleted(message.id));
        const message = visible.at(-1);
        if (!message || (unreadOnly && !visible.some(item => !wasRead(item.id)))) return null;
        const status = conversationStatus(visible, bodies, receipts, wasRead);
        const StatusIcon = status === "unread" ? Mail : status === "replied" ? CheckCheck : MailOpen;
        return <article className={"receipt inbox-conversation-row conversation-" + status} key={group.id}>
          <button type="button" disabled={busy} onClick={() => void open(message)}><StatusIcon size={18} className="conversation-icon"/>
            <span><b>{message.subject || "(No subject)"}</b><small>{message.from}{visible.length > 1 ? ` · ${visible.length} messages` : ""}</small></span>
            <em className={"conversation-status " + status}>{status === "unread" ? "Unread" : status === "replied" ? "Replied" : "Read"}</em>
            <time dateTime={message.date}>{new Date(message.date).toLocaleDateString()}</time></button>
          <button type="button" className="inbox-control delete-conversation" disabled={busy} aria-label={"Delete conversation " + (message.subject || "(No subject)")} onClick={() => deleteConversation(group.messages)}><Trash2 size={16}/></button>
        </article>;
      })}
      {!page.messages.some(message => !isDeleted(message.id)) && <div className="empty"><MailOpen size={35}/><h3>No conversations yet</h3>
        <p>Messages received by Resend at {page.mailbox} appear here. Use Refresh to check again.</p></div>}
      {page.next && <div className="inbox-more"><button className="inbox-control" disabled={busy} onClick={() => void fetchPage(page.next!)}>Load older messages</button></div>}
    </div></div>}
    {page && busy && <p className="inbox-status" role="status">Loading and grouping replies…</p>}
    {error && <p className="notice" role="alert">{error}</p>}
  </section>;
}
