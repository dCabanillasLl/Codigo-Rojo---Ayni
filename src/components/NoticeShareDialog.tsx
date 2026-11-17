import { useEffect, useRef, useState } from 'react';
import { useApp } from '../AppContext';
import { apiAssetUrl, errorMessage } from '../lib/api';
import { canShareNoticeFlyer, noticeShareMessageLocalized, openNoticeWhatsApp, prepareNoticeFlyer, shareCancelled, shareNoticeFlyer, shareNoticeTogether, supportsDirectWhatsAppFlyer, supportsNoticeFlyerSharing, type PreparedNoticeFlyer } from '../lib/notice-share';
import type { Notice } from '../types';
import { ErrorBox, Field, Modal } from './UI';
import Icon from './Icon';
import { localize, useLanguage } from '../lib/language';

export default function NoticeShareDialog({ item, onClose }: { item: Notice; onClose: () => void }) {
  const { language } = useLanguage();
  const { user, online } = useApp();
  const defaultMessage = noticeShareMessageLocalized(item, language);
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
      if (!canShareNoticeFlyer(flyer)) { setFlyerError(localize(language,'Este dispositivo no permite compartir esta imagen. Puedes abrir el flyer para guardarlo.','This device cannot share this image. You can open the flyer to save it.','Kay dispositivopiqa kay siq’ita manam rakiyta atikunchu. Flyer-ta kichayta, waqaychanaykipaq atinki.')); return; }
      setPrepared(flyer);
    }).catch(cause => {
      if (!active) return;
      setFlyerError(controller.signal.aborted ? localize(language,'La descarga del flyer tardó demasiado. Puedes reintentar o compartir solo el mensaje.','The flyer took too long to download. Retry or share only the message.','Flyer uraykachayqa unaytam hap’irqan. Kutiyta atinmi utaq willayllata rakiy.') : cause instanceof TypeError ? localize(language,'No pudimos descargar el flyer. Revisa la conexión o comparte solo el mensaje.','We could not download the flyer. Check your connection or share only the message.','Flyer uraykachayta manam atirqanchu. Internetniykita qhaway utaq willayllata rakiy.') : errorMessage(cause));
    }).finally(() => { window.clearTimeout(timeout); if (active) setPreparing(false); });
    return () => { active = false; controller.abort(); window.clearTimeout(timeout); };
  }, [item.id, item.imagenUrl, user?.id, supportsImage, online, attempt, language]);

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
    catch { setError(localize(language,'No pudimos abrir WhatsApp. Inténtalo nuevamente.','We could not open WhatsApp. Please try again.','WhatsApp-ta manam kichayta atirqanchu. Ama hina kaspa, yapamanta ruray.')); }
  }
  async function shareFlyer() {
    if (sharing || !online || !prepared || preparing) return;
    setSharing(true); setError('');
    try {
      await shareNoticeFlyer(item.titulo, prepared);
    } catch (cause) {
      if (!shareCancelled(cause)) setError(localize(language,'No pudimos compartir el flyer. Inténtalo nuevamente o abre la imagen para guardarla.','We could not share the flyer. Try again or open the image to save it.','Flyer-ta manam rakiyta atirqanchu. Yapamanta ruray utaq siq’ita kichay, waqaychanaykipaq.'));
    } finally { setSharing(false); }
  }
  return <Modal title={localize(language,'Compartir aviso','Share notice','Willakuyta rakiy')} onClose={() => { if (!sharing) onClose(); }}>
    <div className="form-stack notice-share-form">
      <p className="form-intro">{localize(language,'Personaliza el mensaje para tus vecinos antes de compartirlo por WhatsApp.','Personalize the message for your neighbors before sharing it on WhatsApp.','Llaqtamasiykikunapaq willayta allichay, WhatsApp nisqapi rakishaspa.')}</p>
      <Field label={localize(language,'Mensaje para compartir','Message to share','Rakina willay')}><textarea name="mensajeAviso" value={message} onChange={event => setMessage(event.target.value)} maxLength={4000} rows={8} disabled={sharing}/></Field>
      <button type="button" className="text-action notice-share-reset" disabled={sharing} onClick={() => setMessage(noticeShareMessageLocalized(item, language))}>{localize(language,'Restablecer mensaje del aviso','Reset notice message','Willakuy willayninta kutichiy')}</button>
      {item.imagenUrl && <div className="notice-share-flyer">
        <div className="notice-share-flyer-preview"><img src={apiAssetUrl(item.imagenUrl)} alt={localize(language,`Flyer de ${item.titulo}`,`Flyer for ${item.titulo}`,` ${item.titulo} flyer-nin`)}/><div><b>{localize(language,'Flyer de la actividad','Activity flyer','Ruraypa flyer-nin')}</b><p>{directWithFlyer ? localize(language,'Puedes enviarlo junto al mensaje directamente a WhatsApp.','You can send it with the message directly to WhatsApp.','Willaywan kuska WhatsApp nisqaman kachayta atinki.') : localize(language,'En este dispositivo, la imagen se comparte por separado del mensaje.','On this device, the image is shared separately from the message.','Kay dispositivopiqa siq’iqa willaymanta sapanmi rakikun.')}</p><a className="text-action" href={apiAssetUrl(item.imagenUrl)} target="_blank" rel="noopener noreferrer">{localize(language,'Abrir flyer','Open flyer','Flyer-ta kichay')}</a></div></div>
        {directWithFlyer && <label className="check-field notice-share-include"><input type="checkbox" checked={includeFlyer} disabled={sharing} onChange={event => setIncludeFlyer(event.target.checked)}/><span>{localize(language,'Adjuntar flyer al mensaje de WhatsApp','Attach flyer to WhatsApp message','Flyer-ta WhatsApp willayman yapay')}</span></label>}
        {preparing && <p className="form-hint" role="status">{localize(language,'Preparando el flyer…','Preparing flyer…','Flyer-ta wakichichkan…')}</p>}
        {prepared && !preparing && <p className="notice-share-ready" role="status"><Icon name="check" size={16}/>{localize(language,'Flyer listo para compartir','Flyer ready to share','Flyer rakinaña wakichisqam')}</p>}
        <ErrorBox message={flyerError}/>
        {flyerError && <button type="button" className="text-action" disabled={sharing || preparing || !online} onClick={() => setAttempt(value => value + 1)}>{localize(language,'Reintentar preparación del flyer','Retry flyer preparation','Flyer wakichiyta yapamanta ruray')}</button>}
        {supportsImage && !directWithFlyer && <><button type="button" className="outline-btn notice-share-image-button" disabled={sharing || !prepared || preparing || !online} onClick={() => void shareFlyer()}><Icon name="share" size={18}/>{sharing ? localize(language,'Abriendo…','Opening…','Kichachkan…') : localize(language,'Compartir solo el flyer','Share flyer only','Flyerllata rakiy')}</button><p className="form-hint">{localize(language,'Para la imagen se abrirá el menú del dispositivo. Elige WhatsApp.','The device share menu will open for the image. Choose WhatsApp.','Siq’ipaq dispositivopa rakina menu-nin kichakunqa. WhatsApp-ta akllay.')}</p></>}
      </div>}
      <p className="form-hint">{includeFlyer ? localize(language,'Se abrirá WhatsApp con el mensaje y el flyer juntos.','WhatsApp will open with the message and flyer together.','WhatsAppqa willaywan flyerwan kuska kichakunqa.') : localize(language,'El mensaje se abrirá directamente en WhatsApp.','The message will open directly in WhatsApp.','Willayqa WhatsApp nisqapi kikillanmanta kichakunqa.')}{localize(language,' Elige el contacto o grupo y revisa el contenido antes de enviarlo.',' Choose a contact or group and review the content before sending.',' Huk runata utaq huñuta akllay, kachashaspaqa ñawpaqta qhaway.')}</p>
      {!online && <ErrorBox message={localize(language,'Necesitas conexión para compartir este aviso.','You need an internet connection to share this notice.','Kay willakuyta rakinaykipaq internet nisqa kananmi.')}/>}
      <ErrorBox message={error}/>
      <div className="event-change-actions"><button type="button" className="outline-btn" disabled={sharing} onClick={onClose}>{localize(language,'Volver','Back','Kutiy')}</button><button type="button" className="record-button event-change-submit" onClick={() => void submit()} disabled={sharing || !online || !message.trim() || (includeFlyer && (!prepared || preparing))}><Icon name="whatsapp" size={20}/>{sharing ? localize(language,'Abriendo…','Opening…','Kichachkan…') : localize(language,'Compartir por WhatsApp','Share on WhatsApp','WhatsApp nisqapi rakiy')}</button></div>
    </div>
  </Modal>;
}
