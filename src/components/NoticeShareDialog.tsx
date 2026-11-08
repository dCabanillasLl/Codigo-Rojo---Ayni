import { useEffect, useRef, useState } from 'react';
import { useApp } from '../AppContext';
import { apiAssetUrl, errorMessage } from '../lib/api';
import { canShareNoticeFlyer, noticeShareMessage, openNoticeWhatsApp, prepareNoticeFlyer, shareCancelled, shareNoticeFlyer, shareNoticeTogether, supportsDirectWhatsAppFlyer, supportsNoticeFlyerSharing, type PreparedNoticeFlyer } from '../lib/notice-share';
import type { Notice } from '../types';
import { ErrorBox, Field, Modal } from './UI';
import Icon from './Icon';

export default function NoticeShareDialog({ item, onClose }: { item: Notice; onClose: () => void }) {
  const { user, online } = useApp();
  const defaultMessage = noticeShareMessage(item);
  const previousDefault = useRef(defaultMessage);
  const [message, setMessage] = useState(defaultMessage);
  const directWithFlyer = supportsDirectWhatsAppFlyer();
  const [includeFlyer, setIncludeFlyer] = useState(() => Boolean(item.imagenUrl) && supportsDirectWhatsAppFlyer());
  const [prepared, setPrepared] = useState<PreparedNoticeFlyer | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [flyerError, setFlyerError] = useState('');
  const [error, setError] = useState('');
  const [sharing, setSharing] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const supportsImage = supportsNoticeFlyerSharing();
  useEffect(() => {
    const previous = previousDefault.current;
    setMessage(current => current === previous ? defaultMessage : current);
    previousDefault.current = defaultMessage;
  }, [defaultMessage]);
  useEffect(() => {
    setPrepared(null); setFlyerError('');
    if (!item.imagenUrl) setIncludeFlyer(false);
    if (!item.imagenUrl || !supportsImage || !online) { setPreparing(false); return; }
    let active = true;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15_000);
    setPreparing(true);
    void prepareNoticeFlyer(item, user?.id, controller.signal).then(flyer => {
      if (!active) return;
      if (!canShareNoticeFlyer(flyer)) { setFlyerError('Este dispositivo no permite compartir esta imagen. Puedes abrir el flyer para guardarlo.'); return; }
      setPrepared(flyer);
    }).catch(cause => {
      if (!active) return;
      setFlyerError(controller.signal.aborted ? 'La descarga del flyer tardó demasiado. Puedes reintentar o compartir solo el mensaje.' : cause instanceof TypeError ? 'No pudimos descargar el flyer. Revisa la conexión o comparte solo el mensaje.' : errorMessage(cause));
    }).finally(() => { window.clearTimeout(timeout); if (active) setPreparing(false); });
    return () => { active = false; controller.abort(); window.clearTimeout(timeout); };
  }, [item.id, item.imagenUrl, user?.id, supportsImage, online, attempt]);

  async function submit() {
    if (sharing || !online || !message.trim() || (includeFlyer && (!prepared || preparing))) return;
    setError('');
    if (includeFlyer && prepared) {
      setSharing(true);
      try { await shareNoticeTogether(message.trim(), prepared); onClose(); }
      catch (cause) { setError(errorMessage(cause)); }
      finally { setSharing(false); }
      return;
    }
    try { openNoticeWhatsApp(message.trim()); onClose(); }
    catch { setError('No pudimos abrir WhatsApp. Inténtalo nuevamente.'); }
  }
  async function shareFlyer() {
    if (sharing || !online || !prepared || preparing) return;
    setSharing(true); setError('');
    try {
      await shareNoticeFlyer(item.titulo, prepared);
    } catch (cause) {
      if (!shareCancelled(cause)) setError('No pudimos compartir el flyer. Inténtalo nuevamente o abre la imagen para guardarla.');
    } finally { setSharing(false); }
  }
  return <Modal title="Compartir aviso" onClose={() => { if (!sharing) onClose(); }}>
    <div className="form-stack notice-share-form">
      <p className="form-intro">Personaliza el mensaje para tus vecinos antes de compartirlo por WhatsApp.</p>
      <Field label="Mensaje para compartir"><textarea name="mensajeAviso" value={message} onChange={event => setMessage(event.target.value)} maxLength={4000} rows={8} disabled={sharing}/></Field>
      <button type="button" className="text-action notice-share-reset" disabled={sharing} onClick={() => setMessage(noticeShareMessage(item))}>Restablecer mensaje del aviso</button>
      {item.imagenUrl && <div className="notice-share-flyer">
        <div className="notice-share-flyer-preview"><img src={apiAssetUrl(item.imagenUrl)} alt={`Flyer de ${item.titulo}`}/><div><b>Flyer de la actividad</b><p>{directWithFlyer ? 'Puedes enviarlo junto al mensaje directamente a WhatsApp.' : 'En este dispositivo, la imagen se comparte por separado del mensaje.'}</p><a className="text-action" href={apiAssetUrl(item.imagenUrl)} target="_blank" rel="noopener noreferrer">Abrir flyer</a></div></div>
        {directWithFlyer && <label className="check-field notice-share-include"><input type="checkbox" checked={includeFlyer} disabled={sharing} onChange={event => setIncludeFlyer(event.target.checked)}/><span>Adjuntar flyer al mensaje de WhatsApp</span></label>}
        {preparing && <p className="form-hint" role="status">Preparando el flyer…</p>}
        {prepared && !preparing && <p className="notice-share-ready" role="status"><Icon name="check" size={16}/>Flyer listo para compartir</p>}
        <ErrorBox message={flyerError}/>
        {flyerError && <button type="button" className="text-action" disabled={sharing || preparing || !online} onClick={() => setAttempt(value => value + 1)}>Reintentar preparación del flyer</button>}
        {supportsImage && !directWithFlyer && <><button type="button" className="outline-btn notice-share-image-button" disabled={sharing || !prepared || preparing || !online} onClick={() => void shareFlyer()}><Icon name="share" size={18}/>{sharing ? 'Abriendo…' : 'Compartir solo el flyer'}</button><p className="form-hint">Para la imagen se abrirá el menú del dispositivo. Elige WhatsApp.</p></>}
      </div>}
      <p className="form-hint">{includeFlyer ? 'Se abrirá WhatsApp con el mensaje y el flyer juntos.' : 'El mensaje se abrirá directamente en WhatsApp.'} Elige el contacto o grupo y revisa el contenido antes de enviarlo.</p>
      {!online && <ErrorBox message="Necesitas conexión para compartir este aviso."/>}
      <ErrorBox message={error}/>
      <div className="event-change-actions"><button type="button" className="outline-btn" disabled={sharing} onClick={onClose}>Volver</button><button type="button" className="record-button event-change-submit" onClick={() => void submit()} disabled={sharing || !online || !message.trim() || (includeFlyer && (!prepared || preparing))}><Icon name="whatsapp" size={20}/>{sharing ? 'Abriendo…' : 'Compartir por WhatsApp'}</button></div>
    </div>
  </Modal>;
}
