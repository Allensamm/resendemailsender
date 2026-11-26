"use client";
import { useRef, useState } from 'react';
import { Send } from 'lucide-react';
import { RichComposer } from './rich-composer';
import { AttachmentPicker } from './attachment-picker';
import type { MailAttachment } from '../lib/attachments';
import { mailboxFetch, mailboxUrl } from './mailbox';
import { saveReceipt, type Receipt } from './receipts';
import type { EmailSignature } from '../lib/signature';

export function SentFollowUp({receipt, locked, onHistory}:{receipt:Receipt;locked:boolean;onHistory:(history:Receipt[])=>void}) {
  const [open,setOpen]=useState(false);
  const [text,setText]=useState('');
  const [html,setHtml]=useState<string>();
  const [files,setFiles]=useState<MailAttachment[]>([]);
  const [reading,setReading]=useState(false);
  const [busy,setBusy]=useState(false);
  const [notice,setNotice]=useState('');
  const pending=useRef(false);
  const token=useRef('');
  function changed() { token.current='follow-up/'+crypto.randomUUID(); setNotice(''); }
  async function send() {
    if(pending.current || reading || !text.trim()) return;
    pending.current=true;setBusy(true);setNotice('');
    if(!token.current) token.current='follow-up/'+crypto.randomUUID();
    try {
      const response=await mailboxFetch('/api/replies/follow-up?id='+encodeURIComponent(receipt.id),{method:'POST',headers:{'content-type':'application/json','idempotency-key':token.current},body:JSON.stringify({message:text,messageHtml:html,attachments:files})});
      const result=await response.json() as {id?:string;from:string;to:string;subject:string;threadId:string;signature?:EmailSignature;error?:string};
      if(!response.ok || !result.id) throw Error(result.error || 'Could not confirm sending. Retry this message.');
      onHistory(saveReceipt({...receipt,threadId:result.threadId}));
      onHistory(saveReceipt({id:result.id,from:result.from,to:result.to,subject:result.subject,cc:'',bcc:'',message:text,messageHtml:html,at:new Date().toISOString(),threadId:result.threadId,signature:result.signature,attachmentNames:files.map(file=>file.filename)}));
      setText('');setHtml(undefined);setFiles([]);token.current='';setOpen(false);setNotice('Follow-up sent in the same email thread.');
    } catch(error) {setNotice(error instanceof Error ? error.message : 'Could not send. Retry this message.');}
    finally{pending.current=false;setBusy(false);}
  }
  return <div className="sent-follow-up">
    {locked ? <p><a href={mailboxUrl('/inbox')}>Unlock Inbox</a> to send a follow-up.</p> : !open ? <button type="button" className="primary" onClick={()=>setOpen(true)}>Reply / follow up</button> : <div className="thread-compose">
      <p className="schedule-help">To {receipt.to}. This continues the same email thread. Cc and Bcc recipients are not included.</p>
      <RichComposer id={'follow-up-'+receipt.id} label="Follow-up message" text={text} html={html} disabled={busy} onChange={(value,markup)=>{setText(value);setHtml(markup);changed();}}/>
      <AttachmentPicker files={files} disabled={busy || reading} onBusy={setReading} onChange={value=>{setFiles(value);changed();}}/>
      <div className="thread-actions"><button type="button" className="inbox-control" disabled={busy} onClick={()=>setOpen(false)}>Close</button><button type="button" className="primary" disabled={busy || reading || !text.trim()} onClick={()=>void send()}><Send size={15}/>{busy?'Sending…':'Send follow-up'}</button></div>
    </div>}
    {notice && <p role="status" className="schedule-help">{notice}</p>}
  </div>;
}
