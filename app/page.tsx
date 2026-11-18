"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowUpRight, Eye, FilePenLine,  Plane, Send, ShieldCheck, Stamp, X } from "lucide-react";

import { isDraft, readReceipts, saveReceipt, type Draft, type Receipt } from "./receipts";
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
  const [view, setView] = useState<"compose" | "sent">("compose");
  const [draft, setDraft] = useState<Draft>({ ...empty });
  const [token, setToken] = useState("");
  const [ready, setReady] = useState(false);
  const [from, setFrom] = useState("");
  const [history, setHistory] = useState<Receipt[]>([]);
  const [cc, setCc] = useState(false);
  const [bcc, setBcc] = useState(false);
  const [busy, setBusy] = useState(false);
  const sending = useRef(false);
  const [notice, setNotice] = useState<{ text: string; ok: boolean } | null>(null);
  const [discard, setDiscard] = useState(false);
  useEffect(() => {
    const selectView = () => setView(location.hash === "#sent" ? "sent" : "compose");
    selectView();
    window.addEventListener("hashchange", selectView);
    const saved = readLocal(draftKey);
    if (isDraft(saved?.draft)) {
      setDraft(saved.draft); setCc(Boolean(saved.draft.cc)); setBcc(Boolean(saved.draft.bcc));
    }
    setToken(typeof saved?.token === "string" && saved.token ? saved.token : "send-email/" + crypto.randomUUID());
    setHistory(readReceipts());
    setReady(true);
    fetch("/api/sender").then(r => r.json()).then(s => setFrom((s as { from: string }).from || "Configure sender address")).catch(() => setFrom("Sender unavailable"));
    return () => window.removeEventListener("hashchange", selectView);
  }, []);
  useEffect(() => { if (ready) persist(draftKey, { draft, token }); }, [draft, token, ready]);

  function change(key: keyof Draft, value: string) {
    setDraft(previous => ({ ...previous, [key]: value })); setToken("send-email/" + crypto.randomUUID()); setNotice(null); setDiscard(false);
  }
  function reset() {
    setDraft({ ...empty }); setToken("send-email/" + crypto.randomUUID()); setCc(false); setBcc(false); setDiscard(false);
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (sending.current || !ready) return;
    sending.current = true; setBusy(true); setNotice(null);
    try {
      const result = await fetch("/api/send-email", { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": token }, body: JSON.stringify(draft) });
      const data = await result.json() as { id?: string; error?: string };
      if (!result.ok || !data.id) throw new Error(data.error || "The server could not confirm this send.");
      const receipt = { ...draft, id: data.id, at: new Date().toISOString(), from };
      setHistory(saveReceipt(receipt, history)); reset();
      setNotice({ ok: true, text: "Resend accepted your email. Its message ID is in Sent mail." });
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
          <form onSubmit={submit}><fieldset disabled={busy || !ready}>
            <div className="fields">
              <div className="field"><div className="label-line"><label htmlFor="to">To</label><div className="copies">{!cc && <button type="button" onClick={() => setCc(true)}>Cc</button>}{!bcc && <button type="button" onClick={() => setBcc(true)}>Bcc</button>}</div></div>
                <input id="to" type="email" multiple required value={draft.to} onChange={e => change("to", e.target.value)} placeholder="recipient@example.com" autoComplete="off"/></div>
              {(["cc", "bcc"] as const).filter(key => key === "cc" ? cc : bcc).map(key => <div className="field" key={key}>
                <div className="label-line"><label htmlFor={key}>{key === "cc" ? "Cc" : "Bcc"}</label><button className="icon-btn" type="button" aria-label={"Remove " + key} onClick={() => { change(key, ""); if (key === "cc") setCc(false); else setBcc(false); }}><X size={14}/></button></div>
                <input id={key} type="email" multiple autoFocus value={draft[key]} onChange={e => change(key, e.target.value)} placeholder="recipient@example.com"/></div>)}
              <div className="field"><label htmlFor="subject">Subject</label><input id="subject" required maxLength={500} value={draft.subject} onChange={e => change("subject", e.target.value)} placeholder="Add a subject line"/></div>
              <div className="field"><label htmlFor="message">Message</label><div className="text-wrap"><textarea id="message" required maxLength={50000} value={draft.message} onChange={e => change("message", e.target.value)} placeholder="Write your message here…"/><div className="text-meta"><span>Plain text</span><span>{draft.message.length.toLocaleString()} characters</span></div></div></div>
            </div>
            {notice && <div className={"notice " + (notice.ok ? "success" : "")} role={notice.ok ? "status" : "alert"}>{notice.text}</div>}
            <div className="actions"><button type="submit" className="primary"><Send size={16}/>{busy ? "Sending…" : "Send email"}</button>
              {discard ? <div className="discard"><span>Clear draft?</span><button type="button" onClick={() => { reset(); setNotice(null); }}>Clear</button><button type="button" onClick={() => setDiscard(false)}>Keep</button></div> : <button className="clear" type="button" disabled={!Object.values(draft).some(Boolean)} onClick={() => setDiscard(true)}>Clear draft</button>}
            </div>
          </fieldset></form>
        </section>
        <aside><section className="card preview"><header className="card-heading"><span className="tile"><Eye/></span><h2>Email preview</h2><span className="live"><i/>Live</span></header>
          <Envelope to={draft.to}/>
          <div className="preview-content"><div className="preview-address"><span>FROM</span><strong>{from || "Loading sender…"}</strong><span>TO</span><strong className={draft.to ? "" : "muted"}>{draft.to || "Recipient address"}</strong>
          {draft.cc && <><span>CC</span><strong>{draft.cc}</strong></>}{draft.bcc && <><span>BCC</span><strong>{draft.bcc}</strong></>}</div>
            <div className="preview-body"><h3>{draft.subject || "Your subject line"}</h3><p className={draft.message ? "" : "muted"}>{draft.message || "Your message will appear here as you type."}</p></div></div>
        </section><div className="privacy"><ShieldCheck size={15}/><span>Sent securely through Resend</span></div></aside>
      </div> : <SentMail history={history} onCompose={() => { location.hash = ""; setView("compose"); }}/>}
      <footer><span><Stamp size={15}/>Letterpress</span><span>Powered by <a href="https://resend.com" target="_blank" rel="noreferrer">Resend <ArrowUpRight size={12}/></a></span></footer>
    </main>
  </>;
}
