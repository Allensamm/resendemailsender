"use client";
import { useEffect, useRef, useState } from 'react';
import { cleanMessageHtml, plainMessageHtml } from '../lib/rich-text';
const commands = [
 ['bold','Bold','B'],['italic','Italic','I'],['underline','Underline','U'],['strikeThrough','Strikethrough','S'],
 ['insertUnorderedList','Bulleted list','• List'],['insertOrderedList','Numbered list','1. List'],
 ['undo','Undo','↶'],['redo','Redo','↷'],['removeFormat','Clear formatting','Tx'],
];
export function RichComposer({id, label, text, html, disabled, onChange}: {id:string;label:string;text:string;html?:string;disabled?:boolean;onChange:(text:string,html:string)=>void}) {
 const editor = useRef<HTMLDivElement>(null);
 const last = useRef<string | null>(null);
 const [active,setActive] = useState<string[]>([]);
 const [error,setError] = useState('');
 useEffect(()=>{
   const next = html === undefined ? plainMessageHtml(text) : cleanMessageHtml(html);
   if(editor.current && next !== last.current) {editor.current.innerHTML=next;last.current=next;}
 },[text,html]);
 const refresh = () => setActive(commands.filter(([command])=>document.queryCommandState(command)).map(([command])=>command));
 function emit() {
   if(!editor.current)return;
   const value=editor.current.innerText;
   const markup=cleanMessageHtml(editor.current.innerHTML);
   last.current=markup;
   setError(value.length>50000 || markup.length>200000?'Message is too long. Shorten it before sending.':'');
   onChange(value,markup);refresh();
 }
 function command(name:string,value?:string){editor.current?.focus();document.execCommand('styleWithCSS',false,'false');document.execCommand(name,false,value);emit();}
 return <div className={'rich-composer' + (disabled?' disabled':'')}>
   <div className="format-toolbar" role="toolbar" aria-label={label+' formatting'}>
     {commands.map(([name,title,icon])=><button type="button" key={name} title={title} aria-label={title} aria-pressed={active.includes(name)} disabled={disabled} onMouseDown={event=>event.preventDefault()} onClick={()=>command(name)}><span className={'format-'+name}>{icon}</span></button>)}
     <button type="button" disabled={disabled} aria-label="Insert link" title="Insert link" onMouseDown={event=>event.preventDefault()} onClick={()=>{const url=window.prompt('Link address (https://example.com)');if(url===null)return;if(!/^(https?:\/\/|mailto:)/i.test(url.trim())){setError('Use a link beginning with https://, http://, or mailto:.');return;}command('createLink',url.trim());}}>Link</button>
     <button type="button" disabled={disabled} aria-label="Remove link" onMouseDown={event=>event.preventDefault()} onClick={()=>command('unlink')}>Unlink</button>
   </div>
   <div id={id} ref={editor} className="rich-editor" role="textbox" aria-label={label} aria-multiline="true" aria-required="true" aria-disabled={disabled} contentEditable={!disabled} suppressContentEditableWarning data-placeholder="Write your message here…" onInput={emit} onMouseUp={refresh} onKeyUp={refresh}
     onPaste={event=>{event.preventDefault();const pasted=event.clipboardData.getData('text/html');const plain=event.clipboardData.getData('text/plain');command('insertHTML',pasted?cleanMessageHtml(pasted):plainMessageHtml(plain));}}
     onDrop={event=>event.preventDefault()}/>
   <div className="text-meta"><span>Rich text</span><span>{text.length.toLocaleString()} characters</span></div>
   {error && <p className="notice" role="alert">{error}</p>}
 </div>;
}
export function MessageContent({text,html}: {text:string;html?:string}) {
 return html === undefined ? <p style={{whiteSpace:'pre-wrap'}}>{text}</p> : <div className="formatted-message" dangerouslySetInnerHTML={{__html:cleanMessageHtml(html)}}/>;
}
