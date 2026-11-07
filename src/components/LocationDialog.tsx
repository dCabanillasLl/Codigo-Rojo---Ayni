import { useState, type FormEvent } from 'react';
import { useApp } from '../AppContext';
import { api, errorMessage } from '../lib/api';
import { ErrorBox, Field, Modal } from './UI';
import Icon from './Icon';
import type { User } from '../types';

export function LocationDialog({ onClose }: { onClose: () => void }) {
  const { user, setUser, area, setArea, online, notify } = useApp();
  const [coordinates, setCoordinates] = useState<{ latitude: number; longitude: number } | null>(area.coordinates || (user?.latitud != null && user.longitud != null ? { latitude: Number(user.latitud), longitude: Number(user.longitud) } : null));
  const [address, setAddress] = useState(user?.direccion || '');
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [locating, setLocating] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  function useDeviceLocation() {
    setError(''); setMessage('');
    if (!navigator.geolocation) { setError('Este dispositivo no permite detectar la ubicación. Puedes escribirla manualmente.'); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(async position => {
      const point = { latitude: position.coords.latitude, longitude: position.coords.longitude };
      setCoordinates(point); setAccuracy(position.coords.accuracy);
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 8000);
      try {
        const query = new URLSearchParams({ format: 'jsonv2', lat: String(point.latitude), lon: String(point.longitude), zoom: '18', addressdetails: '1' });
        const response = await fetch(`https://nominatim.openstreetmap.org/reverse?${query}`, { headers: { Accept: 'application/json', 'Accept-Language': 'es' }, cache: 'no-store', signal: controller.signal });
        if (!response.ok) throw new Error('GEOCODING_FAILED');
        const result = await response.json() as { display_name?: string; address?: Record<string, string> };
        const parts = result.address || {};
        const street = [parts.road || parts.pedestrian || parts.residential, parts.house_number].filter(Boolean).join(' ');
        const locality = parts.neighbourhood || parts.suburb || parts.city_district || parts.city || parts.town || parts.village;
        const suggestion = [street, locality, parts.city || parts.town || parts.village, parts.state].filter((part, index, list) => Boolean(part) && list.indexOf(part) === index).join(', ') || result.display_name || '';
        if (!suggestion) throw new Error('ADDRESS_NOT_FOUND');
        setAddress(suggestion);
        setMessage('Dirección sugerida por OpenStreetMap. Revísala y corrígela si hace falta.');
      } catch {
        setMessage('Punto GPS detectado. No encontramos una dirección; puedes escribir una referencia.');
      } finally { window.clearTimeout(timeout); setLocating(false); }
    }, () => { setError('No pudimos detectar tu ubicación. Revisa el permiso del navegador o escribe una referencia.'); setLocating(false); },
    { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      if (user) {
        const currentSectorId = user.sectorId || area.sectorId;
        const updated = await api<User>('/auth/me', { method: 'PATCH', body: { ...(currentSectorId ? { sectorId: currentSectorId } : {}), direccion: address.trim(), ...(coordinates ? { latitud: coordinates.latitude, longitud: coordinates.longitude } : {}) } });
        setUser(updated);
      }
      setArea({ ...area, sectorId: user?.sectorId || area.sectorId, coordinates });
      notify('Ubicación guardada. Tu dirección exacta solo está visible para ti.');
      onClose();
    } catch (cause) { setError(errorMessage(cause)); }
    finally { setBusy(false); }
  }

  return <Modal title="Mi ubicación" onClose={onClose}>
    <p className="form-intro">Al detectar tu ubicación, el punto GPS se envía a OpenStreetMap para sugerir una dirección. Puedes corregirla antes de guardar. AYNI mantiene privada tu dirección exacta y solo muestra una distancia aproximada a otros vecinos.</p>
    <form className="form-stack location-form" onSubmit={save}>
      <button type="button" className="record-button location-detect-button justify-center" onClick={useDeviceLocation} disabled={locating || !online}><Icon name="pin"/>{locating ? 'Buscando ubicación precisa…' : coordinates ? 'Actualizar mi ubicación' : 'Usar mi ubicación actual'}</button>
      <Field label="Dirección o referencia" hint="La dirección se guarda en privado. El punto GPS se usa para calcular cercanía."><input value={address} onChange={event => setAddress(event.target.value)} maxLength={255} minLength={3} placeholder="Calle, número, distrito o referencia" required autoComplete="street-address"/></Field>
      {accuracy != null && <p className="location-accuracy" role="status">Precisión reportada por el dispositivo: aproximadamente ±{Math.max(1, Math.round(accuracy))} m.</p>}
      {coordinates && <p className="form-hint location-privacy"><Icon name="shield" size={16}/>La dirección y las coordenadas exactas no se muestran en publicaciones ni a otros vecinos.</p>}
      {message && <p className="success-text" role="status">{message}</p>}
      <p className="location-attribution">Direcciones sugeridas por <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a>.</p>
      <ErrorBox message={error}/>
      <button type="submit" className="record-button justify-center" disabled={busy || locating || !online || address.trim().length < 3}>{busy ? 'Guardando…' : 'Guardar ubicación'}</button>
    </form>
  </Modal>;
}
