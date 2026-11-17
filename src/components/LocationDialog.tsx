import { useState, type FormEvent } from 'react';
import { useApp } from '../AppContext';
import { api, errorMessage, refreshData } from '../lib/api';
import { ErrorBox, Field, Modal } from './UI';
import LocationPicker from './LocationPicker';
import type { LocationDraft, User } from '../types';
import { localize, useLanguage } from '../lib/language';

export function LocationDialog({ onClose, saveToProfile = false }: { onClose: () => void; saveToProfile?: boolean }) {
  const { language } = useLanguage();
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
        if (!postingSectorId || !location.coordinates) throw new Error(localize(language,'Elige un punto antes de guardarlo en tu perfil.','Choose a point before saving it to your profile.','Manaraq perfilniykipi waqaychachkaspa huk kayta akllay.'));
        const updated = await api<User>('/auth/me', { method: 'PATCH', body: { sectorId: postingSectorId, direccion: location.address.trim() || 'Punto elegido en el mapa', latitud: location.coordinates.latitude, longitud: location.coordinates.longitude } });
        setUser(updated);
      }
      setArea({ coordinates: location.coordinates, radius }); refreshData();
      notify(saveProfile ? localize(language,'Ubicación guardada en tu perfil. La dirección exacta es privada.','Location saved to your profile. Your exact address is private.','Kayniyki perfilniykipi waqaychasqam. Chiqap wasiykiqa pakasqam.') : localize(language,'Zona de búsqueda actualizada. Ya puedes explorar a tus vecinos.','Search area updated. You can now explore your neighborhood.','Maskana suyuyki musuqyachisqam. Kunanqa llaqtamasiykikunata qhawayta atinki.'));
      onClose();
    } catch (cause) { setError(errorMessage(cause)); }
    finally { setBusy(false); }
  }
  return <Modal title={localize(language,'Elige tu ubicación','Choose your location','Kayniykita akllay')} onClose={onClose} wide>
    <p className="location-dialog-intro">{localize(language,'Busca una dirección o coloca el pin en el mapa para definir tu zona.','Search for an address or place the pin on the map to set your area.','Wasiykita maskay utaq mapapi pin-ta churay, suyuykita akllanapaq.')}</p>
    <form className="form-stack location-form" onSubmit={save}>
      <LocationPicker value={location} onChange={setLocation} online={online} disabled={busy}/>
      {location.coordinates && <button type="button" className="text-action location-clear-action" onClick={() => { setLocation({ coordinates: null, address: '' }); setSaveProfile(false); }}>{localize(language,'Quitar el filtro de ubicación','Remove location filter','Kayman churayta hurquy')}</button>}
      <details className="location-options">
        <summary>{localize(language,'Opciones de búsqueda y perfil','Search and profile options','Maskaypa, perfilpa akllanakuna')}</summary>
        <div className="location-options-content">
          <Field label={localize(language,'Distancia de búsqueda','Search radius','Maskana karu kay')}><select value={radius} onChange={event => setRadius(Number(event.target.value))}>{[1000, 1500, 2000].map(value => <option key={value} value={value}>{localize(language,`${value / 1000} km a la redonda`,`${value / 1000} km radius`,`${value / 1000} km muyuriqpi`)}</option>)}</select></Field>
          {user && <label className="check-field"><input type="checkbox" checked={saveProfile} onChange={event => setSaveProfile(event.target.checked)}/>{localize(language,'Guardar también en mi perfil para próximas publicaciones','Also save to my profile for future listings','Hamuq willaykunapaq perfilniypipas waqaychay')}</label>}
          <p className="form-hint">{localize(language,'Tu perfil muestra solo una zona aproximada. También puedes continuar sin ubicación para ver todas las publicaciones.','Your profile shows only an approximate area. You can continue without a location to see all listings.','Perfilniykiqa asuyllapi suyullatam rikuchin. Kayniykita mana churaspapas llapan willaykunata qhawayta atinki.')}</p>
        </div>
      </details>
      <ErrorBox message={error}/>
      <div className="location-submit-bar"><button type="submit" className="record-button justify-center" disabled={busy || (saveProfile && (!postingSectorId || !online || !location.coordinates))}>{busy ? localize(language,'Guardando…','Saving…','Waqaychachkan…') : localize(language,'Aplicar ubicación','Apply location','Kayta churay')}</button></div>
    </form>
  </Modal>;
}
