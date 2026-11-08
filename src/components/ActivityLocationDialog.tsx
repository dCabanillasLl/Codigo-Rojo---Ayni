import { useState, type FormEvent } from 'react';
import type { Coordinates, LocationDraft } from '../types';
import LocationPicker from './LocationPicker';
import { Modal } from './UI';

export default function ActivityLocationDialog({ value, initialCenter, online, onConfirm, onClose }: {
  value: LocationDraft; initialCenter?: Coordinates | null; online: boolean;
  onConfirm: (location: LocationDraft) => void; onClose: () => void;
}) {
  const [draft, setDraft] = useState<LocationDraft>(() => ({ address: value.address, coordinates: value.coordinates ? { ...value.coordinates } : null }));
  const [busy, setBusy] = useState(false);
  function confirm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!busy && draft.coordinates) onConfirm({ ...draft, address: draft.address.trim() });
  }
  return <Modal title="Ubicación de la actividad" onClose={onClose} wide>
    <form className="form-stack" onSubmit={confirm}>
      <p className="form-intro">Elige el lugar de encuentro. Puedes buscar una dirección, usar GPS o arrastrar el pin. El punto y la referencia de esta actividad se mostrarán a los vecinos.</p>
      <LocationPicker value={draft} onChange={setDraft} initialCenter={initialCenter} online={online} onBusyChange={setBusy} publicVenue/>
      <p className="form-hint">Revisa el lugar antes de confirmar. Tu dirección privada de perfil no se modifica. Cancelar conserva la selección anterior.</p>
      <div className="event-change-actions"><button type="button" className="outline-btn" onClick={onClose}>Volver</button><button type="submit" className="record-button event-change-submit" disabled={busy || !draft.coordinates || !online}>{busy ? 'Buscando dirección…' : 'Usar este lugar'}</button></div>
    </form>
  </Modal>;
}
