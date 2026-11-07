import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useApp } from '../AppContext';
import { errorMessage } from '../lib/api';
import { Modal, Field, ErrorBox, RemoteState, speak } from './UI';
import Icon from './Icon';
import { useLanguage } from '../lib/language';
import type { LocationDraft } from '../types';
import LocationPicker from './LocationPicker';
import { locationInput } from '../lib/location';
import { blockedRequestReason, requestTitle } from '../lib/request-policy';

type RecognitionResult = { resultIndex: number; results: { length: number; [index: number]: { isFinal: boolean; [index: number]: { transcript: string } } } };
type Recognition = { lang: string; continuous: boolean; interimResults: boolean; onresult: ((event: RecognitionResult) => void) | null; onerror: ((event: { error: string }) => void) | null; onend: (() => void) | null; start: () => void; stop: () => void; abort: () => void };
type VoiceWindow = Window & { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };

export default function RequestForm({ onClose }: { onClose: () => void }) {
  const { catalogs, sectors, area, online, submitRequest, notify } = useApp();
  const { t } = useLanguage();
  const [description, setDescription] = useState('');
  const [sectorId, setSectorId] = useState(area.sectorId);
  const [location, setLocation] = useState<LocationDraft>({ coordinates: area.coordinates, address: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const uuid = useRef(crypto.randomUUID());
  const descriptionRef = useRef<HTMLTextAreaElement>(null);
  const recognition = useRef<Recognition | null>(null);
  const voiceSegments = useRef<Map<number, string>>(new Map());
  const voiceBaseDescription = useRef('');
  const Voice = (window as VoiceWindow).SpeechRecognition || (window as VoiceWindow).webkitSpeechRecognition;
  const policyMessage = blockedRequestReason(description);
  useEffect(() => () => { recognition.current?.abort(); }, []);
  function record() {
    if (recording) { recognition.current?.stop(); return; }
    if (!Voice) return;
    setError('');
    voiceSegments.current = new Map();
    voiceBaseDescription.current = description.trim();
    const session = new Voice(); recognition.current = session;
    session.lang = 'es-PE'; session.continuous = false; session.interimResults = false;
    session.onresult = event => {
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const item = event.results[index];
        if (item?.isFinal && item[0]?.transcript) voiceSegments.current.set(index, item[0].transcript);
      }
      const dictated = cleanDictation([...voiceSegments.current.entries()].sort(([a], [b]) => a - b).map(([, text]) => text).join(' '));
      if (!dictated) return;
      const base = voiceBaseDescription.current;
      const next = [base, dictated].filter(Boolean).join(' ');
      setDescription(next);
    };
    session.onerror = event => { setRecording(false); setError(event.error === 'not-allowed' ? 'No se autorizó el micrófono. Puedes escribir tu pedido.' : 'No pudimos reconocer la voz. Intenta otra vez o escribe tu pedido.'); };
    session.onend = () => setRecording(false);
    try { session.start(); setRecording(true); } catch { setError('El micrófono no está disponible. Puedes escribir tu pedido.'); }
  }
  function cleanDictation(value: string) {
    const words = value.trim().replace(/\s+/g, ' ').split(' ');
    const cleaned: string[] = [];
    for (let index = 0; index < words.length; index += 1) {
      const word = words[index].replace(/^[,;:]+|[,;:]+$/g, '');
      if (!word) continue;
      const normalize = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es');
      const current = normalize(word.replace(/[.!?]+$/g, ''));
      const previous = cleaned.at(-1);
      if (previous && normalize(previous.replace(/[.!?]+$/g, '')) === current) continue;
      let next = '';
      for (let lookahead = index + 1; lookahead < words.length; lookahead += 1) {
        const candidate = normalize(words[lookahead].replace(/^[,;:]+|[,;:]+$/g, '').replace(/[.!?]+$/g, ''));
        if (candidate && candidate !== current) { next = candidate; break; }
      }
      // Speech engines sometimes emit a short syllable before the complete word ("fo fósforos").
      if (current.length >= 2 && current.length <= 3 && next.startsWith(current) && next.length > current.length) continue;
      cleaned.push(word);
    }
    return cleaned.join(' ').replace(/\s+([,.!?])/g, '$1');
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!sectorId) { setError('Elige la comunidad de tu pedido.'); return; }
    if (policyMessage) { setError(policyMessage); return; }
    setBusy(true); setError(''); recognition.current?.stop();
    const data = new FormData(event.currentTarget);
    try {
      const selectedCategory = catalogs.data?.ayuda.find(category => category.id === String(data.get('categoriaId')));
      const result = await submitRequest({ clientRequestId: uuid.current, titulo: requestTitle(description), descripcion: description.trim(), categoriaId: String(data.get('categoriaId')), sectorId, ubicacion: locationInput(location), urgencia: selectedCategory?.nombre.toLocaleLowerCase('es').includes('urgente') ? 'urgente' : 'normal' });
      notify(result === 'published' ? 'Tu pedido está publicado. Ya pueden ofrecerte ayuda.' : 'Pedido guardado en este dispositivo. Todavía no se ha enviado.');
      onClose(); window.location.hash = 'ayuda';
    } catch (error) { setError(errorMessage(error)); } finally { setBusy(false); }
  }
  return <Modal title={t('ask')} onClose={onClose} wide>
    <p className="form-intro">{t('describe')}</p>
    <p className="request-policy-note"><Icon name="shield" size={16}/>No se permiten pedidos de drogas, alcohol, dinero ni contenido sexual.</p>
    <form className="form-stack request-form" onSubmit={submit}>
      <Field label="Tu pedido"><div className="request-textarea-wrap"><textarea ref={descriptionRef} className="request-area" value={description} onChange={event => setDescription(event.target.value)} required minLength={5} maxLength={4000} placeholder="Por ejemplo: necesito una escalera por una hora mañana por la mañana." rows={4}/>{description && <button type="button" className="clear-request" aria-label="Borrar todo el texto del pedido" title="Borrar texto" onClick={() => { setDescription(''); descriptionRef.current?.focus(); }}><Icon name="close" size={16}/></button>}</div></Field>
      <div className="request-voice-tools" aria-label="Opciones de voz">
        {Voice && <button type="button" className={`outline-btn voice-record-btn ${recording ? 'is-recording' : ''}`} onClick={record} disabled={!online || busy}><Icon name="mic"/>{recording ? 'Terminar dictado' : t('dictate')}</button>}
        <button type="button" className="outline-btn voice-listen-btn" disabled={!description.trim()} onClick={() => { if (!speak(description)) setError('La lectura en voz alta no está disponible en este navegador.'); }}><Icon name="headphones"/>Escuchar</button>
      </div>
      {recording && <p role="status" className="recording-message"><span className="recording-dot"/>{t('listening')} Habla con naturalidad; revisa el texto antes de publicarlo.</p>}
      <div className="template-options" aria-label="Ideas para empezar"><span className="template-label">¿No sabes cómo empezar?</span>{[['Pedir prestado','Préstamo: '],['Pedir un favor','Ayuda vecinal: '],['Ofrecer algo','Ofrezco: ']].map(([label,text]) => <button type="button" className="template-chip" key={label} onClick={() => { const phrase = text.trim(); const current = description.trim(); const next = current.toLocaleLowerCase('es').startsWith(phrase.toLocaleLowerCase('es')) ? current : [phrase, current].filter(Boolean).join(' '); setDescription(next); }}>{label}</button>)}</div>
      <div className="form-columns">
        <Field label="Tipo de ayuda"><select name="categoriaId" required defaultValue=""><option value="" disabled>Elige una opción</option>{catalogs.data?.ayuda.map(category => <option key={category.id} value={category.id}>{category.nombre}</option>)}</select></Field>
        <Field label="Comunidad del pedido"><select value={sectorId} onChange={event => setSectorId(event.target.value)} required><option value="" disabled>Elige tu comunidad</option>{sectors.data?.map(sector => <option key={sector.id} value={sector.id}>{sector.distrito} · {sector.nombre}</option>)}</select></Field>
      </div>
      <details className="post-location" open><summary><Icon name="pin" size={18}/>¿Dónde necesitas ayuda?</summary><p className="form-hint">Elige un punto para este pedido. Tu perfil no cambia y otros vecinos ven solo una zona aproximada. Si lo omites, se usará la ubicación de tu perfil en esta comunidad, si existe.</p><LocationPicker value={location} onChange={setLocation} online={online} disabled={busy}/></details>
      <RemoteState {...catalogs}/><RemoteState {...sectors}/>
      {!online && <p className="offline-banner">Se guardará en este dispositivo y se enviará al recuperar conexión con tu sesión activa.</p>}
      {!catalogs.data?.ayuda.length && <ErrorBox message="Necesitamos cargar las categorías al menos una vez con conexión antes de crear pedidos."/>}
      <ErrorBox message={policyMessage}/>
      <ErrorBox message={error}/>
      <button type="submit" className="record-button justify-center" disabled={busy || recording || Boolean(policyMessage) || !sectorId || !catalogs.data?.ayuda.length}>{busy ? 'Guardando…' : online ? t('publish') : t('later')}<Icon name={online ? 'arrow' : 'wifiOff'}/></button>
    </form>
  </Modal>;
}
