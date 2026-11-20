export type MailAttachment = { filename: string; content: string; contentType: string };
export const attachmentLimit = 2 * 1024 * 1024;
export const attachmentAccept = '.png,.jpg,.jpeg,.gif,.webp,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.rtf,.odt,.ods,.odp';
const allowed = /\.(png|jpe?g|gif|webp|pdf|docx?|xlsx?|pptx?|txt|csv|rtf|odt|ods|odp)$/i;
export function validateAttachments(value: unknown): MailAttachment[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 10) throw Error('Attach up to 10 files.');
  let total = 0;
  return value.map(file => {
    if (!file || typeof file !== 'object' || typeof file.filename !== 'string' || !allowed.test(file.filename) || file.filename.length > 200 || /[\x00-\x1f/\\]/.test(file.filename)) throw Error('Choose images or supported documents with valid file names.');
    if (typeof file.content !== 'string' || !file.content.length || file.content.length > Math.ceil(attachmentLimit / 3) * 4 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(file.content)) throw Error('An attachment could not be read. Please attach it again.');
    total += file.content.length / 4 * 3 - (file.content.endsWith('==') ? 2 : file.content.endsWith('=') ? 1 : 0);
    if (total > attachmentLimit) throw Error('Attachments must total 2 MB or less.');
    const contentType = typeof file.contentType === 'string' && /^[\w.+-]+\/[\w.+-]+$/.test(file.contentType) ? file.contentType : 'application/octet-stream';
    return { filename: file.filename, content: file.content, contentType };
  });
}
