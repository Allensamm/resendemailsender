"use client";
import { useEffect, useRef, useState } from 'react';
import { Download, FileText, ImageIcon } from 'lucide-react';
import type { ReceivedFile } from '../../lib/read-replies';
import { mailboxFetch } from '../mailbox';
function sizeLabel(size:number) { return size >= 1048576 ? (size/1048576).toFixed(1)+' MB' : Math.max(1,Math.round(size/1024))+' KB'; }
function AttachmentCard({file,messageId}:{file:ReceivedFile;messageId:string}) {
 const [preview,setPreview]=useState('');
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const controller=useRef<AbortController | null>(null);
 const imageUrl=useRef('');
 useEffect(()=>()=>{controller.current?.abort();if(imageUrl.current)URL.revokeObjectURL(imageUrl.current);},[]);
 const image=/^image\/(png|jpeg|gif|webp|avif)$/i.test(file.contentType);
 async function load(show:boolean) {
   if(busy)return;setBusy(true);setError('');
   const pending=new AbortController();controller.current=pending;
   try {
     const query=new URLSearchParams({id:messageId,attachment:file.id});if(show)query.set('preview','1');
     const response=await mailboxFetch('/api/replies?'+query,{cache:'no-store',signal:pending.signal});
     if(!response.ok){const result=await response.json() as {error?:string};throw Error(result.error || 'Could not load this file. Try again.');}
     const blob=await response.blob();if(pending.signal.aborted)return;
     const url=URL.createObjectURL(blob);
     if(show){if(imageUrl.current)URL.revokeObjectURL(imageUrl.current);imageUrl.current=url;setPreview(url);}
     else{const link=document.createElement('a');link.href=url;link.download=file.filename;document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);}
   }catch(cause){if(!pending.signal.aborted)setError(cause instanceof Error?cause.message:'Could not load attachment.');}
   finally{if(!pending.signal.aborted)setBusy(false);}
 }
 return <div className="received-file">
   {preview && <a href={preview} target="_blank" rel="noreferrer" aria-label={'Open image '+file.filename}><img src={preview} alt={file.filename} onError={()=>{setPreview('');setError('This image could not be displayed. You can still download it.');}}/></a>}
   <div className="received-file-info">{image?<ImageIcon size={20}/>:<FileText size={20}/>}<span><strong>{file.filename}</strong><small>{sizeLabel(file.size)}</small></span></div>
   <div className="received-file-actions">{image && !preview && <button type="button" className="inbox-control" disabled={busy} onClick={()=>void load(true)}>Preview image</button>}
     <button type="button" className="inbox-control" disabled={busy} onClick={()=>void load(false)} aria-label={'Download '+file.filename}><Download size={14}/>Download</button></div>
   {busy && <small role="status">Loading attachment…</small>}{error && <p className="attachment-error" role="alert">{error}</p>}
 </div>;
}
export function ReceivedAttachments({files,messageId}:{files:ReceivedFile[];messageId:string}) {
 return <div className="received-files">{files.map(file=><AttachmentCard key={file.id} file={file} messageId={messageId}/>)}</div>;
}
