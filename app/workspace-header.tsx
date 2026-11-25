"use client";
import { useEffect, useState } from "react";
import { currentMailbox, mailboxUrl, type Mailbox } from "./mailbox";
import { ReplyBadge } from "./replies/reply-badge";
import { ArrowUpRight, Inbox, MailOpen, PenLine, Send } from "lucide-react";

export function WorkspaceHeader({ current }: { current: "compose" | "sent" | "replies" }) {
  const [mailbox, setMailbox] = useState<Mailbox>("samantha");
  useEffect(() => setMailbox(currentMailbox()), []);
  const links = [
    { id: "compose", href: "/", label: "Compose", Icon: PenLine },
    { id: "sent", href: "/#sent", label: "Sent mail", Icon: Inbox },
    { id: "replies", href: "/replies", label: "Replies", Icon: MailOpen },
  ];
  return <header className="top"><div className="top-inner">
    <a className="brand" href={mailboxUrl("/", mailbox)} aria-label="Letterpress home"><span className="logo"><Send size={23} strokeWidth={2}/></span><span className="brand-wordmark">Letterpress<small>Your email studio</small></span></a>
    <label className="mailbox-switch">Mailbox
      <select aria-label="Mailbox" value={mailbox} onChange={event => {
        window.location.href = mailboxUrl(window.location.pathname + window.location.hash, event.target.value as Mailbox);
      }}><option value="samantha">Samantha</option><option value="design">Design</option><option value="allen">Allen Samuel</option></select>
    </label>
    <nav aria-label="Workspace">{links.map(({ id, href, label, Icon }) =>
      <a key={id} href={mailboxUrl(href, mailbox)} className={current === id ? "selected" : ""} aria-current={current === id ? "page" : undefined}><Icon/>{label}{id === "replies" && <ReplyBadge/>}</a>)}</nav>
    <a className="docs" href="https://resend.com/docs" target="_blank" rel="noreferrer">Resend docs <ArrowUpRight size={15}/></a>
  </div></header>;
}
