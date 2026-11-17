import { useId, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import Icon from './Icon';
import { ErrorBox } from './UI';
import { localize, useLanguage } from '../lib/language';

function publicationUrl(id: string): string | null {
  const configured = import.meta.env.VITE_PUBLIC_APP_URL?.trim();
  if (!configured && Capacitor.isNativePlatform()) return null;
  try {
    const url = new URL(configured || window.location.href);
    const local = /^(localhost|127\.|0\.0\.0\.0|\[::1\]|192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/i.test(url.hostname);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || local) return null;
    url.search = '';
    url.hash = `cerca/${encodeURIComponent(id)}`;
    return url.href;
  } catch { return null; }
}

export default function PublicationActions({ id, title, description, phone }: { id: string; title: string; description: string; phone?: string | null }) {
  const { language } = useLanguage();
  const panelId = useId();
  const [expanded, setExpanded] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const url = publicationUrl(id);
  const text = [title, description, phone ? `${localize(language,'Contacto:','Contact:','Rimaypaq:')} +${phone}` : '', url].filter(Boolean).join('\n');
  const greeting = encodeURIComponent(localize(language,`Hola, vi tu publicación en AYNI: ${title}`,`Hi, I saw your listing on AYNI: ${title}`,`Rimaykullayki, AYNI-pi willayniykita rikurqani: ${title}`));
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const nativeShare = Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('Share');

  async function copyLink() {
    if (!url) return;
    setError(''); setFeedback('');
    try { await navigator.clipboard.writeText(url); setFeedback(localize(language,'Enlace copiado. Ya puedes pegarlo en una conversación.','Link copied. You can paste it into a conversation.','Tinkina copia wasqañam. Kunan rimayman k’askachiyta atinki.')); }
    catch { setError(localize(language,'No pudimos copiar el enlace. Selecciónalo abajo para copiarlo manualmente.','We could not copy the link. Select it below to copy it manually.','Tinkinata manam copiayta atirqanchu. Uraipi akllay, makiykiwan copiayta atinaykipaq.')); }
  }
  async function share() {
    setError(''); setFeedback(''); setBusy(true);
    try {
      if (nativeShare) {
        const { Share } = await import('@capacitor/share');
        await Share.share({ title, text, ...(url ? { url } : {}), dialogTitle: localize(language,'Compartir publicación','Share listing','Willayta rakiy') });
      } else await navigator.share({ title, text, ...(url ? { url } : {}) });
    } catch (cause) {
      if (!(cause instanceof Error && (cause.name === 'AbortError' || /cancel/i.test(cause.message)))) setError(localize(language,'No pudimos abrir las aplicaciones. Puedes compartir por WhatsApp o copiar el enlace.','We could not open the apps. You can share on WhatsApp or copy the link.','Aplicacionkunata manam kichayta atirqanchu. WhatsApp nisqapi rakiy utaq tinkinata copiay.'));
    } finally { setBusy(false); }
  }

  return <>
    <div className="publication-share-actions" role="group" aria-label={localize(language,'Contactar y compartir','Contact and share','Rimay, rakiy ima')}>
      {phone && <>
        <a className="whatsapp-btn" href={`https://wa.me/${phone}?text=${greeting}`} target="_blank" rel="noopener noreferrer"><Icon name="whatsapp" size={20}/><span>{localize(language,'Contactar por WhatsApp','Contact on WhatsApp','WhatsApp nisqapi rimay')}</span></a>
        <a className="outline-btn" href={`sms:+${phone}${ios ? '&' : '?'}body=${greeting}`}><Icon name="message" size={20}/><span>{localize(language,'Enviar SMS','Send SMS','SMS-ta kachay')}</span></a>
      </>}
      <button type="button" className="outline-btn publication-share-toggle" aria-expanded={expanded} aria-controls={panelId} onClick={() => setExpanded(value => !value)}><Icon name="share" size={18}/><span>{localize(language,'Compartir publicación','Share listing','Willayta rakiy')}</span><span className="publication-share-indicator" aria-hidden="true">{expanded ? '−' : '+'}</span></button>
    </div>
    {expanded && <section id={panelId} className="publication-share-panel" aria-label={localize(language,'Opciones para compartir','Sharing options','Rakinapaq akllanakuna')}>
      <h3>{localize(language,'Compartir con tus vecinos','Share with your neighbors','Llaqtamasiykikunawan rakiy')}</h3>
      <p>{localize(language,'Comparte esta publicación con una persona o un grupo.','Share this listing with a person or a group.','Kay willayta huk runawan utaq huñuwan rakiy.')}</p>
      <div className="publication-share-actions">
        <a className="outline-btn" href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noopener noreferrer"><Icon name="whatsapp" size={20}/>{localize(language,'Compartir por WhatsApp','Share on WhatsApp','WhatsApp nisqapi rakiy')}</a>
        {url && <button type="button" className="outline-btn" onClick={() => void copyLink()}><Icon name="link" size={18}/>{localize(language,'Copiar enlace','Copy link','Tinkinata copiay')}</button>}
        {(nativeShare || typeof navigator.share === 'function') && <button type="button" className="outline-btn publication-share-toggle" disabled={busy} onClick={() => void share()}><Icon name="share" size={18}/>{busy ? localize(language,'Abriendo…','Opening…','Kichachkan…') : localize(language,'Otras aplicaciones','Other apps','Huk aplicacionkuna')}</button>}
      </div>
      {url && error && <label className="publication-share-link">{localize(language,'Enlace de la publicación','Listing link','Willaypa tinkinan')}<input readOnly value={url} onFocus={event => event.target.select()}/></label>}
      {feedback && <p role="status">{feedback}</p>}
      <ErrorBox message={error}/>
    </section>}
    {!phone && <p className="form-hint">{localize(language,'No hay un teléfono público disponible para contactar. Puedes compartir esta publicación con tus vecinos.','There is no public phone number to contact. You can share this listing with your neighbors.','Manam runakunapaq celular rikuchisqachu kan. Kay willayta llaqtamasiykikunawan rakiyta atinki.')}</p>}
  </>;
}
