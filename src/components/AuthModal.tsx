import { useRef, useState, type FormEvent } from 'react';
import { useApp } from '../AppContext';
import { ApiError, api, errorMessage, refreshData } from '../lib/api';
import { Modal, Field, ErrorBox } from './UI';
import type { User } from '../types';

export default function AuthModal() {
  const { setAuthOpen, setUser, online, notify } = useApp();
  const [register, setRegister] = useState(false);
  const [legacyLogin, setLegacyLogin] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [dni, setDni] = useState('');
  const [dniConsent, setDniConsent] = useState(false);
  const [dniBusy, setDniBusy] = useState(false);
  const [dniProof, setDniProof] = useState('');
  const [dniMessage, setDniMessage] = useState('');
  const [coordinates, setCoordinates] = useState<{ latitud: number; longitud: number } | null>(null);
  const [locationBusy, setLocationBusy] = useState(false);
  const [locationMessage, setLocationMessage] = useState('');
  const [locationError, setLocationError] = useState('');
  const formRef = useRef<HTMLFormElement>(null);
  function explainError(value: unknown) {
    if (value instanceof ApiError && ['INVALID_ORIGIN', 'CORS_ORIGIN_REJECTED'].includes(value.code)) {
      return 'La dirección de AYNI no está autorizada por el servidor. Abre la app desde localhost:8444 o agrega la dirección actual a FRONTEND_ORIGIN en backend/.env y reinicia el backend.';
    }
    if (value instanceof ApiError && value.code === 'CLIENT_HEADER_REQUIRED') {
      return 'La app se cargó con una versión anterior. Recarga la página con Ctrl+F5 y vuelve a intentarlo.';
    }
    if (value instanceof ApiError && value.code === 'INVALID_CREDENTIALS') {
      return register ? 'No pudimos crear la cuenta con esos datos. Revisa el DNI y vuelve a consultarlo.' : 'No encontramos una cuenta con ese DNI y contraseña. Si ya tenías una cuenta antigua, contacta al equipo de AYNI.';
    }
    return errorMessage(value);
  }
  async function lookupDni() {
    setDniBusy(true); setError(''); setDniMessage(''); setDniProof('');
    try {
      const result = await api<{ nombres: string; apellidos: string; proof: string }>('/identity/dni/lookup', { method: 'POST', body: { dni, consentimiento: dniConsent } });
      const names = formRef.current?.elements.namedItem('nombres') as HTMLInputElement | null;
      const surnames = formRef.current?.elements.namedItem('apellidos') as HTMLInputElement | null;
      if (names) names.value = result.nombres;
      if (surnames) surnames.value = result.apellidos;
      setDniProof(result.proof); setDniMessage('Datos encontrados. Revísalos antes de crear tu cuenta.');
    } catch (lookupError) { setError(errorMessage(lookupError)); }
    finally { setDniBusy(false); }
  }
  function useCurrentLocation() {
    setLocationMessage(''); setLocationError('');
    if (!navigator.geolocation) { setLocationError('Este dispositivo no permite detectar la ubicación. Puedes escribir tu dirección.'); return; }
    setLocationBusy(true);
    navigator.geolocation.getCurrentPosition(async position => {
      const location = { latitud: position.coords.latitude, longitud: position.coords.longitude };
      setCoordinates(location);
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 8000);
      try {
        const params = new URLSearchParams({ latitude: String(location.latitud), longitude: String(location.longitud), localityLanguage: 'es' });
        const response = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?${params}`, { headers: { Accept: 'application/json' }, cache: 'no-store', signal: controller.signal });
        if (!response.ok) throw new Error('GEOCODING_FAILED');
        const place = await response.json() as { locality?: string; city?: string; principalSubdivision?: string; countryName?: string; plusCode?: string };
        const suggestedAddress = [...new Set([place.locality, place.city, place.principalSubdivision, place.countryName].map(value => value?.trim()).filter((value): value is string => Boolean(value)))].join(', ') || place.plusCode || '';
        const addressInput = formRef.current?.elements.namedItem('direccion') as HTMLInputElement | null;
        if (!suggestedAddress || !addressInput) throw new Error('ADDRESS_NOT_FOUND');
        addressInput.value = suggestedAddress;
        setLocationMessage('Dirección aproximada detectada. Revísala y corrígela si hace falta.');
      } catch {
        setLocationError('Guardamos tu ubicación GPS, pero no pudimos sugerir una dirección. Escríbela manualmente.');
      } finally {
        window.clearTimeout(timeout);
        setLocationBusy(false);
      } },
      () => { setLocationError('No pudimos detectar la ubicación. Revisa el permiso del navegador o escribe tu dirección.'); setLocationBusy(false); },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 },
    );
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data = new FormData(event.currentTarget); setBusy(true); setError('');
    try {
      const body = register ? { nombres: data.get('nombres'), apellidos: data.get('apellidos'), contrasena: data.get('contrasena'), dni, consentimientoDni: true, dniProof, direccion: data.get('direccion'), ...(coordinates ?? {}), ...(data.get('telefono') ? { telefono: data.get('telefono') } : {}) } : legacyLogin ? { correo: data.get('correo'), contrasena: data.get('contrasena') } : { identificador: data.get('identificador'), contrasena: data.get('contrasena') };
      const user = await api<User>(`/auth/${register ? 'register' : 'login'}`, { method: 'POST', body });
      setUser(user); refreshData(); setAuthOpen(false); notify(`Bienvenido${register ? ' a AYNI' : ' de vuelta'}, ${user.nombres}`);
    } catch (error) { setError(explainError(error)); } finally { setBusy(false); }
  }
  return <Modal title={register ? 'Únete a tu barrio' : 'Qué bueno verte'} onClose={() => setAuthOpen(false)}>
    <p className="form-intro">{register ? 'Crea tu cuenta para pedir ayuda y colaborar con tus vecinos.' : 'Entra para encontrar ayuda y conectar con tus vecinos.'}</p>
    <form ref={formRef} onSubmit={submit} className="form-stack auth-form">
      {register && <>
        <Field label="DNI" hint="Lo usaremos para consultar tus nombres y crear tu acceso."><div className="input-with-action"><input name="dni" inputMode="numeric" autoComplete="off" value={dni} onChange={event => { setDni(event.target.value.replace(/\D/g, '').slice(0, 8)); setDniProof(''); setDniMessage(''); }} placeholder="Escribe los 8 dígitos" maxLength={8} required/><button type="button" className="secondary-button" disabled={dniBusy || dni.length !== 8 || !dniConsent || !online} onClick={lookupDni}>{dniBusy ? 'Consultando…' : 'Consultar'}</button></div></Field>
        <label className="consent-row"><input type="checkbox" checked={dniConsent} onChange={event => { setDniConsent(event.target.checked); setDniProof(''); }}/><span>Autorizo enviar mi DNI a API Perú para consultar mis nombres y apellidos.</span></label>
        {dniMessage && <p className="success-text" role="status">{dniMessage}</p>}
        <div className="form-columns"><Field label="Nombres" hint={dniProof ? 'Datos consultados; para corregirlos, borra el DNI y edítalos manualmente.' : undefined}><input name="nombres" autoComplete="given-name" required maxLength={80} readOnly={Boolean(dniProof)}/></Field><Field label="Apellidos"><input name="apellidos" autoComplete="family-name" required maxLength={100} readOnly={Boolean(dniProof)}/></Field></div>
      </>}
      {!register && <Field label={legacyLogin ? 'Correo de tu cuenta anterior' : 'DNI'}><input name={legacyLogin ? 'correo' : 'identificador'} type={legacyLogin ? 'email' : 'text'} inputMode={legacyLogin ? 'email' : 'numeric'} autoComplete="username" required minLength={legacyLogin ? undefined : 8} maxLength={legacyLogin ? 254 : 8} pattern={legacyLogin ? undefined : '[0-9]{8}'} placeholder={legacyLogin ? 'tu@correo.com' : 'Escribe los 8 dígitos'}/></Field>}
      <Field label="Contraseña" hint={register ? 'Usa al menos 10 caracteres.' : undefined}><input name="contrasena" type="password" autoComplete={register ? 'new-password' : 'current-password'} required minLength={register ? 10 : 1} maxLength={72}/></Field>
      {register && <>
        <Field label="Dirección o referencia" hint="Escríbela o usa el GPS para sugerir una localidad. BigDataCloud recibe tus coordenadas e IP para esa consulta; puedes corregir la sugerencia antes de guardar."><div className="input-with-action"><input name="direccion" autoComplete="street-address" maxLength={255} placeholder="Calle, distrito o referencia" required/><button type="button" className="secondary-button location-button" onClick={useCurrentLocation} disabled={locationBusy || !online}>{locationBusy ? 'Buscando…' : 'Usar mi ubicación'}</button></div></Field>
        {locationMessage && <p className="success-text" role="status">{locationMessage}</p>}
        {locationError && <ErrorBox message={locationError}/>}
        <Field label="Teléfono (opcional)" hint="No se muestra públicamente en los listados."><input name="telefono" type="tel" autoComplete="tel" maxLength={25}/></Field>
      </>}
      {!online && <ErrorBox message="Necesitas conexión para iniciar sesión o crear una cuenta."/>}
      <ErrorBox message={error}/>
      <div className="auth-actions"><button type="submit" className="record-button justify-center" disabled={busy || !online || (register && (!dniProof || !dniConsent))}>{busy ? 'Un momento…' : register ? 'Crear mi cuenta' : 'Entrar'}</button>
      {!register && <button type="button" className="text-action" onClick={() => { setLegacyLogin(!legacyLogin); setError(''); }}>{legacyLogin ? 'Entrar con DNI' : '¿Cuenta anterior? Entrar con correo'}</button>}
      <button type="button" className="text-action" onClick={() => { setRegister(!register); setLegacyLogin(false); setError(''); }}>{register ? 'Ya tengo una cuenta · Iniciar sesión' : '¿Aún no tienes cuenta? Regístrate'}</button></div>
    </form>
  </Modal>;
}
