export type EmailSignature = { name: string; role: string; company: string; email: string; website: string; tagline?: string };

export function senderSignature(from: string): EmailSignature | null {
  const address = (from.match(/<([^<>]+)>$/)?.[1] || from).trim().toLowerCase();
  if (address !== "samantha@sovernpartners.com") return null;
  return { name: "Samanthan", role: "Executive Search & Headhunting", company: "Sovern Partners", email: address, website: "https://sovernpartners.com", tagline: "Connecting exceptional leaders with ambitious organizations." };
}

function escape(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
export function signatureText(signature: EmailSignature) {
  return [signature.name, signature.company, signature.role, signature.email, signature.website.replace(/^https:\/\//, ""), ...(signature.tagline ? ["", signature.tagline] : [])].join("\n");
}
export function signatureHtml(signature: EmailSignature) {
  // Stored receipts are browser-controlled: only allow safe contact link protocols.
  const email = /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/.test(signature.email) ? "mailto:" + signature.email : "";
  const website = /^https:\/\//i.test(signature.website) ? signature.website : "";
  return '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:28px;max-width:360px;width:100%;font-family:Arial,Helvetica,sans-serif;line-height:1.5;color:#203047"><tr><td>'
    + '<div style="font-size:21px;font-weight:700;letter-spacing:-0.3px;color:#203047">' + escape(signature.name) + '</div>'
    + '<div style="font-size:12px;font-weight:700;letter-spacing:1.8px;text-transform:uppercase;margin-top:4px;color:#203047">' + escape(signature.company) + '</div>'
    + '<div style="font-size:12px;color:#687483;margin-top:2px">' + escape(signature.role) + '</div>'
    + '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:14px"><tr><td width="36" height="2" style="width:36px;height:2px;background-color:#b69a58;font-size:0;line-height:0">&nbsp;</td></tr></table>'
    + '<div style="font-size:13px;margin-top:12px"><a style="color:#203047;text-decoration:none" href="' + escape(email) + '">' + escape(signature.email) + '</a></div>'
    + '<div style="font-size:13px;margin-top:2px"><a style="color:#203047;text-decoration:none" href="' + escape(website) + '">' + escape(signature.website.replace(/^https:\/\//, "")) + '</a></div>'
    + (signature.tagline ? '<div style="font-family:Georgia,Times,serif;font-size:13px;font-style:italic;line-height:1.6;color:#687483;margin-top:14px">' + escape(signature.tagline) + '</div>' : '')
    + '</td></tr></table>';
}
