"use client";
import { SequenceSend } from "./sequence";
import { AttachmentPicker } from "./attachment-picker";
import type { MailAttachment } from "../lib/attachments";
import { mailboxFetch, mailboxKey, currentMailbox } from "./mailbox";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowUpRight, CalendarClock, Eye, FilePenLine,  Plane, Send, ShieldCheck, Stamp, X } from "lucide-react";

import { isDraft, readReceipts, saveReceipt, type Draft, type Receipt } from "./receipts";
import { SignaturePreview } from "./email-signature";
import type { EmailSignature } from "../lib/signature";
import { SentMail } from "./sent-mail";
import { WorkspaceHeader } from "./workspace-header";

const empty: Draft = { to: "", cc: "", bcc: "", subject: "", message: "" };
const draftKey = "letterpress.draft.v1";
function readLocal(key: string) {
  try { return JSON.parse(localStorage.getItem(key) || "null"); } catch { return null; }
}
function persist(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
}

function localDateTime(iso: string) {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "";
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
function displayTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function Envelope({ to }: { to: string }) {
  return <div className="mail-art" aria-hidden="true">
    <div className="art-orbit orbit-left" /><div className="art-orbit orbit-right" />
    <div className="blue-envelope"><i /></div>
    <div className="airmail"><div className="paper">
      <div className="air-label"><Plane size={10} fill="currentColor" /> AIR MAIL</div>
      <div className="postage"><div className="stamp-inner"><span>POST</span><Send size={24} strokeWidth={1.4}/><small>25</small></div></div>
      <div className="cancel-mark"><span>POSTAL</span><b>✦</b><span>SERVICE</span></div>
      <div className="waves">∿∿∿<br/>∿∿∿<br/>∿∿∿</div>
      <div className="address-lines">{to ? <em>{to.split(",")[0]}</em> : <i/>}<i/><i/></div>
    </div></div>
  </div>;
}

export default function Home() {
  const [allen, setAllen] = useState(false);
  const [files, setFiles] = useState<MailAttachment[]>([]);
  const [readingFiles, setReadingFiles] = useState(false);
  const [view, setView] = useState<"compose" | "sent">("compose");
  const [draft, setDraft] = useState<Draft>({ ...empty });
  const [token, setToken] = useState("");
  const [ready, setReady] = useState(false);
  const [zone, setZone] = useState("");
  const [signature, setSignature] = useState<EmailSignature | null>(null);
  const [from, setFrom] = useState("");
  const [history, setHistory] = useState<Receipt[]>([]);
  const [cc, setCc] = useState(false);
  const [bcc, setBcc] = useState(false);
  const [busy, setBusy] = useState(false);
  const sending = useRef(false);
  const [notice, setNotice] = useState<{ text: string; ok: boolean } | null>(null);
  const [discard, setDiscard] = useState(false);
  useEffect(() => {
    setAllen(currentMailbox() === "allen");
    const selectView = () => setView(location.hash === "#sent" ? "sent" : "compose");
    selectView();
    window.addEventListener("hashchange", selectView);
    const saved = readLocal(mailboxKey(draftKey));
    if (isDraft(saved?.draft)) {
      setDraft(saved.draft); setCc(Boolean(saved.draft.cc)); setBcc(Boolean(saved.draft.bcc));
    }
    setToken(typeof saved?.token === "string" && saved.token ? saved.token : "send-email/" + crypto.randomUUID());
    setHistory(readReceipts());
    setZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
    setReady(true);
    mailboxFetch("/api/sender").then(r => r.json()).then(s => { setFrom((s as { from: string }).from || "Configure sender address"); setSignature((s as { signature?: EmailSignature }).signature || null); }).catch(() => setFrom("Sender unavailable"));
    return () => window.removeEventListener("hashchange", selectView);
  }, []);
  useEffect(() => { if (ready) persist(mailboxKey(draftKey), { draft, token }); }, [draft, token, ready]);

  function change(key: keyof Draft, value: string) {
    setDraft(previous => ({ ...previous, [key]: value })); setToken("send-email/" + crypto.randomUUID()); setNotice(null); setDiscard(false);
  }
  function reset() {
    setFiles([]); setDraft({ ...empty }); setToken("send-email/" + crypto.randomUUID()); setCc(false); setBcc(false); setDiscard(false);
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (sending.current || readingFiles || !ready) return;
    sending.current = true; setBusy(true); setNotice(null);
    try {
      const result = await mailboxFetch("/api/send-email", { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": token }, body: JSON.stringify({ ...draft, attachments: files }) });
      const data = await result.json() as { id?: string; scheduledAt?: string; signature?: EmailSignature; error?: string };
      if (!result.ok || !data.id) throw new Error(data.error || "The server could not confirm this send.");
      const receipt = { ...draft, attachmentNames: files.map(file => file.filename), ...(data.signature && { signature: data.signature }), ...(data.scheduledAt && { scheduledAt: data.scheduledAt }), id: data.id, at: new Date().toISOString(), from };
      setHistory(saveReceipt(receipt, history)); reset();
      setNotice({ ok: true, text: data.scheduledAt ? "Scheduled for " + displayTime(data.scheduledAt) + " (" + zone + "). You can close the browser. Manage it in Sent mail." : "Resend accepted your email. Its message ID is in Sent mail." });
    } catch (error) {
      setNotice({ ok: false, text: error instanceof TypeError ? "Connection interrupted. Retry this draft to confirm the send." : error instanceof Error ? error.message : "Send failed. Please try again." });
    } finally { sending.current = false; setBusy(false); }
  }

  return <>
    <WorkspaceHeader current={view}/>
    <main>
      <div className="page-heading"><h1>{view === "compose" ? "Compose email" : "Sent mail"}<span>.</span></h1>
        <p>{view === "compose" ? "Write your message, check the preview, and send it on its way." : "Emails accepted by Resend from this browser."}</p>
      </div>
      {view === "compose" ? <div className="columns">
        <section className="card composer"><header className="card-heading"><span className="tile"><FilePenLine/></span><h2>New message</h2><span className="draft-badge"><i/>Draft</span></header>
          <form onSubmit={event => { if (allen) event.preventDefault(); else void submit(event); }}><fieldset disabled={busy || !ready}>
            <div className="fields">
              {allen ? <div className="field"><label>Recipients</label><p className="schedule-help">One address per box. Each recipient sees only their own address.</p>
                {draft.to.split(",").map((address, index, addresses) => <div className="recipient-row" key={index}>
                  <input type="email" aria-label={"Recipient " + (index + 1)} value={address} onChange={event => { const next = [...addresses]; next[index] = event.target.value; change("to", next.join(",")); }} placeholder={"Recipient " + (index + 1) + " email address"}/>
                  {addresses.length > 1 && <button type="button" className="inbox-control" aria-label={"Remove recipient " + (index + 1)} onClick={() => change("to", addresses.filter((_, i) => i !== index).join(","))}>Remove</button>}
                </div>)}
                {draft.to.split(",").length < 20 && <button type="button" className="inbox-control" onClick={() => change("to", draft.to + ",")}>Add recipient</button>}
              </div> : <>
              <div className="field"><div className="label-line"><label htmlFor="to">To</label><div className="copies">{!cc && <button type="button" onClick={() => setCc(true)}>Cc</button>}{!bcc && <button type="button" onClick={() => setBcc(true)}>Bcc</button>}</div></div>
                <input id="to" type="email" multiple required value={draft.to} onChange={e => change("to", e.target.value)} placeholder="recipient@example.com" autoComplete="off"/></div>
              {(["cc", "bcc"] as const).filter(key => key === "cc" ? cc : bcc).map(key => <div className="field" key={key}>
                <div className="label-line"><label htmlFor={key}>{key === "cc" ? "Cc" : "Bcc"}</label><button className="icon-btn" type="button" aria-label={"Remove " + key} onClick={() => { change(key, ""); if (key === "cc") setCc(false); else setBcc(false); }}><X size={14}/></button></div>
                <input id={key} type="email" multiple autoFocus value={draft[key]} onChange={e => change(key, e.target.value)} placeholder="recipient@example.com"/></div>)}
              </>}
              <div className="field"><label htmlFor="subject">Subject</label><input id="subject" required maxLength={500} value={draft.subject} onChange={e => change("subject", e.target.value)} placeholder="Add a subject line"/></div>
              <div className="field"><label htmlFor="message">Message</label><div className="text-wrap"><textarea id="message" required maxLength={50000} value={draft.message} onChange={e => change("message", e.target.value)} placeholder="Write your message here…"/><div className="text-meta"><span>Plain text</span><span>{draft.message.length.toLocaleString()} characters</span></div></div></div>
            </div>
            <AttachmentPicker files={files} disabled={busy || readingFiles} onBusy={setReadingFiles} onChange={value => { setFiles(value); setToken("send-email/" + crypto.randomUUID()); setNotice(null); }}/>
            {signature && <p className="signature-note">Your Sovern Partners signature is added automatically.</p>}
            {!allen && <div className="schedule-panel">
              <label className="schedule-toggle"><input type="checkbox" checked={draft.scheduledAt !== undefined} onChange={e => {
                if (e.target.checked) change("scheduledAt", new Date(Date.now() + 3600000).toISOString());
                else { setDraft(previous => { const next = { ...previous }; delete next.scheduledAt; return next; }); setToken("send-email/" + crypto.randomUUID()); setNotice(null); }
              }}/><CalendarClock size={18}/>Send later</label>
              {draft.scheduledAt !== undefined && <div className="field">
                <label htmlFor="send-time">Send date and time</label>
                <input id="send-time" type="datetime-local" required value={localDateTime(draft.scheduledAt)}
                  min={localDateTime(new Date(Date.now() + 120000).toISOString())} max={localDateTime(new Date(Date.now() + 30 * 86400000).toISOString())}
                  onChange={e => { const date = new Date(e.target.value); change("scheduledAt", Number.isFinite(date.getTime()) ? date.toISOString() : ""); }}/>
                <p className="schedule-help">Timezone: <strong>{zone}</strong>. Schedule up to 30 days ahead. Your browser can be closed.</p>
              </div>}
            </div>
            }
            {notice && <div className={"notice " + (notice.ok ? "success" : "")} role={notice.ok ? "status" : "alert"}>{notice.text}</div>}
            {allen ? <SequenceSend draft={draft} files={files} disabled={readingFiles || !ready} from={from} onHistory={setHistory} onComplete={reset} onBusy={setBusy}/> : <div className="actions"><button type="submit" className="primary" disabled={readingFiles}><Send size={16}/>{busy ? (draft.scheduledAt !== undefined ? "Scheduling…" : "Sending…") : draft.scheduledAt !== undefined ? "Schedule email" : "Send email"}</button>
              {discard ? <div className="discard"><span>Clear draft?</span><button type="button" onClick={() => { reset(); setNotice(null); }}>Clear</button><button type="button" onClick={() => setDiscard(false)}>Keep</button></div> : <button className="clear" type="button" disabled={!files.length && !Object.values(draft).some(Boolean)} onClick={() => setDiscard(true)}>Clear draft</button>}
            </div>
          }</fieldset></form>
        </section>
        <aside><section className="card preview"><header className="card-heading"><span className="tile"><Eye/></span><h2>Email preview</h2><span className="live"><i/>Live</span></header>
          <Envelope to={draft.to}/>
          <div className="preview-content"><div className="preview-address"><span>FROM</span><strong>{from || "Loading sender…"}</strong><span>TO</span><strong className={draft.to ? "" : "muted"}>{draft.to || "Recipient address"}</strong>
          {!allen && draft.cc && <><span>CC</span><strong>{draft.cc}</strong></>}{!allen && draft.bcc && <><span>BCC</span><strong>{draft.bcc}</strong></>}</div>
            {!allen && draft.scheduledAt && <p className="schedule-preview"><CalendarClock size={16}/>Scheduled for {displayTime(draft.scheduledAt)} ({zone})</p>}
            <div className="preview-body"><h3>{draft.subject || "Your subject line"}</h3><p className={draft.message ? "" : "muted"}>{draft.message || "Your message will appear here as you type."}</p><SignaturePreview signature={signature}/></div></div>
        </section><div className="privacy"><ShieldCheck size={15}/><span>Sent securely through Resend</span></div></aside>
      </div> : <SentMail history={history} onHistory={setHistory} onCompose={() => { location.hash = ""; setView("compose"); }}/>}
      <footer><span><Stamp size={15}/>Letterpress</span><span>Powered by <a href="https://resend.com" target="_blank" rel="noreferrer">Resend <ArrowUpRight size={12}/></a></span></footer>
    </main>
  </>;
}
