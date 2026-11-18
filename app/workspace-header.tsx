import { ArrowUpRight, Inbox, MailOpen, PenLine, Send } from "lucide-react";

export function WorkspaceHeader({ current }: { current: "compose" | "sent" | "replies" }) {
  const links = [
    { id: "compose", href: "/", label: "Compose", Icon: PenLine },
    { id: "sent", href: "/#sent", label: "Sent mail", Icon: Inbox },
    { id: "replies", href: "/replies", label: "Replies", Icon: MailOpen },
  ];
  return <header className="top"><div className="top-inner">
    <a className="brand" href="/" aria-label="Letterpress home"><span className="logo"><Send size={23} strokeWidth={2}/></span>Letterpress</a>
    <nav aria-label="Workspace">{links.map(({ id, href, label, Icon }) =>
      <a key={id} href={href} className={current === id ? "selected" : ""} aria-current={current === id ? "page" : undefined}><Icon/>{label}</a>)}</nav>
    <a className="docs" href="https://resend.com/docs" target="_blank" rel="noreferrer">Resend docs <ArrowUpRight size={15}/></a>
  </div></header>;
}
