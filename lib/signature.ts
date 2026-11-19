export type EmailSignature = { name: string; role: string; company: string; email: string; website: string };

export function senderSignature(from: string): EmailSignature | null {
  const address = (from.match(/<([^<>]+)>$/)?.[1] || from).trim().toLowerCase();
  if (address !== "samantha@sovernpartners.com") return null;
  return { name: "Samanthan", role: "Executive Search & Headhunting", company: "Sovern Partners", email: address, website: "https://sovernpartners.com" };
}

function escape(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
export function signatureText(signature: EmailSignature) {
  return [signature.name, signature.role, signature.company, signature.email, signature.website.replace(/^https:\/\//, "")].join("\n");
}
export function signatureHtml(signature: EmailSignature) {
  // Stored receipts are browser-controlled: only allow safe contact link protocols.
  const email = /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/.test(signature.email) ? "mailto:" + signature.email : "";
  const website = /^https:\/\//i.test(signature.website) ? signature.website : "";
  return '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:24px;max-width:100%;font-family:Arial,Helvetica,sans-serif;line-height:1.5;color:#203047"><tr><td style="border-left:3px solid #b69a58;padding:2px 0 2px 16px">'
    + '<div style="font-size:18px;font-weight:700;color:#203047">' + escape(signature.name) + '</div>'
    + '<div style="font-size:13px;color:#586579">' + escape(signature.role) + '</div>'
    + '<div style="font-size:14px;font-weight:700;letter-spacing:1px;margin-top:10px;color:#203047">' + escape(signature.company) + '</div>'
    + '<div style="font-size:13px;margin-top:5px"><a style="color:#203047;text-decoration:none" href="' + escape(email) + '">' + escape(signature.email) + '</a></div>'
    + '<div style="font-size:13px"><a style="color:#586579;text-decoration:none" href="' + escape(website) + '">' + escape(signature.website.replace(/^https:\/\//, "")) + '</a></div>'
    + '</td></tr></table>';
}
