import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useApp } from '../AppContext';
import { errorMessage } from '../lib/api';
import { Modal, Field, ErrorBox, RemoteState, speak } from './UI';
import Icon from './Icon';
import { useLanguage } from '../lib/language';

type RecognitionResult = { results: { [index: number]: { [index: number]: { transcript: string } } } };
type Recognition = { lang: string; continuous: boolean; interimResults: boolean; onresult: ((event: RecognitionResult) => void) | null; onerror: ((event: { error: string }) => void) | null; onend: (() => void) | null; start: () => void; stop: () => void; abort: () => void };
type VoiceWindow = Window & { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };

export default function RequestForm({ onClose }: { onClose: () => void }) {
  const { user, catalogs, sectors, area, online, submitRequest, notify } = useApp();
  const { t } = useLanguage();
  const [description, setDescription] = useState('');
  const [title, setTitle] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const uuid = useRef(crypto.randomUUID());
  const recognition = useRef<Recognition | null>(null);
  const Voice = (window as VoiceWindow).SpeechRecognition || (window as VoiceWindow).webkitSpeechRecognition;
  useEffect(() => () => { recognition.current?.abort(); }, []);
  function record() {
    if (recording) { recognition.current?.stop(); return; }
    if (!Voice) return;
    setError('');
    const session = new Voice(); recognition.current = session;
    session.lang = 'es-PE'; session.continuous = false; session.interimResults = false;
    session.onresult = event => { const result = event.results[0]?.[0]?.transcript; if (result) { setDescription(current => { const next = `${current}${current ? ' ' : ''}${result}`; setTitle(next.trim().split(/[.!?\\n]/)[0].slice(0, 160)); return next; }); } };
    session.onerror = event => { setRecording(false); setError(event.error === 'not-allowed' ? 'No se autorizó el micrófono. Puedes escribir tu pedido.' : 'No pudimos reconocer la voz. Intenta otra vez o escribe tu pedido.'); };
    session.onend = () => setRecording(false);
    try { session.start(); setRecording(true); } catch { setError('El micrófono no está disponible. Puedes escribir tu pedido.'); }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(''); recognition.current?.stop();
    const data = new FormData(event.currentTarget);
    try {
      const result = await submitRequest({ clientRequestId: uuid.current, titulo: title.trim() || description.trim().split(/[.!?\n]/)[0].slice(0, 160), descripcion: description.trim(), categoriaId: String(data.get('categoriaId')), sectorId: String(data.get('sectorId')), urgencia: data.get('urgente') === 'on' ? 'urgente' : 'normal' });
      notify(result === 'published' ? 'Tu pedido está publicado. Ya pueden ofrecerte ayuda.' : 'Pedido guardado en este dispositivo. Todavía no se ha enviado.');
      onClose(); window.location.hash = 'ayuda';
    } catch (error) { setError(errorMessage(error)); } finally { setBusy(false); }
  }
  return <Modal title={t('ask')} onClose={onClose}>
    <p className="form-intro">{t('describe')}</p>
    <form className="form-stack" onSubmit={submit}>
      <Field label={t('request')}><textarea className="request-area" value={description} onChange={event => { const next=event.target.value; setDescription(next); if (!title || title === description.trim().split(/[.!?\n]/)[0].slice(0,160)) setTitle(next.trim().split(/[.!?\n]/)[0].slice(0,160)); }} required minLength={5} maxLength={4000} placeholder="Por ejemplo: necesito una escalera por una hora mañana por la mañana." rows={4}/></Field>
      <Field label="Título propuesto (puedes editarlo)"><input value={title} maxLength={160} onChange={event => setTitle(event.target.value)} placeholder="Ej.: Necesito una escalera" required/></Field>
      <div className="action-row">
        {Voice && <button type="button" className="outline-btn" onClick={record} disabled={!online || busy}><Icon name="mic"/>{recording ? 'Terminar dictado' : t('dictate')}</button>}
        <button type="button" className="outline-btn" disabled={!description.trim()} onClick={() => { if (!speak(description)) setError('La lectura en voz alta no está disponible en este navegador.'); }}><Icon name="headphones"/>Escuchar</button>
      </div>
      {recording && <p role="status" className="recording-message">{t('listening')} Puedes detener el dictado cuando termines.</p>}
      <div className="template-options" aria-label="Plantillas para empezar">{[['Pedir prestado','Necesito pedir prestado '],['Un favor','Necesito ayuda para '],['Donar algo','Quiero donar ']].map(([label,text]) => <button type="button" className="template-chip" key={label} onClick={() => setDescription(text)}>{label}</button>)}</div>
      <div className="form-columns">
        <Field label="Tipo de ayuda"><select name="categoriaId" required defaultValue=""><option value="" disabled>Elige una opción</option>{catalogs.data?.ayuda.map(category => <option key={category.id} value={category.id}>{category.nombre}</option>)}</select></Field>
        <Field label="Sector"><select name="sectorId" required defaultValue={area.sectorId || user?.sectorId || ''}><option value="" disabled>Elige tu sector</option>{sectors.data?.map(sector => <option key={sector.id} value={sector.id}>{sector.nombre}</option>)}</select></Field>
      </div>
      <RemoteState {...catalogs}/><RemoteState {...sectors}/>
      <label className="check-field"><input name="urgente" type="checkbox"/>Es una necesidad urgente</label>
      {!online && <p className="offline-banner">Se guardará en este dispositivo y se enviará al recuperar conexión con tu sesión activa.</p>}
      {!catalogs.data?.ayuda.length && <ErrorBox message="Necesitamos cargar las categorías al menos una vez con conexión antes de crear pedidos."/>}
      <ErrorBox message={error}/>
      <button type="submit" className="record-button justify-center" disabled={busy || recording || !catalogs.data?.ayuda.length}>{busy ? 'Guardando…' : online ? t('publish') : t('later')}<Icon name={online ? 'arrow' : 'wifiOff'}/></button>
    </form>
  </Modal>;
}
