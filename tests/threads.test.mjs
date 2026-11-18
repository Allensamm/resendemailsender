import { test } from "node:test";
import assert from "node:assert/strict";
import { groupReplies } from "../app/replies/threads.ts";

test("groups replies by shared references, across pages and partial reference chains", () => {
  const messages = [
    { id: "new", from: "a@example.org", subject: "Re: Hello", date: "2026-11-18T12:00:00Z" },
    { id: "unrelated", from: "a@example.org", subject: "Re: Hello", date: "2026-11-18T11:00:00Z" },
    { id: "old", from: "a@example.org", subject: "Hello", date: "2026-11-18T10:00:00Z" },
  ];
  const bodies = {
    new: { threadId: "<sent@example.org>", referenceIds: ["<sent@example.org>", "<new@example.org>"] },
    old: { threadId: "<root@example.org>", referenceIds: ["<root@example.org>", "<sent@example.org>"] },
    unrelated: { threadId: "<different@example.org>", referenceIds: ["<different@example.org>"] },
  };
  assert.deepEqual(groupReplies(messages, bodies).map(group => group.messages.map(message => message.id)), [["old", "new"], ["unrelated"]]);
  assert.equal(groupReplies(messages, {}).length, 3);
});
