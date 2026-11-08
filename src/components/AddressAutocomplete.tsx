import { useEffect, useId, useRef, useState } from 'react';
import { api, errorMessage } from '../lib/api';
import { COMMUNITY_CENTER } from '../lib/location';
import type { Coordinates } from '../types';
import Icon from './Icon';
import { ErrorBox } from './UI';

export type AddressSuggestion = { id: string; nombre: string; latitud: number; longitud: number };
export default function AddressAutocomplete({ value, onChange, onSelect, online, disabled = false, label, name, required = false, bias, showSearchButton = true, onBusyChange }: {
  value: string; onChange: (text: string) => void; onSelect: (place: AddressSuggestion) => void;
  online: boolean; disabled?: boolean; label: string; name?: string; required?: boolean;
  bias?: Coordinates | null; showSearchButton?: boolean; onBusyChange?: (busy: boolean) => void;
}) {
  const id = useId();
  const [typed, setTyped] = useState('');
  const [version, setVersion] = useState(0);
  const [focused, setFocused] = useState(false);
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<AddressSuggestion[]>([]);
  const [active, setActive] = useState(-1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const request = useRef<AbortController | null>(null);
  const sequence = useRef(0);
  const point = bias || COMMUNITY_CENTER;
  useEffect(() => { onBusyChange?.(loading); return () => onBusyChange?.(false); }, [loading, onBusyChange]);
  useEffect(() => {
    const operation = ++sequence.current;
    if (!focused || disabled || !online || typed !== value || typed.trim().length < 3 || typed.trim().length > 200) {
      setResults([]); setOpen(false); setLoading(false); return;
    }
    const controller = new AbortController(); request.current = controller;
    setLoading(true); setError('');
    const timer = window.setTimeout(async () => {
      try {
        const params = new URLSearchParams({ q: typed.trim(), latitud: String(point.latitude), longitud: String(point.longitude) });
        const data = await api<AddressSuggestion[]>(`/ubicaciones/sugerencias?${params}`, { signal: controller.signal });
        if (sequence.current !== operation) return;
        setResults(data); setActive(-1); setOpen(data.length > 0);
      } catch (cause) { if (sequence.current === operation) { setError(errorMessage(cause)); setResults([]); setOpen(false); } }
      finally { if (sequence.current === operation) setLoading(false); }
    }, 650);
    return () => { sequence.current++; window.clearTimeout(timer); controller.abort(); };
  }, [typed, value, version, focused, disabled, online, point.latitude, point.longitude]);
  function select(place: AddressSuggestion) {
    sequence.current++; request.current?.abort(); setTyped(''); setOpen(false); setResults([]); setError(''); setLoading(false);
    onSelect(place);
  }
  return <div className="address-autocomplete form-field" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) { setFocused(false); setOpen(false); } }}>
    <label className="location-address-label" htmlFor={id}>{label}</label>
    <div className="location-search">
      <input id={id} name={name} value={value} role="combobox" aria-autocomplete="list" aria-expanded={open} aria-controls={`${id}-results`} aria-activedescendant={open && active >= 0 ? `${id}-option-${active}` : undefined} aria-busy={loading} required={required} minLength={required ? 3 : undefined} maxLength={255} autoComplete="off" placeholder="Escribe una calle o dirección" disabled={disabled} onFocus={() => setFocused(true)}
        onChange={event => { setTyped(event.target.value); setResults([]); setOpen(false); setActive(-1); setError(''); onChange(event.target.value); }}
        onKeyDown={event => {
          if (event.key === 'ArrowDown' && results.length) { event.preventDefault(); setOpen(true); setActive(index => (index + 1) % results.length); }
          else if (event.key === 'ArrowUp' && results.length) { event.preventDefault(); setOpen(true); setActive(index => (index <= 0 ? results.length : index) - 1); }
          else if (event.key === 'Enter' && open && results.length) { event.preventDefault(); select(results[active >= 0 ? active : 0]); }
          else if (event.key === 'Enter' && showSearchButton) { event.preventDefault(); setTyped(value); setFocused(true); setVersion(current => current + 1); }
          else if (event.key === 'Escape' && open) { event.preventDefault(); event.stopPropagation(); setOpen(false); setTyped(''); }
        }}/>
      {showSearchButton && <button type="button" className="small-primary" disabled={disabled || !online || value.trim().length < 3 || value.trim().length > 200} onClick={() => { setTyped(value); setFocused(true); setVersion(current => current + 1); }}>Buscar</button>}
    </div>
    {open && <ul id={`${id}-results`} role="listbox" className="address-suggestions" aria-label="Sugerencias de direcciones">{results.map((place, index) => <li key={place.id} id={`${id}-option-${index}`} role="option" aria-selected={index === active} className={index === active ? 'active' : ''} onPointerDown={event => event.preventDefault()} onClick={() => select(place)}><Icon name="pin" size={16}/><span>{place.nombre}</span></li>)}</ul>}
    {loading && <small className="form-hint" role="status">Buscando sugerencias…</small>}
    <small className="form-hint">El texto se consulta en <a href="https://photon.komoot.io/" target="_blank" rel="noreferrer">Photon</a> para sugerir direcciones con datos de OpenStreetMap.</small>
    <ErrorBox message={error}/>
  </div>;
}
