import {test} from 'node:test';
import assert from 'node:assert/strict';
import {resolveSentTarget} from '../lib/read-replies.ts';
import {sendEmail} from '../lib/send-email.ts';
const id='ab5eaa10-55aa-4e3a-a59a-0728a4f66ad5';
const settings={password:'private',apiKey:'mock',sender:'Design <design@example.org>'};
const request=()=>new Request('https://example.org/api/replies/follow-up?id='+id,{method:'POST',headers:{authorization:'Bearer private','content-type':'application/json','idempotency-key':'follow-up/test'},body:JSON.stringify({to:'attacker@example.org',subject:'tampered',message:'Following up'})});
const original={id,from:settings.sender,to:['person@example.net'],subject:'Hello',last_event:'delivered',message_id:'original@example.org'};
test('sent follow-up uses verified recipients, subject and original Message-ID',async t=>{
 let sent;
 t.mock.method(globalThis,'fetch',async(_,options)=>{if(options.method==='POST'){sent=JSON.parse(options.body);return Response.json({id});}return Response.json(original);});
 const req=request();const target=await resolveSentTarget(req,settings);
 assert.deepEqual(target.to,['person@example.net']);assert.equal(target.headers['In-Reply-To'],'<original@example.org>');
 const result=await sendEmail(req,{RESEND_API_KEY:'mock',RESEND_FROM:settings.sender,RESEND_REPLY_TO:'design@example.org'},target);
 assert.equal(result.status,200);assert.deepEqual(sent.to,['person@example.net']);assert.equal(sent.subject,'Re: Hello');assert.equal(sent.headers.References,'<original@example.org>');assert.equal(sent.bcc,undefined);
});
test('sent follow-ups reject unauthorized, wrong-mailbox and unsent parents',async t=>{
 let data=original;let calls=0;
 t.mock.method(globalThis,'fetch',async()=>{calls++;return Response.json(data);});
 const unauthorized=request();unauthorized.headers.delete('authorization');assert.equal((await resolveSentTarget(unauthorized,settings)).status,401);assert.equal(calls,0);
 data={...original,from:'other@example.org'};assert.equal((await resolveSentTarget(request(),settings)).status,404);
 for(const event of ['scheduled','queued','canceled','failed','bounced']){data={...original,last_event:event};assert.equal((await resolveSentTarget(request(),settings)).status,409);}
 data={...original,message_id:''};assert.equal((await resolveSentTarget(request(),settings)).status,422);
});
