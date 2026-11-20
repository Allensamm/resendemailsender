"use client";
import { useId, useRef, useState } from 'react';
import { attachmentAccept, attachmentLimit, validateAttachments, type MailAttachment } from '../lib/attachments';
export function AttachmentPicker({ files, onChange, disabled, onBusy }: { files: MailAttachment[]; onChange: (files: MailAttachment[]) => void; disabled?: boolean; onBusy: (busy: boolean) => void }) {
  const id = useId();
  const reading = useRef(false);
  const [error, setError] = useState('');
  return <div className="attachment-picker"><label htmlFor={id}>Attach images or documents</label>
    <input id={id} type="file" multiple accept={attachmentAccept} disabled={disabled} onChange={async event => {
      const chosen = Array.from(event.target.files || []); event.target.value = '';
      if (reading.current || !chosen.length) return;
      reading.current = true; onBusy(true); setError('');
      try {
        if (chosen.reduce((sum, file) => sum + file.size, 0) > attachmentLimit) throw Error('Attachments must total 2 MB or less.');
        const added = await Promise.all(chosen.map(file => new Promise<MailAttachment>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve({filename: file.name, content: String(reader.result).split(',')[1], contentType: file.type || 'application/octet-stream'});
          reader.onerror = () => reject(Error('Could not read ' + file.name)); reader.readAsDataURL(file);
        })));
        onChange(validateAttachments([...files, ...added]));
      } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not attach files.'); }
      finally { reading.current = false; onBusy(false); }
    }}/>
    <p className="schedule-help">Up to 10 files, 2 MB total. Reattach files if you refresh or switch mailboxes.</p>
    {files.map((file, index) => <div className="attachment-row" key={index}>
      {/\.(png|jpe?g|gif|webp)$/i.test(file.filename) && <img src={'data:image/' + (/\.jpe?g$/i.test(file.filename) ? 'jpeg' : file.filename.split('.').pop()?.toLowerCase()) + ';base64,' + file.content} alt={file.filename}/>}
      <span>{file.filename}</span><button type="button" className="inbox-control" disabled={disabled} aria-label={'Remove attachment ' + file.filename} onClick={() => onChange(files.filter((_, i) => i !== index))}>Remove</button>
    </div>)}
    {error && <p className="notice" role="alert">{error}</p>}
  </div>;
}
