import { useState, type FormEvent } from 'react';
import { useApp } from '../AppContext';
import { api, errorMessage, refreshData } from '../lib/api';
import { ErrorBox, Field, Modal } from './UI';
import LocationPicker from './LocationPicker';
import type { LocationDraft, User } from '../types';

export function LocationDialog({ onClose, saveToProfile = false }: { onClose: () => void; saveToProfile?: boolean }) {
  const { user, setUser, postingSectorId, area, setArea, online, notify } = useApp();
  const profilePoint = user?.latitud != null && user.longitud != null ? { latitude: Number(user.latitud), longitude: Number(user.longitud) } : null;
  const [location, setLocation] = useState<LocationDraft>({ coordinates: saveToProfile ? profilePoint : area.coordinates || profilePoint, address: saveToProfile ? user?.direccion || '' : '' });
  const [radius, setRadius] = useState(area.radius);
  const [saveProfile, setSaveProfile] = useState(saveToProfile);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      if (saveProfile && user) {
        if (!postingSectorId || !location.coordinates) throw new Error('Elige un punto antes de guardarlo en tu perfil.');
        const updated = await api<User>('/auth/me', { method: 'PATCH', body: { sectorId: postingSectorId, direccion: location.address.trim() || 'Punto elegido en el mapa', latitud: location.coordinates.latitude, longitud: location.coordinates.longitude } });
        setUser(updated);
      }
      setArea({ coordinates: location.coordinates, radius }); refreshData();
      notify(saveProfile ? 'Ubicación guardada en tu perfil. La dirección exacta es privada.' : 'Zona de búsqueda actualizada. Ya puedes explorar a tus vecinos.');
      onClose();
    } catch (cause) { setError(errorMessage(cause)); }
    finally { setBusy(false); }
  }
  return <Modal title="Elige tu ubicación" onClose={onClose} wide>
    <p className="form-intro">Busca servicios y pedidos cerca de un punto. También puedes guardar tu ubicación en el perfil para usarla en tus próximas publicaciones.</p>
    <form className="form-stack location-form" onSubmit={save}>
      <LocationPicker value={location} onChange={setLocation} online={online} disabled={busy}/>
      {location.coordinates && <button type="button" className="text-action" onClick={() => { setLocation({ coordinates: null, address: '' }); setSaveProfile(false); }}>Ver todas las publicaciones, sin filtrar por distancia</button>}
      <Field label="Distancia de búsqueda"><select value={radius} onChange={event => setRadius(Number(event.target.value))}>{[1000, 1500, 2000].map(value => <option key={value} value={value}>{value / 1000} km a la redonda</option>)}</select></Field>
      {user && <label className="check-field"><input type="checkbox" checked={saveProfile} onChange={event => setSaveProfile(event.target.checked)}/>Guardar también como mi ubicación en el perfil</label>}
      <p className="form-hint">Otros vecinos verán una zona aproximada. Sin un punto elegido, puedes consultar las publicaciones sin filtrar por distancia.</p>
      <ErrorBox message={error}/>
      <button type="submit" className="record-button justify-center" disabled={busy || (saveProfile && (!postingSectorId || !online || !location.coordinates))}>{busy ? 'Guardando…' : 'Usar esta ubicación'}</button>
    </form>
  </Modal>;
}
