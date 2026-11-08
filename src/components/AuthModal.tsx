import { useState, type FormEvent } from 'react';
import { useApp } from '../AppContext';
import { ApiError, api, errorMessage, refreshData } from '../lib/api';
import { Modal, Field, ErrorBox } from './UI';
import type { LocationDraft, User } from '../types';
import RegistrationLocationDialog from './RegistrationLocationDialog';
import Icon from './Icon';
import AddressAutocomplete from './AddressAutocomplete';
import PasswordField from './PasswordField';
import PhoneField from './PhoneField';

export default function AuthModal() {
  const { setAuthOpen, setUser, online, notify } = useApp();
  const [register, setRegister] = useState(false);
  const [legacyLogin, setLegacyLogin] = useState(false);
  const [password, setPassword] = useState('');
  const [passwordConfirmation, setPasswordConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [dni, setDni] = useState('');
  const [dniConsent, setDniConsent] = useState(false);
  const [dniBusy, setDniBusy] = useState(false);
  const [dniProof, setDniProof] = useState('');
  const [dniMessage, setDniMessage] = useState('');
  const [dniLookupError, setDniLookupError] = useState('');
  const [dniNames, setDniNames] = useState('');
  const [dniSurnames, setDniSurnames] = useState('');
  const [location, setLocation] = useState<LocationDraft>({ coordinates: null, address: '' });
  const [locationOpen, setLocationOpen] = useState(false);
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
    setDniBusy(true); setError(''); setDniMessage(''); setDniLookupError(''); setDniProof(''); setDniNames(''); setDniSurnames('');
    try {
      const result = await api<{ nombres: string; apellidos: string; proof: string }>('/identity/dni/lookup', { method: 'POST', body: { dni, consentimiento: dniConsent } });
      setDniNames(result.nombres); setDniSurnames(result.apellidos);
      setDniProof(result.proof); setDniMessage('Datos encontrados. Verifica que correspondan con tu DNI.');
    } catch (lookupError) {
      if (lookupError instanceof ApiError && lookupError.code === 'DNI_NOT_FOUND') {
        setDniLookupError('No encontramos ese DNI. Verifica los 8 dígitos e inténtalo de nuevo.');
      } else setDniLookupError(errorMessage(lookupError));
    }
    finally { setDniBusy(false); }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || dniBusy || locationOpen) return;
    if (register && password !== passwordConfirmation) { setError('Las contraseñas no coinciden. Revisa la confirmación.'); return; }
    if (register && location.address.trim().length < 3) { setError('Escribe una dirección o referencia de al menos 3 caracteres.'); return; }
    const data = new FormData(event.currentTarget); setBusy(true); setError('');
    try {
      const body = register ? { nombres: data.get('nombres'), apellidos: data.get('apellidos'), contrasena: data.get('contrasena'), dni, consentimientoDni: true, dniProof, direccion: location.address.trim(), ...(location.coordinates ? { latitud: location.coordinates.latitude, longitud: location.coordinates.longitude } : {}), ...(data.get('telefono') ? { telefono: data.get('telefono') } : {}) } : legacyLogin ? { correo: data.get('correo'), contrasena: data.get('contrasena') } : { identificador: data.get('identificador'), contrasena: data.get('contrasena') };
      const user = await api<User>(`/auth/${register ? 'register' : 'login'}`, { method: 'POST', body });
      setUser(user); refreshData(); setAuthOpen(false); notify(`Bienvenido${register ? ' a AYNI' : ' de vuelta'}, ${user.nombres}`);
    } catch (error) { setError(explainError(error)); } finally { setBusy(false); }
  }
  return <><Modal title={register ? 'Únete a tu barrio' : 'Qué bueno verte'} onClose={() => setAuthOpen(false)}>
    <p className="form-intro">{register ? 'Crea tu cuenta para pedir ayuda y colaborar con tus vecinos.' : 'Entra para encontrar ayuda y conectar con tus vecinos.'}</p>
    <form onSubmit={submit} className={`form-stack auth-form ${register ? 'auth-registration-form' : ''}`}>
      {register && <>
        <Field label="DNI" hint="Lo usaremos para consultar tus nombres y crear tu acceso."><div className="input-with-action"><input name="dni" inputMode="numeric" autoComplete="off" value={dni} onChange={event => { setDni(event.target.value.replace(/\D/g, '').slice(0, 8)); setDniProof(''); setDniMessage(''); setDniLookupError(''); setDniNames(''); setDniSurnames(''); }} placeholder="Escribe los 8 dígitos" maxLength={8} required/><button type="button" className="secondary-button" disabled={dniBusy || dni.length !== 8 || !dniConsent || !online} onClick={lookupDni}>{dniBusy ? 'Consultando…' : 'Consultar'}</button></div></Field>
        {dniLookupError && <ErrorBox message={dniLookupError}/>}
        <label className="consent-row"><input type="checkbox" checked={dniConsent} onChange={event => { setDniConsent(event.target.checked); setDniProof(''); setDniMessage(''); setDniLookupError(''); setDniNames(''); setDniSurnames(''); }}/><span>Autorizo enviar mi DNI a API Perú para consultar mis nombres y apellidos.</span></label>
        {dniMessage && <p className="success-text" role="status">{dniMessage}</p>}
        <div className="form-columns dni-name-fields"><Field label="Nombres"><input name="nombres" value={dniNames} placeholder="Se cargarán al consultar el DNI" autoComplete="off" required maxLength={80} readOnly/></Field><Field label="Apellidos"><input name="apellidos" value={dniSurnames} placeholder="Se cargarán al consultar el DNI" autoComplete="off" required maxLength={100} readOnly/></Field></div>
        <p className="dni-fields-note">Los nombres y apellidos vienen de la consulta del DNI y no se pueden editar.</p>
      </>}
      {!register && <Field label={legacyLogin ? 'Correo de tu cuenta anterior' : 'DNI'}><input name={legacyLogin ? 'correo' : 'identificador'} type={legacyLogin ? 'email' : 'text'} inputMode={legacyLogin ? 'email' : 'numeric'} autoComplete="username" required minLength={legacyLogin ? undefined : 8} maxLength={legacyLogin ? 254 : 8} pattern={legacyLogin ? undefined : '[0-9]{8}'} placeholder={legacyLogin ? 'tu@correo.com' : 'Escribe los 8 dígitos'}/></Field>}
      <PasswordField key={register ? 'register-password' : 'login-password'} label="Contraseña" name="contrasena" value={password} onChange={setPassword} autoComplete={register ? 'new-password' : 'current-password'} minLength={register ? 10 : 1} hint={register ? 'Usa al menos 10 caracteres.' : undefined}/>
      {register && <PasswordField label="Confirmar contraseña" name="confirmarContrasena" value={passwordConfirmation} onChange={setPasswordConfirmation} autoComplete="new-password" minLength={10} confirmAgainst={password} hint="Vuelve a escribir tu contraseña."/>}
      {register && <>
        <div className="registration-location">
          <div className="registration-location-heading"><span className="registration-location-icon"><Icon name="pin" size={19}/></span><div><b>¿Dónde vives?</b><small>Para mostrarte apoyo y servicios cercanos</small></div></div>
          <AddressAutocomplete label="Tu dirección o una referencia" name="direccion" value={location.address} onChange={address => setLocation({ address, coordinates: null })} onSelect={place => setLocation({ address: place.nombre, coordinates: { latitude: place.latitud, longitude: place.longitud } })} bias={location.coordinates} online={online} disabled={busy} required showSearchButton={false}/>
          <div className="registration-location-actions"><button type="button" className="outline-btn registration-map-button" disabled={busy || dniBusy || !online} onClick={() => setLocationOpen(true)}><Icon name="pin" size={17}/>{location.coordinates ? 'Ajustar punto en el mapa' : 'Usar GPS o elegir en el mapa'}</button>{location.coordinates && <><span className="registration-location-selected" role="status"><Icon name="check" size={15}/>Ubicación precisa guardada</span><button type="button" className="text-action" disabled={busy} onClick={() => setLocation(current => ({ ...current, coordinates: null }))}>Quitar punto</button></>}</div>
          <p className="registration-location-privacy">Tu dirección y punto exacto son privados. Puedes corregirlos antes de crear tu cuenta.</p>
        </div>
        <PhoneField hint="No se muestra públicamente en los listados."/>
      </>}
      {!online && <ErrorBox message="Necesitas conexión para iniciar sesión o crear una cuenta."/>}
      <ErrorBox message={error}/>
      <div className="auth-actions"><button type="submit" className="record-button justify-center" disabled={busy || dniBusy || locationOpen || !online || (register && (!dniProof || !dniConsent))}>{busy ? 'Un momento…' : register ? 'Crear mi cuenta' : 'Entrar'}</button>
      {!register && <button type="button" className="text-action" onClick={() => { setLegacyLogin(!legacyLogin); setError(''); }}>{legacyLogin ? 'Entrar con DNI' : '¿Cuenta anterior? Entrar con correo'}</button>}
      <button type="button" className="text-action" onClick={() => { setRegister(!register); setLegacyLogin(false); setPassword(''); setPasswordConfirmation(''); setError(''); }}>{register ? 'Ya tengo una cuenta · Iniciar sesión' : '¿Aún no tienes cuenta? Regístrate'}</button></div>
    </form>
  </Modal>{locationOpen && <RegistrationLocationDialog value={location} online={online} onClose={() => setLocationOpen(false)} onConfirm={value => { setLocation(value); setLocationOpen(false); setError(''); }}/>}</>;
}
