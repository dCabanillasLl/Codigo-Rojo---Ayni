import { useState, type FormEvent } from 'react';
import type { Coordinates, LocationDraft } from '../types';
import LocationPicker from './LocationPicker';
import { Modal } from './UI';
import { localize, useLanguage } from '../lib/language';

export default function ActivityLocationDialog({ value, initialCenter, online, onConfirm, onClose }: {
  value: LocationDraft; initialCenter?: Coordinates | null; online: boolean;
  onConfirm: (location: LocationDraft) => void; onClose: () => void;
}) {
  const { language } = useLanguage();
  const [draft, setDraft] = useState<LocationDraft>(() => ({ address: value.address, coordinates: value.coordinates ? { ...value.coordinates } : null }));
  const [busy, setBusy] = useState(false);
  function confirm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!busy && draft.coordinates) onConfirm({ ...draft, address: draft.address.trim() });
  }
  return <Modal title={localize(language,'Ubicación de la actividad','Activity location','Ruraypa kaynin')} onClose={onClose} wide>
    <form className="form-stack" onSubmit={confirm}>
      <p className="form-intro">{localize(language,'Elige el lugar de encuentro. Puedes buscar una dirección, usar GPS o arrastrar el pin. El punto y la referencia de esta actividad se mostrarán a los vecinos.','Choose the meeting place. Search for an address, use GPS, or drag the pin. Neighbors will see this activity location and reference.','Tinkunapaq kayta akllay. Wasiyta maskay, GPS-ta llamk’achiy utaq pin-ta aysay. Llaqtamasikunaqa kay ruraypa kayninta rikunkaku.')}</p>
      <LocationPicker value={draft} onChange={setDraft} initialCenter={initialCenter} online={online} onBusyChange={setBusy} publicVenue addressField={{ label: 'Buscar dirección o calle', name: 'direccion-actividad-selector' }}/>
      <p className="form-hint">{localize(language,'Revisa el lugar antes de confirmar. Tu dirección privada de perfil no se modifica. Cancelar conserva la selección anterior.','Review the place before confirming. Your private profile address will not change. Cancel keeps the previous selection.','Takyachishaspa ñawpaqta kayta qhaway. Perfilniykipi pakasqa wasiykiqa manam tikrakunchu. Sayachiy ñawpaq akllasqaykita waqaychan.')}</p>
      <div className="event-change-actions"><button type="button" className="outline-btn" onClick={onClose}>{localize(language,'Volver','Back','Kutiy')}</button><button type="submit" className="record-button event-change-submit" disabled={busy || !draft.coordinates || !online}>{busy ? localize(language,'Buscando dirección…','Searching address…','Wasiyta maskachkan…') : localize(language,'Usar este lugar','Use this place','Kayta llamk’achiy')}</button></div>
    </form>
  </Modal>;
}
