import { signatureHtml, type EmailSignature } from "../lib/signature";

export function SignaturePreview({ signature }: { signature?: EmailSignature | null }) {
  if (!signature) return null;
  return <div className="email-signature" aria-label="Email signature" dangerouslySetInnerHTML={{ __html: signatureHtml(signature) }}/>;
}
