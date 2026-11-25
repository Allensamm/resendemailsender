import { test } from 'node:test';
import assert from 'node:assert/strict';
import { conversationStatus } from '../app/replies/conversation-status.ts';
const message = { id:'incoming', date:'2026-11-25T10:00:00Z' };
const receipt = { id:'outgoing', at:'2026-11-25T10:05:00Z', parent:{id:'incoming'} };
test('inbox distinguishes unread, read and successful replies and prioritizes new mail',()=>{
 assert.equal(conversationStatus([message],{},[],()=>false),'unread');
 assert.equal(conversationStatus([message],{},[],()=>true),'read');
 assert.equal(conversationStatus([message],{},[receipt],()=>true),'replied');
 const newer={id:'new',date:'2026-11-25T10:10:00Z'};
 assert.equal(conversationStatus([message,newer],{},[receipt],id=>id==='incoming'),'unread');
 assert.equal(conversationStatus([message,newer],{},[receipt],()=>true),'read');
 for(const r of [{...receipt,parent:{id:'other'}},{...receipt,canceled:true},{...receipt,scheduledAt:'2026-11-26T00:00:00Z'}]) assert.equal(conversationStatus([message],{},[r],()=>true),'read');
 assert.equal(conversationStatus([message],{incoming:{threadId:'thread',referenceIds:[]}},[{...receipt,parent:undefined,threadId:'thread'}],()=>true),'replied');
});
