import type { Metadata } from "next";
import { env } from "node:process";
import { WorkspaceHeader } from "../workspace-header";
import { ReplyInbox } from "./reply-inbox";

export const metadata: Metadata = { title: "Inbox — Letterpress" };
export const dynamic = "force-dynamic";

export default function Replies() {
  return <>
    <WorkspaceHeader current="replies"/>
    <main>
      <div className="page-heading"><h1>Inbox<span>.</span></h1>
        <p>Your conversations, together in one place.</p></div>
      <ReplyInbox passwordConfigured={Boolean(env.INBOX_PASSWORD)}/>
    </main>
  </>;
}
