import type { Metadata } from "next";
import { env } from "node:process";
import { WorkspaceHeader } from "../workspace-header";
import { ReplyInbox } from "./reply-inbox";

export const metadata: Metadata = { title: "Replies — Letterpress" };
export const dynamic = "force-dynamic";

export default function Replies() {
  return <>
    <WorkspaceHeader current="replies"/>
    <main>
      <div className="page-heading"><h1>Replies<span>.</span></h1>
        <p>Read the messages sent to your Letterpress reply address.</p></div>
      <ReplyInbox passwordConfigured={Boolean(env.INBOX_PASSWORD)}/>
    </main>
  </>;
}
