import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mailboxSettings } from '../lib/mailboxes.ts';
import { sendEmail } from '../lib/send-email.ts';
import { readReplies, resolveReplyTarget } from '../lib/read-replies.ts';
import { saveReceipt, readReceipts } from '../app/receipts.ts';
import { mailboxKey, mailboxUrl } from '../app/mailbox.ts';
const settings = { RESEND_API_KEY: 'mock', RESEND_FROM: 'samantha@sovernpartners.com', RESEND_REPLY_TO: 'samantha@sovernpartners.com' };
const id = 'ab5eaa10-55aa-4e3a-a59a-0728a4f66ad5';
const req = query => new Request('https://example.org/api/replies?' + query, { headers: {authorization:'Bearer secret'} });

test('only approved mailboxes can be selected; Design sends without a signature', async t => {
 assert.equal(mailboxSettings(req(''), settings), settings);
 assert.equal(mailboxSettings(req('mailbox=other'), settings).status,400);
 const design = mailboxSettings(req('mailbox=design'),settings);
 let sent;
 t.mock.method(globalThis,'fetch',async (_, options) => {sent=JSON.parse(options.body);return Response.json({id});});
 const response = await sendEmail(new Request('https://example.org/api/send-email?mailbox=design', {method:'POST',headers:{'content-type':'application/json','idempotency-key':'design/test'},body:JSON.stringify({to:'delivered@resend.dev',subject:'Design',message:'Hello',from:settings.RESEND_FROM})}),design);
 assert.equal(response.status,200);assert.equal((await response.json()).signature,undefined);
 assert.equal(sent.from,'design@sovernpartners.com');assert.equal(sent.reply_to,sent.from);assert.equal(sent.text,'Hello');assert.doesNotMatch(sent.html,/Samanthan|Sovern Partners/);
});
test('Design lists and counts only Design replies, rejects Samantha threads and hides her delivery statuses', async t => {
 const inbox={password:'secret',apiKey:'mock',mailbox:'design@sovernpartners.com',sender:'design@sovernpartners.com'};
 const own={id,from:'delivered@resend.dev',to:[inbox.mailbox],subject:'Design reply',created_at:new Date().toISOString()};
 const foreign={...own,id:'c86ecfd1-3b68-4b77-ab05-4fdcb37c0569',to:[settings.RESEND_FROM]};
 const mock=t.mock.method(globalThis,'fetch',async ()=>Response.json({data:[own,foreign],has_more:false}));
 assert.deepEqual((await (await readReplies(req('view=badge'),inbox)).json()).ids,[id]);
 assert.equal((await (await readReplies(req(''),inbox)).json()).messages.length,1);
 mock.mock.mockImplementation(async()=>Response.json(foreign));
 assert.equal((await readReplies(req('id='+foreign.id),inbox)).status,404);
 assert.equal((await resolveReplyTarget(req('id='+foreign.id),inbox)).status,404);
 mock.mock.mockImplementation(async()=>Response.json({id,from:settings.RESEND_FROM,last_event:'delivered'}));
 assert.deepEqual((await (await readReplies(req('view=sent-status&receipt='+id),inbox)).json()).events,{});
});
test('mailbox navigation and stored drafts and receipts stay separate without migrating Samantha history', t => {
 const values=new Map();
 for(const [key,value] of Object.entries({window:{location:{search:''}},localStorage:{getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v)}})) {
  const original=Object.getOwnPropertyDescriptor(globalThis,key);Object.defineProperty(globalThis,key,{configurable:true,value});
  t.after(()=>original?Object.defineProperty(globalThis,key,original):delete globalThis[key]);
 }
 const receipt={id:'samantha',at:new Date().toISOString(),from:settings.RESEND_FROM,to:'delivered@resend.dev',cc:'',bcc:'',subject:'Private',message:'Hi'};
 saveReceipt(receipt);assert.equal(mailboxKey('draft'),'draft');
 window.location.search='?mailbox=design';assert.deepEqual(readReceipts(),[]);assert.equal(mailboxKey('draft'),'draft.design');
 assert.equal(mailboxUrl('/#sent'),'/?mailbox=design#sent');assert.equal(mailboxUrl('/api/replies?id=abc'),'/api/replies?id=abc&mailbox=design');
 saveReceipt({...receipt,id:'design',from:'design@sovernpartners.com'});assert.equal(readReceipts()[0].id,'design');
 window.location.search='';assert.deepEqual(readReceipts().map(r=>r.id),['samantha']);
});
