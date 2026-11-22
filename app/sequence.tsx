"use client";
import { useEffect, useState } from 'react';
import { currentMailbox, mailboxFetch } from './mailbox';
import { saveReceipt, type Draft, type Receipt } from './receipts';
import type { MailAttachment } from '../lib/attachments';
type Job = { intervalMinutes?: 1 | 4; recipients: string[]; subject: string; message: string; messageHtml?: string; attachments: MailAttachment[]; startedAt: string; token: string };
export function SequenceSend({ draft, files, disabled, from, onHistory, onComplete, onBusy }: { draft: Draft; files: MailAttachment[]; disabled: boolean; from: string; onHistory: (history: Receipt[]) => void; onComplete: () => void; onBusy: (busy: boolean) => void }) {
  const design = currentMailbox() === 'design';
  const key = design ? 'letterpress.design.sequence.v1' : 'letterpress.allen.sequence.v1';
  const [job, setJob] = useState<Job | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  useEffect(() => { try { const saved = JSON.parse(localStorage.getItem(key) || 'null'); if (saved?.token && Array.isArray(saved.recipients)) { setJob(saved); setNotice('An unfinished sequence is saved. Retry to confirm its original schedules.'); } } catch {} }, [key]);
  async function send() {
    if (busy) return;
    const recipients = draft.to.split(',').map(value => value.trim()).filter(Boolean);
    if (!job && (!recipients.length || recipients.length > 20 || !draft.subject.trim() || !draft.message.trim())) { setNotice('Fill in recipients, subject, and message first.'); return; }
    const next = job || { intervalMinutes: design ? 1 as const : undefined, recipients, subject: draft.subject, message: draft.message, messageHtml: draft.messageHtml, attachments: files, startedAt: new Date().toISOString(), token: 'sequence/' + crypto.randomUUID() };
    try { localStorage.setItem(key, JSON.stringify(next)); } catch { setNotice('Browser storage is full or unavailable. Free some space before scheduling so retries can be saved safely.'); return; }
    setJob(next); setBusy(true); onBusy(true); setNotice('Scheduling individual emails… Keep this page open until confirmed.');
    try {
      const response = await mailboxFetch('/api/send-sequence', {method:'POST',headers:{'content-type':'application/json','idempotency-key':next.token},body:JSON.stringify(next)});
      const data = await response.json() as { receipts?: {id:string;to:string;scheduledAt:string}[]; error?:string };
      for (const receipt of data.receipts || []) onHistory(saveReceipt({to:receipt.to,cc:'',bcc:'',subject:next.subject,message:next.message,messageHtml:next.messageHtml,from,id:receipt.id,scheduledAt:receipt.scheduledAt,at:new Date().toISOString(),attachmentNames:next.attachments.map(file=>file.filename)}));
      if (!response.ok || data.error || data.receipts?.length !== next.recipients.length) throw Error((data.error || 'Some schedules could not be confirmed.') + ' ' + (data.receipts?.length || 0) + ' of ' + next.recipients.length + ' confirmed. Retry uses the same emails; it does not create a new sequence.');
      localStorage.removeItem(key); setJob(null); onComplete(); setNotice(next.recipients.length + (design ? ' individual emails scheduled ' + (next.intervalMinutes === 1 ? 'one minute' : 'four minutes') + ' apart. Last send about ' + (2 + (next.recipients.length - 1) * (next.intervalMinutes === 1 ? 1 : 4)) + ' minutes after your original Send click.' : ' individual emails scheduled within 20 minutes of your original Send click.') + ' You can start another batch now or close the browser. Scheduled emails continue in the background. See Sent mail for times and cancellation.');
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Could not confirm scheduling. Retry safely.'); }
    finally { setBusy(false); onBusy(false); }
  }
  return <div className="sequence-send"><p className="schedule-help">Each recipient gets a separate email. {design ? 'First send in about 2 minutes, then one every minute. A full batch of 20 takes about 21 minutes. Timing applies to this batch.' : 'First send in about 2 minutes; remaining emails are spaced evenly through minute 20.'} The same message and attachments go to each address. Once scheduling is confirmed, you can send another batch while previous batches run in the background.</p>
    {job && <p className="schedule-help">The saved sequence contains {job.recipients.length} recipients and uses its original message and attachments. Edits above apply only to a future sequence.</p>}
    <button type="button" className="primary" disabled={busy || disabled} onClick={() => void send()}>{busy ? 'Scheduling…' : job ? 'Retry scheduling' : 'Send individually'}</button>
    {job && !busy && <button type="button" className="inbox-control" onClick={() => { if (window.confirm('Stop retrying this sequence? Emails already accepted remain scheduled. Check Sent mail or Resend before starting again to avoid duplicates.')) { localStorage.removeItem(key); setJob(null); setNotice('Saved retry cleared. Existing scheduled emails are unchanged.'); } }}>Stop retrying</button>}
    {notice && <p className="notice" role="status">{notice}</p>}
  </div>;
}
