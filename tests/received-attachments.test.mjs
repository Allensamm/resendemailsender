import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readReplies} from '../lib/read-replies.ts';
const id='ab5eaa10-55aa-4e3a-a59a-0728a4f66ad5',fileId='c86ecfd1-3b68-4b77-ab05-4fdcb37c0569';
const settings={password:'private',apiKey:'mock',mailbox:'allensamuel@grassrut.com'};
const file={id:fileId,filename:'image.png',size:3,content_type:'image/png'};
const message={id,to:[settings.mailbox],from:'sender@example.org',text:'Files attached',html:null,subject:'Files',created_at:new Date().toISOString(),attachments:[file],message_id:'<parent@example.org>'};
const req=(query='',password='private')=>new Request('https://example.org/api/replies?id='+id+query,{headers:{authorization:'Bearer '+password}});
test('received attachment metadata supports cards and downloads are authenticated and mailbox-scoped',async t=>{
 let calls=0;t.mock.method(globalThis,'fetch',async()=>{calls++;return Response.json(message);});
 const body=await(await readReplies(req(),settings)).json();assert.deepEqual(body.files,[{id:fileId,filename:'image.png',size:3,contentType:'image/png'}]);
 calls=0;assert.equal((await readReplies(req('&attachment='+fileId,'wrong'),settings)).status,401);assert.equal(calls,0);
 assert.equal((await readReplies(req('&attachment='+fileId),{...settings,mailbox:'design@sovernpartners.com'})).status,404);assert.equal(calls,1);
 assert.equal((await readReplies(req('&attachment='+id),settings)).status,404);assert.equal(calls,2);
});
test('downloads stream provider bytes with safe filename and fresh links; previews allow raster images only',async t=>{
 let contentType='image/png';let downloads=0;
 t.mock.method(globalThis,'fetch',async(url)=>{
  if(String(url).startsWith('https://inbound-cdn.resend.com')){downloads++;return new Response(new Uint8Array([1,2,3]));}
  if(String(url).includes('/attachments/'))return Response.json({...file,filename:'../file\r\n.png',content_type:contentType,download_url:'https://inbound-cdn.resend.com/object?fresh=1'});
  return Response.json(message);
 });
 const download=await readReplies(req('&attachment='+fileId),settings);assert.equal(download.status,200);assert.deepEqual([...new Uint8Array(await download.arrayBuffer())],[1,2,3]);assert.match(download.headers.get('content-disposition'),/^attachment/);assert.doesNotMatch(download.headers.get('content-disposition'),/[\r\n]/);assert.equal(download.headers.get('cache-control'),'private, no-store');
 const preview=await readReplies(req('&attachment='+fileId+'&preview=1'),settings);assert.equal(preview.headers.get('content-type'),'image/png');assert.equal(preview.headers.get('x-content-type-options'),'nosniff');await preview.arrayBuffer();
 contentType='image/svg+xml';assert.equal((await readReplies(req('&attachment='+fileId+'&preview=1'),settings)).status,415);assert.equal(downloads,3);
});
test('untrusted download hosts and provider failures do not expose file URLs',async t=>{
 t.mock.method(globalThis,'fetch',async url=>String(url).includes('/attachments/')?Response.json({...file,download_url:'https://127.0.0.1/private'}):Response.json(message));
 const response=await readReplies(req('&attachment='+fileId),settings);assert.equal(response.status,502);assert.doesNotMatch(await response.text(),/127\.0\.0\.1/);
});
