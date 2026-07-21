/** Opens Meta Business WhatsApp Message Templates manager in a new tab. */
export function openMetaMessageTemplates(wabaId?: string | null) {
  const base = 'https://business.facebook.com/wa/manage/message-templates/';
  const url = wabaId
    ? `${base}?waba_id=${encodeURIComponent(wabaId)}`
    : base;
  window.open(url, '_blank', 'noopener,noreferrer');
}
