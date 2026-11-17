import { useEffect, useRef, useState } from 'react';
import { api, errorMessage } from '../lib/api';
import type { Coordinates, LocationDraft } from '../types';
import CommunityMap from './CommunityMap';
import AddressAutocomplete, { type AddressSuggestion } from './AddressAutocomplete';
import Icon from './Icon';
import { ErrorBox, Field } from './UI';
import { localize, useLanguage } from '../lib/language';

export default function LocationPicker({ value, onChange, online, disabled = false, initialCenter, initialSearch, addressField, onBusyChange, publicVenue = false }: {
  value: LocationDraft; onChange: (value: LocationDraft) => void; online: boolean; disabled?: boolean; initialCenter?: Coordinates | null;
  initialSearch?: string; addressField?: { label: string; name: string; required?: boolean }; onBusyChange?: (busy: boolean) => void; publicVenue?: boolean;
}) {
  const { language } = useLanguage();
  const [query, setQuery] = useState(initialSearch || '');
  const [suggesting, setSuggesting] = useState(false);
  const [locating, setLocating] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const controller = useRef<AbortController | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const geoTimer = useRef<number | undefined>(undefined);
  const geoWatch = useRef<number | undefined>(undefined);
  const sequence = useRef(0);
  const current = useRef({ value, onChange, disabled }); current.current = { value, onChange, disabled };
  useEffect(() => () => { sequence.current++; controller.current?.abort(); window.clearTimeout(timer.current); window.clearTimeout(geoTimer.current); if (geoWatch.current !== undefined) navigator.geolocation?.clearWatch(geoWatch.current); }, []);
  useEffect(() => {
    if (!value.coordinates) {
      sequence.current++; controller.current?.abort(); window.clearTimeout(timer.current);
      setAccuracy(null); setMessage(''); setLocating(false); setResolving(false);
    }
  }, [value.coordinates]);
  useEffect(() => { onBusyChange?.(locating || suggesting || resolving); return () => onBusyChange?.(false); }, [locating, suggesting, resolving, onBusyChange]);
  function cancelLocation() {
    sequence.current++; controller.current?.abort(); window.clearTimeout(timer.current); setLocating(false); setResolving(false);
    window.clearTimeout(geoTimer.current);
    if (geoWatch.current !== undefined) { navigator.geolocation?.clearWatch(geoWatch.current); geoWatch.current = undefined; }
    return sequence.current;
  }
  function chooseAddress(place: AddressSuggestion) {
    cancelLocation(); setAccuracy(null); setError(''); setQuery(place.nombre);
    current.current.onChange({ coordinates: { latitude: place.latitud, longitude: place.longitud }, address: place.nombre });
    setMessage(localize(language,'Dirección y ubicación seleccionadas. Puedes revisarlas antes de confirmar.','Address and location selected. Review them before confirming.','Wasiyki kaywan akllasqam. Takyachishaspa ñawpaqta qhaway.'));
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
        setMessage(address ? localize(language,'Dirección aproximada completada. Revísala y corrígela si hace falta.','Approximate address added. Review it and correct it if needed.','Wasiyki asuyllamanta hunt’asqam. Qhaway, munaspa allichay.') : localize(language,'El punto quedó seleccionado. No encontramos su dirección; escribe una referencia.','Point selected. We could not find its address; enter a reference.','Kay akllasqam. Wasiyta mana tarirqanchu; huk rikuchiyta qillqay.'));
      } catch (cause) { if (sequence.current === operation) setError(`${errorMessage(cause)} ${localize(language,'El punto sigue seleccionado.','The point is still selected.','Kayqa akllasqam kachkan.')}`); }
      finally { if (sequence.current === operation) setResolving(false); }
    }, 350);
  }
  function updateAddress(address: string) {
    cancelLocation(); setError(''); setMessage('');
    current.current.onChange({ ...current.current.value, address });
  }
  function locate() {
    if (!navigator.geolocation) { setError(localize(language,'Tu navegador no permite detectar ubicación. Puedes buscar una dirección o elegirla en el mapa.','Your browser cannot detect location. Search for an address or choose it on the map.','Navegadorniykiqa manam kayta tariyta atinchu. Wasiyta maskay utaq mapapi akllay.')); return; }
    if (!window.isSecureContext) { setError(localize(language,'El GPS necesita HTTPS o localhost. Puedes elegir el punto en el mapa.','GPS requires HTTPS or localhost. You can choose the point on the map.','GPS nisqapaq HTTPS utaq localhost nisqa munan. Mapapi kayta akllayta atinki.')); return; }
    const operation = cancelLocation(); setLocating(true); setError(''); setMessage('');
    let best: GeolocationPosition | null = null;
    let finished = false;
    const stopWatch = () => {
      if (geoWatch.current !== undefined) { navigator.geolocation.clearWatch(geoWatch.current); geoWatch.current = undefined; }
      window.clearTimeout(geoTimer.current); geoTimer.current = undefined;
    };
    const finish = (position: GeolocationPosition | null) => {
      if (finished || sequence.current !== operation) return;
      finished = true; stopWatch(); setLocating(false);
      if (position) pick({ latitude: position.coords.latitude, longitude: position.coords.longitude }, position.coords.accuracy);
      else setError(localize(language,'No pudimos obtener una ubicación precisa. Busca tu dirección o ajusta el pin en el mapa.','We could not get a precise location. Search for your address or adjust the pin on the map.','Kayninta allinta manam tarirqanchu. Wasiykita maskay utaq mapapi pin-ta kuyuchiy.'));
    };
    geoWatch.current = navigator.geolocation.watchPosition(position => {
      if (sequence.current !== operation || finished) return;
      if (!best || position.coords.accuracy < best.coords.accuracy) best = position;
      setMessage(localize(language,`Buscando la mejor señal GPS… precisión actual ±${Math.max(1, Math.round(best.coords.accuracy))} m`,`Finding the best GPS signal… current accuracy ±${Math.max(1, Math.round(best.coords.accuracy))} m`,`GPS allin señal-ta maskachkan… kunan chiqap kaynin ±${Math.max(1, Math.round(best.coords.accuracy))} m`));
      if (best.coords.accuracy <= 15) finish(best);
    }, cause => {
      if (sequence.current !== operation || finished) return;
      finished = true; stopWatch(); setLocating(false);
      setError(cause.code === 1 ? localize(language,'No se autorizó la ubicación. Puedes buscar una dirección o seleccionar el punto en el mapa.','Location access was not allowed. Search for an address or select the point on the map.','Kayta tariypaq manam permiso karqanchu. Wasiyta maskay utaq mapapi kayta akllay.') : localize(language,'No pudimos detectar el GPS. Busca una dirección o elige el punto en el mapa.','We could not detect GPS. Search for an address or choose the point on the map.','GPS nisqata manam tarirqanchu. Wasiyta maskay utaq mapapi kayta akllay.'));
    }, { enableHighAccuracy: true, timeout: 25000, maximumAge: 0 });
    geoTimer.current = window.setTimeout(() => finish(best), 12000);
  }
  return <div className="location-picker">
    <AddressAutocomplete label={addressField?.label || localize(language,'Buscar dirección o calle','Search address or street','Wasiyta utaq calle nisqata maskay')} name={addressField?.name} required={addressField?.required} value={addressField ? value.address : query} onChange={addressField ? updateAddress : text => { cancelLocation(); setQuery(text); }} onSelect={chooseAddress} bias={value.coordinates || initialCenter} online={online} disabled={disabled} onBusyChange={setSuggesting} autoSearch={Boolean(initialSearch)}/>
    <div className="location-picker-tools"><span className="location-map-prompt">{localize(language,'Elige tu ubicación','Choose your location','Kayniykita akllay')}</span><button type="button" className="outline-btn" onClick={locate} disabled={disabled || locating || !online}><Icon name="pin" size={17}/>{locating ? localize(language,'Buscando…','Searching…','Maskachkan…') : localize(language,'Usar mi ubicación','Use my location','Kayniyta llamk’achiy')}</button></div>
    <CommunityMap center={value.coordinates || initialCenter} picked={value.coordinates} onPick={disabled || !online ? undefined : point => pick(point)} onPickStart={() => { cancelLocation(); setAccuracy(null); }} accuracy={accuracy} online={online} compact fitAll={false} label={localize(language,'Elige tu ubicación. Arrastra el pin o usa las flechas para mover el mapa y Enter para confirmar el punto.','Choose your location. Drag the pin or use the arrow keys to move the map, then press Enter to confirm the point.','Kayniykita akllay. Pin-ta aysay utaq flechakunawan mapata kuyuchiy, chaymanta Enter ñit’iy kayta takyachinaykipaq.')}/>
    {resolving && <p className="success-text" role="status">{localize(language,'Completando la dirección del punto seleccionado…','Completing the selected point address…','Akllasqa kaypa wasinta hunt’achkan…')}</p>}
    <p className={`location-selection-state ${value.coordinates ? 'is-selected' : ''}`} role="status">{value.coordinates ? localize(language,'Punto seleccionado','Point selected','Kay akllasqam') : localize(language,'Busca una dirección o selecciona un punto','Search for an address or select a point','Wasiyta maskay utaq huk kayta akllay')}</p>
    {accuracy != null && value.coordinates && <p className="location-accuracy" role="status">{localize(language,`Precisión del GPS: aproximadamente ±${Math.max(1, Math.round(accuracy))} m.`,`GPS accuracy: approximately ±${Math.max(1, Math.round(accuracy))} m.`,`GPS chiqap kaynin: asuyllamanta ±${Math.max(1, Math.round(accuracy))} m.`)}</p>}
    {!addressField && <Field label={localize(language,publicVenue ? 'Dirección o referencia de la actividad' : 'Dirección o referencia privada',publicVenue ? 'Activity address or reference' : 'Private address or reference',publicVenue ? 'Ruraypa wasin utaq rikuchiy' : 'Kikinpa wasin utaq rikuchiy')} hint={localize(language,'Se completa al elegir un punto. Puedes corregirla antes de guardar.','It is filled in when you choose a point. You can edit it before saving.','Kayta akllaptiyki hunt’akun. Waqaychashpa ñawpaqta allichayta atinki.')}><input value={value.address} onChange={event => updateAddress(event.target.value)} maxLength={255} placeholder={localize(language,'Calle, número o referencia','Street, number, or reference','Calle, yupay utaq rikuchiy')} disabled={disabled}/></Field>}
    {message && <p className="success-text" role="status">{message}</p>}
    <ErrorBox message={error}/>
  </div>;
}
