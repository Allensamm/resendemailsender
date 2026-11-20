import sanitizeHtml from 'sanitize-html';
export function cleanMessageHtml(value: string) {
  return sanitizeHtml(value, {
    allowedTags: ['p','div','br','strong','b','em','i','u','s','strike','ul','ol','li','blockquote','a'],
    allowedAttributes: { a: ['href'] },
    allowedSchemes: ['https','http','mailto'],
    allowProtocolRelative: false,
  });
}
export function plainMessageHtml(value: string) {
  return value.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>');
}
