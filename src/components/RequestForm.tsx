import { useDictation } from '../lib/use-dictation';
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

const emergencyNeeds = ['Agua', 'Alimentos', 'Medicinas', 'Abrigo', 'Primeros auxilios', 'Apoyo para evacuar', 'Personas atrapadas', 'Personas heridas', 'Asistencia especial'];

export default function RequestForm({ onClose, initialRequest }: { onClose: () => void; initialRequest?: { description: string; helpType: string; urgent: boolean; earthquake: boolean; emergencyNeeds: string[]; peopleCount?: number; locationQuery?: string } }) {
  const { catalogs, postingSectorId, area, online, submitRequest, notify } = useApp();
  const { t } = useLanguage();
  const [description, setDescription] = useState(initialRequest?.description ?? '');
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const [emergencyMode, setEmergencyMode] = useState(Boolean(initialRequest?.earthquake));
  const [selectedNeeds, setSelectedNeeds] = useState<string[]>(initialRequest?.emergencyNeeds ?? []);
  const [peopleCount, setPeopleCount] = useState(String(initialRequest?.peopleCount ?? 1));
  const sectorId = postingSectorId;
  const [location, setLocation] = useState<LocationDraft>({ coordinates: initialRequest?.locationQuery ? null : area.coordinates, address: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const uuid = useRef(crypto.randomUUID());
  const descriptionRef = useRef<HTMLTextAreaElement>(null);
  const { recording, supported: Voice, toggle: record, cancel: cancelDictation } = useDictation(description, setDescription, setError, 4000);
  const policyMessage = blockedRequestReason(description);
  const helpCategories = visibleHelpCategories(catalogs.data?.ayuda);
  useEffect(() => {
    if (!initialRequest || selectedCategoryId) return;
    const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es');
    const helpType = normalize(initialRequest.helpType);
    const match = initialRequest.urgent || initialRequest.earthquake
      ? helpCategories.find(category => normalize(category.nombre).includes('urgente'))
      : /prestamo|articulo/.test(helpType)
        ? helpCategories.find(category => normalize(category.nombre).includes('prestamo'))
        : /bienes|primera necesidad/.test(helpType)
          ? helpCategories.find(category => normalize(category.nombre).includes('donacion'))
          : undefined;
    if (match) setSelectedCategoryId(match.id);
  }, [initialRequest, helpCategories, selectedCategoryId]);
  const suggestedTitle = emergencyMode
    ? selectedNeeds.length ? `Sismo: ${selectedNeeds.slice(0, 2).join(', ')}${selectedNeeds.length > 2 ? ` y ${selectedNeeds.length - 2} más` : ''}` : ''
    : description.trim() ? requestTitle(description) : '';
  const requestHeading = suggestedTitle;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!sectorId) { setError('No pudimos preparar la publicación. Vuelve a intentarlo con conexión.'); return; }
    if (policyMessage) { setError(policyMessage); return; }
    setBusy(true); setError(''); cancelDictation();
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

      <Field label={emergencyMode ? 'Detalle adicional (opcional)' : 'Tu pedido'} hint={emergencyMode ? 'Describe qué pasó o qué necesitan para coordinar la ayuda. Las necesidades, el número de personas y la zona se agregarán automáticamente.' : undefined}><div className="request-textarea-wrap"><textarea ref={descriptionRef} className="request-area" value={description} onChange={event => { cancelDictation(); setDescription(event.target.value); }} required={!emergencyMode} minLength={emergencyMode ? 0 : 5} maxLength={4000} placeholder={emergencyMode ? 'Ej. El edificio no tiene agua y hay una persona mayor que necesita sus medicinas.' : 'Por ejemplo: necesito una escalera por una hora mañana por la mañana.'} rows={4}/>{description && <button type="button" className="clear-request" aria-label="Borrar todo el texto del pedido" title="Borrar texto" onClick={() => { cancelDictation(); setDescription(''); descriptionRef.current?.focus(); }}><Icon name="close" size={16}/></button>}</div></Field>
      <div className="request-voice-tools" aria-label="Opciones de voz">
        {Voice && <button type="button" className={`outline-btn voice-record-btn ${recording ? 'is-recording' : ''}`} onClick={record} disabled={!online || busy}><Icon name="mic"/>{recording ? 'Terminar dictado' : t('dictate')}</button>}
        <button type="button" className="outline-btn voice-listen-btn" disabled={recording || !description.trim()} onClick={() => { if (!speak(description)) setError('La lectura en voz alta no está disponible en este navegador.'); }}><Icon name="headphones"/>Escuchar</button>
      </div>
      {recording && <p role="status" className="recording-message"><span className="recording-dot"/>{t('listening')} Habla con naturalidad; revisa el texto antes de publicarlo.</p>}
        {!emergencyMode && <Field label="Tipo de ayuda" hint={initialRequest?.urgent ? 'Sugerimos Apoyo urgente por la donación de sangre. Puedes cambiarlo si no corresponde.' : initialRequest ? `Según tu mensaje: ${initialRequest.helpType}. Elige la categoría que mejor describe cómo pueden ayudarte.` : undefined}><select name="categoriaId" required value={selectedCategoryId} onChange={event => setSelectedCategoryId(event.target.value)}><option value="" disabled>Elige una opción</option>{helpCategories.map(category => <option key={category.id} value={category.id}>{category.nombre}</option>)}</select></Field>}
      <details className="post-location" open><summary><Icon name="pin" size={18}/>¿Dónde necesitas ayuda?</summary><p className="form-hint">Elige dónde necesitas ayuda. Tu dirección exacta es privada.</p><LocationPicker value={location} onChange={setLocation} online={online} disabled={busy} initialCenter={area.coordinates} initialSearch={initialRequest?.locationQuery}/></details>
      <RemoteState {...catalogs}/>
      {!online && <p className="offline-banner">Se guardará en este dispositivo como pendiente de envío. La comunidad aún no lo recibirá; se enviará al recuperar conexión con tu sesión activa.</p>}
      {!helpCategories.length && <ErrorBox message="Necesitamos cargar las categorías al menos una vez con conexión antes de crear pedidos."/>}
      <ErrorBox message={policyMessage}/>
      <ErrorBox message={error}/>
      <button type="submit" className="record-button justify-center" disabled={busy || recording || Boolean(policyMessage) || !sectorId || !helpCategories.length || (emergencyMode && selectedNeeds.length === 0)}>{busy ? 'Guardando…' : online ? emergencyMode ? 'Publicar pedido de emergencia' : t('publish') : emergencyMode ? 'Guardar pendiente de envío' : t('later')}<Icon name={online ? 'arrow' : 'wifiOff'}/></button>
    </form>
  </Modal>;
}
