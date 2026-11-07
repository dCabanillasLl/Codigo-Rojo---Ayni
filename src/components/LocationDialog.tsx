import { useState, type FormEvent } from 'react';
import { useApp } from '../AppContext';
import { api, errorMessage } from '../lib/api';
import { ErrorBox, Field, Modal, RemoteState } from './UI';
import type { User } from '../types';

export function LocationDialog({ onClose }: { onClose: () => void }) {
  const { user, setUser, area, setArea, sectors, online, notify } = useApp();
  const [sectorId, setSectorId] = useState(user?.sectorId || area.sectorId);
  const [coordinates, setCoordinates] = useState<{ latitude: number; longitude: number } | null>(area.coordinates);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  function useDeviceLocation() {
    setError('');
    if (!navigator.geolocation) { setError('Este dispositivo no permite compartir la ubicación. Elige tu sector.'); return; }
    navigator.geolocation.getCurrentPosition(
      position => setCoordinates({ latitude: position.coords.latitude, longitude: position.coords.longitude }),
      () => setError('No pudimos obtener tu ubicación. Revisa el permiso o elige tu sector.'),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 },
    );
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      if (user) {
        const updated = await api<User>('/auth/me', { method: 'PATCH', body: { sectorId, ...(coordinates ? { latitud: coordinates.latitude, longitud: coordinates.longitude } : {}) } });
        setUser(updated);
      }
      setArea({ ...area, sectorId, coordinates });
      notify('Zona actualizada. Los vecinos solo verán una distancia aproximada.');
      onClose();
    } catch (cause) { setError(errorMessage(cause)); }
    finally { setBusy(false); }
  }

  return <Modal title="Elige tu zona" onClose={onClose}>
    <p className="form-intro">Puedes elegir tu sector o compartir tu ubicación para ordenar resultados por cercanía. Tu dirección exacta no se muestra a otros vecinos.</p>
    <form className="form-stack" onSubmit={save}>
      <Field label="Sector"><select required value={sectorId} onChange={event => { setSectorId(event.target.value); if (event.target.value !== sectorId) setCoordinates(null); }}><option value="" disabled>Elige tu sector</option>{sectors.data?.map(sector => <option key={sector.id} value={sector.id}>{sector.nombre} · {sector.distrito}</option>)}</select></Field>
      <RemoteState {...sectors}/>
      <button type="button" className="outline-btn justify-center" onClick={useDeviceLocation}>Usar ubicación de este dispositivo</button>
      {coordinates && <p className="form-hint" role="status">Ubicación disponible para calcular distancias aproximadas.</p>}
      <ErrorBox message={error}/>
      <button type="submit" className="record-button justify-center" disabled={busy || !online || !sectorId || !sectors.data?.length}>{busy ? 'Guardando…' : 'Guardar zona'}</button>
    </form>
  </Modal>;
}
