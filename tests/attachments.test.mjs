import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateAttachments, attachmentLimit } from '../lib/attachments.ts';
import { sendEmail } from '../lib/send-email.ts';
const pdf={filename:'proposal.pdf',content:Buffer.from('%PDF-1.4 test').toString('base64'),contentType:'application/pdf'};
const image={filename:'photo.png',content:Buffer.from('test-image').toString('base64'),contentType:'image/png'};
const settings={RESEND_API_KEY:'mock',RESEND_FROM:'allensamuel@grassrut.com',RESEND_REPLY_TO:'allensamuel@grassrut.com'};
const request=attachments=>new Request('https://example.org/api/send-email',{method:'POST',headers:{'content-type':'application/json','idempotency-key':'attachments/test'},body:JSON.stringify({to:'delivered@resend.dev',subject:'Files',message:'Attached',attachments})});
test('images and documents use inline base64 contents for new messages and threaded replies',async t=>{
 const envelopes=[];t.mock.method(globalThis,'fetch',async(_,options)=>{envelopes.push(JSON.parse(options.body));return Response.json({id:'mock'});});
 const thread={to:['delivered@resend.dev'],subject:'Re: Files',threadId:'<test@example.org>',headers:{'In-Reply-To':'<test@example.org>',References:'<test@example.org>'}};
 for(const target of [undefined,thread]) assert.equal((await sendEmail(request([pdf,image]),settings,target)).status,200);
 for(const envelope of envelopes){assert.deepEqual(envelope.attachments.map(a=>({filename:a.filename,content:a.content})),[pdf,image].map(({filename,content})=>({filename,content})));assert.equal(envelope.text,'Attached');assert.equal(envelope.from,settings.RESEND_FROM);}
 assert.deepEqual(envelopes[1].headers,thread.headers);
});
test('invalid attachments and excessive combined size fail before contacting the provider',async t=>{
 const transport=t.mock.method(globalThis,'fetch',()=>{throw Error('Unexpected provider request');});
 const big={...pdf,content:Buffer.alloc(attachmentLimit/2+1).toString('base64')};
 for(const files of [[{...pdf,filename:'../proposal.pdf'}],[{...pdf,filename:'run.exe'}],[{...pdf,content:'not base64!'}],[{filename:'remote.pdf',path:'https://example.org/a.pdf'}],Array(11).fill(pdf),[big,big]]) assert.equal((await sendEmail(request(files),settings)).status,400);
 assert.equal(transport.mock.callCount(),0);
 assert.equal(validateAttachments([{...pdf,content:Buffer.alloc(attachmentLimit).toString('base64')}]).length,1);
});
