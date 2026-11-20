import { convert } from 'html-to-text';
import { cleanMessageHtml } from './rich-text.ts';
export function emailBody(message: string, messageHtml?: unknown) {
  if (messageHtml === undefined) return { text: message, html: '<div style="white-space:pre-wrap">' + message.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') + '</div>' };
  if (typeof messageHtml !== 'string' || messageHtml.length > 200000) throw Error('Formatted message is too large or invalid.');
  const html = cleanMessageHtml(messageHtml);
  const text = convert(html, {wordwrap:false});
  if (!text.trim() || text.length > 50000) throw Error('Enter a message of up to 50,000 characters.');
  return {text, html:'<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6">' + html + '</div>'};
}
