import {test} from 'node:test';
import assert from 'node:assert/strict';
import {sendSequence} from '../lib/send-sequence.ts';
const settings={RESEND_API_KEY:'mock',RESEND_FROM:'Allen Samuel <allensamuel@grassrut.com>',RESEND_REPLY_TO:'allensamuel@grassrut.com'};
const payload=()=>({recipients:Array.from({length:20},(_,i)=>`person${i}@example.org`),subject:'Hello',message:'One <two>',attachments:[{filename:'note.txt',content:'aGk=',contentType:'text/plain'}],startedAt:new Date().toISOString()});
const request=(data, mailbox='allen')=>new Request('https://example.org/api/send-sequence?mailbox='+mailbox,{method:'POST',headers:{'content-type':'application/json','idempotency-key':'sequence/test'},body:JSON.stringify(data)});
test('20 separate private emails are scheduled between minutes 2 and 20 with stable retry keys',async t=>{
 t.mock.method(globalThis,'setTimeout',fn=>{queueMicrotask(fn);return 0;});
 const sent=[];
 t.mock.method(globalThis,'fetch',async(_,options)=>{sent.push({body:JSON.parse(options.body),key:new Headers(options.headers).get('idempotency-key')});return Response.json({id:'id-'+sent.length});});
 const data=payload();const result=await(await sendSequence(request(data),settings)).json();
 assert.equal(result.receipts.length,20);
 const times=sent.map(item=>Date.parse(item.body.scheduled_at));
 assert.equal(times[0],Date.parse(data.startedAt)+120000);assert.equal(times[19],Date.parse(data.startedAt)+1200000);
 for(let i=0;i<20;i++){assert.deepEqual(sent[i].body.to,[data.recipients[i]]);assert.equal(sent[i].body.cc,undefined);assert.equal(sent[i].body.bcc,undefined);assert.equal(sent[i].body.attachments[0].content,'aGk=');assert.equal(sent[i].key,'sequence/test/'+i);if(i) assert.ok(times[i]>times[i-1]);}
 await sendSequence(request(data),settings);assert.deepEqual(sent.slice(0,20),sent.slice(20));
});
test('partial provider failure returns successful receipts and never switches past slots to immediate sending',async t=>{
 t.mock.method(globalThis,'setTimeout',fn=>{queueMicrotask(fn);return 0;});let calls=0;const sent=[];
 t.mock.method(globalThis,'fetch',async(_,options)=>{calls++;sent.push(JSON.parse(options.body));return calls===2?Response.json({message:'Quota reached',name:'validation_error',statusCode:429},{status:429}):Response.json({id:'first'});});
 const data={...payload(),startedAt:new Date(Date.now()-3600000).toISOString()};const result=await(await sendSequence(request(data),settings)).json();
 assert.equal(result.receipts.length,1);assert.match(result.error,/Quota/);assert.equal(calls,2);assert.ok(sent.every(item=>Date.parse(item.scheduled_at)<Date.now()));
});
test('invalid recipients, duplicates and mailbox misuse are rejected before any sends',async t=>{
 const transport=t.mock.method(globalThis,'fetch',()=>{throw Error('Unexpected send');});
 for(const recipients of [[],Array(21).fill('a@example.org'),['a@example.org','A@example.org'],['bad'],['a@example.org,b@example.org']]) assert.equal((await sendSequence(request({...payload(),recipients}),settings)).status,400);
 assert.equal((await sendSequence(request(payload(),'samantha'),settings)).status,400);assert.equal(transport.mock.callCount(),0);
});

test('Design schedules 20 private emails four minutes apart with stable retries',async t=>{
 t.mock.method(globalThis,'setTimeout',fn=>{queueMicrotask(fn);return 0;});
 const sent=[];
 t.mock.method(globalThis,'fetch',async(_,options)=>{sent.push(JSON.parse(options.body));return Response.json({id:'design-'+sent.length});});
 const data=payload(); const config={...settings,RESEND_FROM:'design@sovernpartners.com',RESEND_REPLY_TO:'design@sovernpartners.com'};
 const result=await(await sendSequence(request(data,'design'),config)).json();
 assert.equal(result.receipts.length,20);
 for(let i=0;i<20;i++) { assert.equal(Date.parse(sent[i].scheduled_at),Date.parse(data.startedAt)+120000+i*240000); assert.deepEqual(sent[i].to,[data.recipients[i]]); assert.equal(sent[i].from,config.RESEND_FROM); }
 await sendSequence(request(data,'design'),config); assert.deepEqual(sent.slice(0,20),sent.slice(20));
});
