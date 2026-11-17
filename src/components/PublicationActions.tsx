import { useId, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import Icon from './Icon';
import { ErrorBox } from './UI';

export default function PublicationActions({ id, title, description, phone }: { id: string; title: string; description: string; phone?: string | null }) {
  const panelId = useId();
  const [expanded, setExpanded] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const url = new URL(import.meta.env.VITE_PUBLIC_APP_URL || window.location.href);
  url.search = '';
  url.hash = `cerca/${encodeURIComponent(id)}`;
  const text = `${title}\n${description}\n${url.href}`;
  const greeting = encodeURIComponent(`Hola, vi tu publicación en AYNI: ${title}`);
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const nativeShare = Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('Share');

  async function copyLink() {
    setError(''); setFeedback('');
    try { await navigator.clipboard.writeText(url.href); setFeedback('Enlace copiado. Ya puedes pegarlo en una conversación.'); }
    catch { setError('No pudimos copiar el enlace. Selecciónalo abajo para copiarlo manualmente.'); }
  }
  async function share() {
    setError(''); setFeedback(''); setBusy(true);
    try {
      if (nativeShare) {
        const { Share } = await import('@capacitor/share');
        await Share.share({ title, text: description, url: url.href, dialogTitle: 'Compartir publicación' });
      } else await navigator.share({ title, text: description, url: url.href });
    } catch (cause) {
      if (!(cause instanceof Error && (cause.name === 'AbortError' || /cancel/i.test(cause.message)))) setError('No pudimos abrir las aplicaciones. Puedes compartir por WhatsApp o copiar el enlace.');
    } finally { setBusy(false); }
  }

  return <>
    <div className="publication-share-actions" role="group" aria-label="Contactar y compartir">
      {phone && <>
        <a className="whatsapp-btn" href={`https://wa.me/${phone}?text=${greeting}`} target="_blank" rel="noopener noreferrer"><Icon name="whatsapp" size={20}/><span>Contactar por WhatsApp</span></a>
        <a className="outline-btn" href={`sms:+${phone}${ios ? '&' : '?'}body=${greeting}`}><Icon name="message" size={20}/><span>Enviar SMS</span></a>
      </>}
      <button type="button" className="outline-btn publication-share-toggle" aria-expanded={expanded} aria-controls={panelId} onClick={() => setExpanded(value => !value)}><Icon name="share" size={18}/><span>Compartir publicación</span><Icon name={expanded ? 'close' : 'plus'} size={16}/></button>
    </div>
    {expanded && <section id={panelId} className="publication-share-panel" aria-label="Opciones para compartir">
      <b>Recomiéndalo a tus vecinos</b>
      <p>Comparte esta publicación con una persona o un grupo.</p>
      <div className="publication-share-actions">
        <a className="outline-btn" href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noopener noreferrer"><Icon name="whatsapp" size={20}/>WhatsApp</a>
        <button type="button" className="outline-btn" onClick={() => void copyLink()}><Icon name="link" size={18}/>Copiar enlace</button>
        {(nativeShare || typeof navigator.share === 'function') && <button type="button" className="outline-btn publication-share-toggle" disabled={busy} onClick={() => void share()}><Icon name="share" size={18}/>{busy ? 'Abriendo…' : 'Otras aplicaciones'}</button>}
      </div>
      <label className="publication-share-link">Enlace de la publicación<input readOnly value={url.href} onFocus={event => event.target.select()}/></label>
      {feedback && <p role="status">{feedback}</p>}
      <ErrorBox message={error}/>
    </section>}
    {!phone && <p className="form-hint">No hay un teléfono público disponible para contactar. Puedes compartir esta publicación con tus vecinos.</p>}
  </>;
}
