import { useEffect, useId, useRef, useState } from 'react';
import { api, errorMessage } from '../lib/api';
import type { Coordinates, LocationDraft } from '../types';
import CommunityMap from './CommunityMap';
import Icon from './Icon';
import { ErrorBox, Field } from './UI';

type AddressResult = { id: string; nombre: string; latitud: number; longitud: number };
export default function LocationPicker({ value, onChange, online, disabled = false, initialCenter }: {
  value: LocationDraft; onChange: (value: LocationDraft) => void; online: boolean; disabled?: boolean; initialCenter?: Coordinates | null;
}) {
  const id = useId();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<AddressResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [locating, setLocating] = useState(false);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const controller = useRef<AbortController | null>(null);
  const sequence = useRef(0);
  const current = useRef({ value, onChange, disabled }); current.current = { value, onChange, disabled };
  useEffect(() => () => { sequence.current++; controller.current?.abort(); }, []);

  function pick(point: Coordinates, address?: string, precision: number | null = null) {
    if (current.current.disabled) { setLocating(false); setSearching(false); return; }
    sequence.current++; controller.current?.abort(); setLocating(false); setSearching(false); setAccuracy(precision); setError(''); setResults([]);
    current.current.onChange({ coordinates: point, address: address ?? current.current.value.address });
    setMessage('Punto elegido. Puedes ajustarlo pulsando en otro lugar del mapa.');
  }
  async function search() {
    if (!online || disabled || searching || query.trim().length < 3) return;
    const operation = ++sequence.current;
    controller.current?.abort(); controller.current = new AbortController();
    setSearching(true); setLocating(false); setError(''); setMessage(''); setResults([]);
    try {
      const found = await api<AddressResult[]>(`/ubicaciones/buscar?${new URLSearchParams({ q: query.trim() })}`, { signal: controller.current.signal });
      if (sequence.current !== operation) return;
      setResults(found);
      if (!found.length) setMessage('No encontramos esa dirección. Añade el distrito o elige el punto en el mapa.');
    } catch (cause) { if (sequence.current === operation) setError(errorMessage(cause)); }
    finally { if (sequence.current === operation) setSearching(false); }
  }
  function locate() {
    if (!navigator.geolocation) { setError('Tu navegador no permite detectar ubicación. Puedes buscar una dirección o elegirla en el mapa.'); return; }
    if (!window.isSecureContext) { setError('El GPS necesita HTTPS o localhost. Puedes elegir el punto en el mapa.'); return; }
    const operation = ++sequence.current;
    controller.current?.abort(); setSearching(false); setLocating(true); setError(''); setMessage(''); setResults([]);
    navigator.geolocation.getCurrentPosition(position => {
      if (sequence.current !== operation) return;
      pick({ latitude: position.coords.latitude, longitude: position.coords.longitude }, undefined, position.coords.accuracy);
    }, cause => {
      if (sequence.current !== operation) return;
      setLocating(false);
      setError(cause.code === 1 ? 'No se autorizó la ubicación. Puedes buscar una dirección o seleccionar el punto en el mapa.' : cause.code === 3 ? 'El GPS tardó demasiado. Intenta otra vez o elige el punto manualmente.' : 'No pudimos detectar el GPS. Busca una dirección o elige el punto en el mapa.');
    }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 });
  }

  return <div className="location-picker">
    <div className="location-picker-tools"><button type="button" className="outline-btn" onClick={locate} disabled={disabled || locating || !online}><Icon name="pin" size={17}/>{locating ? 'Detectando ubicación…' : 'Usar mi ubicación actual'}</button><span>o busca un lugar</span></div>
    <div className="location-search" role="search" aria-label="Buscar ubicación en Perú">
      <label className="sr-only" htmlFor={`${id}-search`}>Dirección, distrito o lugar en Perú</label>
      <input id={`${id}-search`} value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); void search(); } }} maxLength={200} placeholder="Ej.: Plaza Bolívar, Pueblo Libre" disabled={disabled || !online} autoComplete="off"/>
      <button type="button" className="small-primary" onClick={() => void search()} disabled={disabled || !online || searching || query.trim().length < 3}>{searching ? 'Buscando…' : 'Buscar'}</button>
    </div>
    <p className="form-hint">Al pulsar Buscar, el texto se consulta en OpenStreetMap. Elige un resultado o pulsa sobre el mapa.</p>
    {results.length > 0 && <ul className="location-results" aria-label="Direcciones encontradas">{results.map(result => <li key={result.id}><button type="button" disabled={disabled} onClick={() => pick({ latitude: result.latitud, longitude: result.longitud }, result.nombre.slice(0, 255))}><Icon name="pin" size={17}/><span>{result.nombre}</span></button></li>)}</ul>}
    <CommunityMap center={value.coordinates || initialCenter} picked={value.coordinates} onPick={disabled ? undefined : point => pick(point)} accuracy={accuracy} online={online} compact fitAll={false} label="Elegir ubicación. Usa las flechas para mover el mapa y Enter para elegir el centro."/>
    <p className="form-hint">{value.coordinates ? `Punto seleccionado: ${value.coordinates.latitude.toFixed(5)}, ${value.coordinates.longitude.toFixed(5)}.` : 'Aún no hay un punto elegido.'} Con teclado: enfoca el mapa, muévelo con las flechas y pulsa Enter.</p>
    {accuracy != null && <p className="location-accuracy" role="status">Precisión del GPS: aproximadamente ±{Math.max(1, Math.round(accuracy))} m. Ajusta el punto si hace falta.</p>}
    <Field label="Referencia privada (opcional)" hint="Puedes describir el punto de encuentro. Esta referencia no se publica."><input value={value.address} onChange={event => onChange({ ...value, address: event.target.value })} maxLength={255} placeholder="Ej.: entrada principal del parque" disabled={disabled}/></Field>
    {message && <p className="success-text" role="status">{message}</p>}
    <ErrorBox message={error}/>
  </div>;
}
