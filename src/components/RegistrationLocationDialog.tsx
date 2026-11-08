import { useState, type FormEvent } from 'react';
import type { LocationDraft } from '../types';
import LocationPicker from './LocationPicker';
import { Modal } from './UI';

export default function RegistrationLocationDialog({ value, online, onConfirm, onClose }: {
  value: LocationDraft; online: boolean; onConfirm: (location: LocationDraft) => void; onClose: () => void;
}) {
  const [draft, setDraft] = useState<LocationDraft>(() => ({ address: value.address, coordinates: value.coordinates ? { ...value.coordinates } : null }));
  const [busy, setBusy] = useState(false);
  function confirm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || draft.address.trim().length < 3) return;
    onConfirm({ ...draft, address: draft.address.trim() });
  }
  return <Modal title="Selecciona tu ubicación" onClose={onClose} wide>
    <form className="form-stack" onSubmit={confirm}>
      <p className="form-intro">Escribe una calle para ver sugerencias o pulsa un punto en el mapa para completar su dirección automáticamente. También puedes usar tu GPS.</p>
      <LocationPicker value={draft} onChange={setDraft} online={online} onBusyChange={setBusy} addressField={{ label: 'Dirección o referencia', name: 'direccion-selector', required: true }}/>
      <p className="form-hint">La dirección es aproximada: revísala antes de confirmar. Si no encontramos una calle para ese punto, puedes escribir una referencia manualmente.</p>
      <div className="registration-location-dialog-actions"><button type="button" className="outline-btn" onClick={onClose}>Cancelar</button><button type="submit" className="record-button" disabled={busy || draft.address.trim().length < 3}>{busy ? 'Buscando ubicación…' : draft.coordinates ? 'Usar esta ubicación' : 'Usar esta referencia'}</button></div>
    </form>
  </Modal>;
}
