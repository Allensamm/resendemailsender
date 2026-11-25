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

test('iPhone quoted headers with real line breaks separate the outgoing message',()=>{
 const input=`Hello again Samantha,

What more can you tell me about this position?

Stacey
Sent from my iPhone

> On Nov 20, 2026, at 1:53 a.m., samantha@sovernpartners.com wrote:
> ﻿
> Hi Stacey, Thank you for getting back to me.
> Kind regards,
> Samantha`;
 const result=splitChatText(input);
 assert.ok(result.text.includes('What more can you tell me'));
 assert.ok(!result.text.includes('Hi Stacey'));
 assert.equal(result.history.length,1);
 assert.equal(result.history[0].sender,'samantha@sovernpartners.com');
 assert.equal(result.history[0].text,'Hi Stacey, Thank you for getting back to me.\nKind regards,\nSamantha');
});
