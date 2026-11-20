import {test} from 'node:test';
import assert from 'node:assert/strict';
import {emailBody} from '../lib/email-body.ts';
import {cleanMessageHtml} from '../lib/rich-text.ts';
import {sendEmail} from '../lib/send-email.ts';
import {sendSequence} from '../lib/send-sequence.ts';
const html='<p>Hello <strong>bold</strong> <em>italic</em> <u>underlined</u></p><ul><li>Item</li></ul><a href="https://example.org">Website</a>';
const settings={RESEND_API_KEY:'mock',RESEND_FROM:'allensamuel@grassrut.com',RESEND_REPLY_TO:'allensamuel@grassrut.com'};
const req=data=>new Request('https://example.org/api/send-sequence?mailbox=allen',{method:'POST',headers:{'content-type':'application/json','idempotency-key':'rich/test'},body:JSON.stringify(data)});
test('rich messages retain supported formatting and strip active content and unsafe links',()=>{
 const clean=cleanMessageHtml(html+'<script>alert(1)</script><img src=x onerror=alert(1)><a href="javascript:alert(1)">bad</a><div onclick="bad()" style="background:url(x)">Safe</div><iframe>hidden</iframe>');
 assert.match(clean,/<strong>bold<\/strong>/);assert.match(clean,/<em>italic<\/em>/);assert.match(clean,/<ul><li>Item/);assert.match(clean,/href="https:\/\/example.org"/);
 assert.doesNotMatch(clean,/script|onerror|onclick|style=|iframe|<img|javascript:/i);
 assert.throws(()=>emailBody('fake','<script>bad()</script>'),/Enter a message/);
 assert.throws(()=>emailBody('fake','x'.repeat(200001)),/too large/);
 assert.equal(emailBody('One <two>\nNext').text,'One <two>\nNext');
});
test('normal, threaded, scheduled and individual sequence sends preserve rich HTML and derive plain text',async t=>{
 const sent=[];t.mock.method(globalThis,'fetch',async(_,options)=>{sent.push(JSON.parse(options.body));return Response.json({id:'mock'});});
 const data={to:'delivered@resend.dev',subject:'Rich',message:'untrusted plain text',messageHtml:html};
 const thread={to:['delivered@resend.dev'],subject:'Re: Rich',threadId:'<x@example.org>',headers:{'In-Reply-To':'<x@example.org>',References:'<x@example.org>'}};
 assert.equal((await sendEmail(req(data),settings)).status,200);
 assert.equal((await sendEmail(req(data),settings,thread)).status,200);
 assert.equal((await sendEmail(req({...data,scheduledAt:new Date(Date.now()+3600000).toISOString()}),settings)).status,200);
 const result=await(await sendSequence(req({...data,recipients:['delivered@resend.dev'],startedAt:new Date().toISOString()}),settings)).json();assert.equal(result.receipts.length,1);
 for(const envelope of sent){assert.match(envelope.html,/<strong>bold<\/strong>/);assert.match(envelope.html,/<em>italic<\/em>/);assert.match(envelope.text,/Hello/);assert.doesNotMatch(envelope.text,/untrusted plain|<strong>/);}
});
