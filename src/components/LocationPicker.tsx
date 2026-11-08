import { useEffect, useRef, useState } from 'react';
import { api, errorMessage } from '../lib/api';
import type { Coordinates, LocationDraft } from '../types';
import CommunityMap from './CommunityMap';
import AddressAutocomplete, { type AddressSuggestion } from './AddressAutocomplete';
import Icon from './Icon';
import { ErrorBox, Field } from './UI';

export default function LocationPicker({ value, onChange, online, disabled = false, initialCenter, addressField, onBusyChange }: {
  value: LocationDraft; onChange: (value: LocationDraft) => void; online: boolean; disabled?: boolean; initialCenter?: Coordinates | null;
  addressField?: { label: string; name: string; required?: boolean }; onBusyChange?: (busy: boolean) => void;
}) {
  const [query, setQuery] = useState('');
  const [suggesting, setSuggesting] = useState(false);
  const [locating, setLocating] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const controller = useRef<AbortController | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const sequence = useRef(0);
  const current = useRef({ value, onChange, disabled }); current.current = { value, onChange, disabled };
  useEffect(() => () => { sequence.current++; controller.current?.abort(); window.clearTimeout(timer.current); }, []);
  useEffect(() => {
    if (!value.coordinates) {
      sequence.current++; controller.current?.abort(); window.clearTimeout(timer.current);
      setAccuracy(null); setMessage(''); setLocating(false); setResolving(false);
    }
  }, [value.coordinates]);
  useEffect(() => { onBusyChange?.(locating || suggesting || resolving); return () => onBusyChange?.(false); }, [locating, suggesting, resolving, onBusyChange]);
  function cancelLocation() {
    sequence.current++; controller.current?.abort(); window.clearTimeout(timer.current); setLocating(false); setResolving(false);
    return sequence.current;
  }
  function chooseAddress(place: AddressSuggestion) {
    cancelLocation(); setAccuracy(null); setError(''); setQuery(place.nombre);
    current.current.onChange({ coordinates: { latitude: place.latitud, longitude: place.longitud }, address: place.nombre });
    setMessage('Dirección y ubicación seleccionadas. Puedes revisarlas antes de confirmar.');
  }
  function pick(point: Coordinates, precision: number | null = null) {
    if (current.current.disabled) return;
    const operation = cancelLocation();
    const request = new AbortController(); controller.current = request;
    setAccuracy(precision); setError(''); setMessage(''); setResolving(true); setQuery('');
    current.current.onChange({ coordinates: point, address: '' });
    timer.current = window.setTimeout(async () => {
      try {
        const params = new URLSearchParams({ latitud: String(point.latitude), longitud: String(point.longitude) });
        const result = await api<{ direccion: string | null }>(`/ubicaciones/reversa?${params}`, { signal: request.signal });
        if (sequence.current !== operation) return;
        const address = result.direccion || '';
        current.current.onChange({ coordinates: point, address }); setQuery(address);
        setMessage(address ? 'Dirección aproximada completada. Revísala y corrígela si hace falta.' : 'El punto quedó seleccionado. No encontramos su dirección; escribe una referencia.');
      } catch (cause) { if (sequence.current === operation) setError(`${errorMessage(cause)} El punto sigue seleccionado.`); }
      finally { if (sequence.current === operation) setResolving(false); }
    }, 350);
  }
  function updateAddress(address: string) {
    cancelLocation(); setError(''); setMessage('');
    current.current.onChange({ ...current.current.value, address });
  }
  function locate() {
    if (!navigator.geolocation) { setError('Tu navegador no permite detectar ubicación. Puedes buscar una dirección o elegirla en el mapa.'); return; }
    if (!window.isSecureContext) { setError('El GPS necesita HTTPS o localhost. Puedes elegir el punto en el mapa.'); return; }
    const operation = cancelLocation(); setLocating(true); setError(''); setMessage('');
    navigator.geolocation.getCurrentPosition(position => {
      if (sequence.current !== operation) return;
      pick({ latitude: position.coords.latitude, longitude: position.coords.longitude }, position.coords.accuracy);
    }, cause => {
      if (sequence.current !== operation) return;
      setLocating(false);
      setError(cause.code === 1 ? 'No se autorizó la ubicación. Puedes buscar una dirección o seleccionar el punto en el mapa.' : 'No pudimos detectar el GPS. Busca una dirección o elige el punto en el mapa.');
    }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 });
  }
  return <div className="location-picker">
    <AddressAutocomplete label={addressField?.label || 'Buscar dirección o calle'} name={addressField?.name} required={addressField?.required} value={addressField ? value.address : query} onChange={addressField ? updateAddress : text => { cancelLocation(); setQuery(text); }} onSelect={chooseAddress} bias={value.coordinates || initialCenter} online={online} disabled={disabled} onBusyChange={setSuggesting}/>
    <div className="location-picker-tools"><button type="button" className="outline-btn" onClick={locate} disabled={disabled || locating || !online}><Icon name="pin" size={17}/>{locating ? 'Detectando ubicación…' : 'Usar mi ubicación actual'}</button><span>o arrastra el pin hasta tu ubicación</span></div>
    <p className="form-hint">En el celular, separa dos dedos para acercar y júntalos para alejar el mapa. Arrastra el mapa para explorar y el pin para ajustar tu ubicación.</p>
    <p className="form-hint">Al elegir un punto o usar GPS, sus coordenadas se consultan en Photon para completar la dirección. Revisa la sugerencia antes de guardar.</p>
    <CommunityMap center={value.coordinates || initialCenter} picked={value.coordinates} onPick={disabled || !online ? undefined : point => pick(point)} onPickStart={() => { cancelLocation(); setAccuracy(null); }} accuracy={accuracy} online={online} compact fitAll={false} label="Elegir ubicación. Arrastra el pin o usa las flechas para mover el mapa y Enter para elegir el centro."/>
    {resolving && <p className="success-text" role="status">Completando la dirección del punto seleccionado…</p>}
    <p className="form-hint">{value.coordinates ? `Punto seleccionado: ${value.coordinates.latitude.toFixed(5)}, ${value.coordinates.longitude.toFixed(5)}.` : 'Aún no hay un punto elegido.'} Con teclado: enfoca el mapa, muévelo con las flechas y pulsa Enter.</p>
    {accuracy != null && value.coordinates && <p className="location-accuracy" role="status">Precisión del GPS: aproximadamente ±{Math.max(1, Math.round(accuracy))} m.</p>}
    {!addressField && <Field label="Dirección o referencia privada" hint="Se completa al elegir un punto. Puedes corregirla antes de guardar."><input value={value.address} onChange={event => updateAddress(event.target.value)} maxLength={255} placeholder="Calle, número o referencia" disabled={disabled}/></Field>}
    {message && <p className="success-text" role="status">{message}</p>}
    <ErrorBox message={error}/>
  </div>;
}
