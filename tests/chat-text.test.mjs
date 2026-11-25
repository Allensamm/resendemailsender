import {test} from 'node:test';
import assert from 'node:assert/strict';
import {splitChatText} from '../app/replies/chat-text.ts';
test('extracts nested email history into separate messages',()=>{
 const result=splitChatText('Latest response\n\nOn Wednesday, Samantha <samantha@example.com> wrote:\n> My answer\n>\n> On Tuesday, Person <person@example.org> wrote:\n> > Original question');
 assert.equal(result.text,'Latest response');
 assert.deepEqual(result.history,[{sender:'person@example.org',text:'Original question'},{sender:'samantha@example.com',text:'My answer'}]);
});
test('ordinary prose and unsupported headers are retained',()=>{
 for(const text of ['My answer\n> a relevant quotation\nAnother answer','On the form I wrote:\nSome text']) assert.equal(splitChatText(text).text,text);
});
