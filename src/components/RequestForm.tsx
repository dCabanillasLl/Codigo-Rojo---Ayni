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
import { visibleHelpCategories } from '../lib/help-categories';

type RecognitionResult = { resultIndex: number; results: { length: number; [index: number]: { isFinal: boolean; [index: number]: { transcript: string } } } };
type Recognition = { lang: string; continuous: boolean; interimResults: boolean; onresult: ((event: RecognitionResult) => void) | null; onerror: ((event: { error: string }) => void) | null; onend: (() => void) | null; start: () => void; stop: () => void; abort: () => void };
type VoiceWindow = Window & { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
const emergencyNeeds = ['Agua', 'Alimentos', 'Medicinas', 'Abrigo', 'Primeros auxilios', 'Apoyo para evacuar', 'Personas atrapadas', 'Personas heridas', 'Asistencia especial'];

export default function RequestForm({ onClose, initialRequest }: { onClose: () => void; initialRequest?: { description: string; helpType: string; urgent: boolean; earthquake: boolean; emergencyNeeds: string[]; peopleCount?: number } }) {
  const { catalogs, postingSectorId, area, online, submitRequest, notify } = useApp();
  const { t } = useLanguage();
  const [description, setDescription] = useState(initialRequest?.description ?? '');
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const [emergencyMode, setEmergencyMode] = useState(Boolean(initialRequest?.earthquake));
  const [selectedNeeds, setSelectedNeeds] = useState<string[]>(initialRequest?.emergencyNeeds ?? []);
  const [peopleCount, setPeopleCount] = useState(String(initialRequest?.peopleCount ?? 1));
  const sectorId = postingSectorId;
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
  const helpCategories = visibleHelpCategories(catalogs.data?.ayuda);
  useEffect(() => {
    if (!initialRequest?.urgent || selectedCategoryId) return;
    const urgentCategory = helpCategories.find(category => category.nombre.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es').includes('urgente'));
    if (urgentCategory) setSelectedCategoryId(urgentCategory.id);
  }, [initialRequest?.urgent, helpCategories, selectedCategoryId]);
  const suggestedTitle = emergencyMode
    ? selectedNeeds.length ? `Sismo: ${selectedNeeds.slice(0, 2).join(', ')}${selectedNeeds.length > 2 ? ` y ${selectedNeeds.length - 2} más` : ''}` : ''
    : description.trim() ? requestTitle(description) : '';
  const requestHeading = suggestedTitle;
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
    if (!sectorId) { setError('No pudimos preparar la publicación. Vuelve a intentarlo con conexión.'); return; }
    if (policyMessage) { setError(policyMessage); return; }
    setBusy(true); setError(''); recognition.current?.stop();
    const data = new FormData(event.currentTarget);
    try {
      const emergencyCategory = catalogs.data?.ayuda.find(category => category.nombre.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es').includes('urgente'));
      const selectedCategory = emergencyMode ? emergencyCategory : catalogs.data?.ayuda.find(category => category.id === selectedCategoryId);
      if (emergencyMode && !selectedCategory) throw new Error('No encontramos la categoría de apoyo urgente. Conéctate para actualizar las categorías.');
      if (emergencyMode && selectedNeeds.length === 0) throw new Error('Selecciona al menos un tipo de ayuda para el pedido de emergencia.');
      if (emergencyMode && !location.coordinates) throw new Error('Elige una ubicación aproximada en el mapa para que los vecinos sepan dónde apoyar.');
      const requestDescription = emergencyMode
        ? [`PEDIDO DE EMERGENCIA POR SISMO`, `Necesidades: ${selectedNeeds.join(', ')}`, `Personas afectadas: ${Math.max(1, Number(peopleCount) || 1)}`, description.trim() ? `Detalle adicional: ${description.trim()}` : ''].filter(Boolean).join('\n')
        : description.trim();
      const result = await submitRequest({ clientRequestId: uuid.current, titulo: requestHeading, descripcion: requestDescription, categoriaId: String(selectedCategory?.id || data.get('categoriaId')), sectorId, ubicacion: locationInput(location), urgencia: emergencyMode || selectedCategory?.nombre.toLocaleLowerCase('es').includes('urgente') ? 'urgente' : 'normal' });
      notify(result === 'published' ? 'Tu pedido está publicado. Ya pueden ofrecerte ayuda.' : 'Pedido guardado en este dispositivo. Todavía no se ha enviado.');
      onClose(); window.location.hash = 'ayuda';
    } catch (error) { setError(errorMessage(error)); } finally { setBusy(false); }
  }
  return <Modal title={t('ask')} onClose={onClose} wide>
    <p className="form-intro">{t('describe')}</p>
    <p className="request-policy-note"><Icon name="shield" size={16}/>No se permiten pedidos de drogas, alcohol, dinero, contenido sexual, insultos ni lenguaje discriminatorio.</p>
    <form className="form-stack request-form" onSubmit={submit}>
      <label className="check-field emergency-mode-toggle"><input type="checkbox" checked={emergencyMode} onChange={event => { setEmergencyMode(event.target.checked); setError(''); }}/><span><b>Pedido de emergencia por sismo</b><small>Organiza la necesidad con datos rápidos y prioridad urgente.</small></span></label>
      {emergencyMode && <section className="emergency-request-fields" aria-label="Detalles del pedido de emergencia">
        <fieldset><legend>¿Qué ayuda necesitan? Selecciona todas las opciones necesarias.</legend><div className="emergency-needs-grid">{emergencyNeeds.map(need => <label className="check-field" key={need}><input type="checkbox" checked={selectedNeeds.includes(need)} onChange={event => setSelectedNeeds(current => event.target.checked ? [...current, need] : current.filter(item => item !== need))}/><span>{need}</span></label>)}</div></fieldset>
        <Field label="¿Cuántas personas necesitan apoyo?"><input type="number" min="1" max="100" step="1" value={peopleCount} onChange={event => setPeopleCount(event.target.value)} required/></Field>
        {!selectedNeeds.length && <p className="form-hint">Elige por lo menos una opción. Marca si hay personas atrapadas o heridas; agrega más detalle solo si ayuda a coordinar.</p>}
      </section>}

      <Field label={emergencyMode ? 'Detalle adicional (opcional)' : 'Tu pedido'} hint={emergencyMode ? 'Describe qué pasó o qué necesitan para coordinar la ayuda. Las necesidades, el número de personas y la zona se agregarán automáticamente.' : undefined}><div className="request-textarea-wrap"><textarea ref={descriptionRef} className="request-area" value={description} onChange={event => setDescription(event.target.value)} required={!emergencyMode} minLength={emergencyMode ? 0 : 5} maxLength={4000} placeholder={emergencyMode ? 'Ej. El edificio no tiene agua y hay una persona mayor que necesita sus medicinas.' : 'Por ejemplo: necesito una escalera por una hora mañana por la mañana.'} rows={4}/>{description && <button type="button" className="clear-request" aria-label="Borrar todo el texto del pedido" title="Borrar texto" onClick={() => { setDescription(''); descriptionRef.current?.focus(); }}><Icon name="close" size={16}/></button>}</div></Field>
      <div className="request-voice-tools" aria-label="Opciones de voz">
        {Voice && <button type="button" className={`outline-btn voice-record-btn ${recording ? 'is-recording' : ''}`} onClick={record} disabled={!online || busy}><Icon name="mic"/>{recording ? 'Terminar dictado' : t('dictate')}</button>}
        <button type="button" className="outline-btn voice-listen-btn" disabled={!description.trim()} onClick={() => { if (!speak(description)) setError('La lectura en voz alta no está disponible en este navegador.'); }}><Icon name="headphones"/>Escuchar</button>
      </div>
      {recording && <p role="status" className="recording-message"><span className="recording-dot"/>{t('listening')} Habla con naturalidad; revisa el texto antes de publicarlo.</p>}
        {!emergencyMode && <Field label="Tipo de ayuda" hint={initialRequest?.urgent ? 'Sugerimos Apoyo urgente por la donación de sangre. Puedes cambiarlo si no corresponde.' : initialRequest ? `Según tu mensaje: ${initialRequest.helpType}. Elige la categoría que mejor describe cómo pueden ayudarte.` : undefined}><select name="categoriaId" required value={selectedCategoryId} onChange={event => setSelectedCategoryId(event.target.value)}><option value="" disabled>Elige una opción</option>{helpCategories.map(category => <option key={category.id} value={category.id}>{category.nombre}</option>)}</select></Field>}
      <details className="post-location" open><summary><Icon name="pin" size={18}/>¿Dónde necesitas ayuda?</summary><p className="form-hint">Elige dónde necesitas ayuda. Tu dirección exacta es privada.</p><LocationPicker value={location} onChange={setLocation} online={online} disabled={busy}/></details>
      <RemoteState {...catalogs}/>
      {!online && <p className="offline-banner">Se guardará en este dispositivo como pendiente de envío. La comunidad aún no lo recibirá; se enviará al recuperar conexión con tu sesión activa.</p>}
      {!helpCategories.length && <ErrorBox message="Necesitamos cargar las categorías al menos una vez con conexión antes de crear pedidos."/>}
      <ErrorBox message={policyMessage}/>
      <ErrorBox message={error}/>
      <button type="submit" className="record-button justify-center" disabled={busy || recording || Boolean(policyMessage) || !sectorId || !helpCategories.length || (emergencyMode && selectedNeeds.length === 0)}>{busy ? 'Guardando…' : online ? emergencyMode ? 'Publicar pedido de emergencia' : t('publish') : emergencyMode ? 'Guardar pendiente de envío' : t('later')}<Icon name={online ? 'arrow' : 'wifiOff'}/></button>
    </form>
  </Modal>;
}
