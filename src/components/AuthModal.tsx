import { useRef, useState, type FormEvent } from 'react';
import { useApp } from '../AppContext';
import { ApiError, api, errorMessage, refreshData } from '../lib/api';
import { Modal, Field, ErrorBox, RemoteState } from './UI';
import type { User } from '../types';

export default function AuthModal() {
  const { setAuthOpen, setUser, sectors, online, notify } = useApp();
  const [register, setRegister] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [dni, setDni] = useState('');
  const [dniConsent, setDniConsent] = useState(false);
  const [dniBusy, setDniBusy] = useState(false);
  const [dniProof, setDniProof] = useState('');
  const [dniMessage, setDniMessage] = useState('');
  const formRef = useRef<HTMLFormElement>(null);
  function explainError(value: unknown) {
    if (value instanceof ApiError && ['INVALID_ORIGIN', 'CORS_ORIGIN_REJECTED'].includes(value.code)) {
      return 'La dirección de AYNI no está autorizada por el servidor. Abre la app desde localhost:8444 o agrega la dirección actual a FRONTEND_ORIGIN en backend/.env y reinicia el backend.';
    }
    if (value instanceof ApiError && value.code === 'CLIENT_HEADER_REQUIRED') {
      return 'La app se cargó con una versión anterior. Recarga la página con Ctrl+F5 y vuelve a intentarlo.';
    }
    if (value instanceof ApiError && value.code === 'INVALID_CREDENTIALS') {
      return register ? 'No pudimos crear la cuenta con esos datos. Revisa tu correo y vuelve a intentarlo.' : 'No encontramos una cuenta con esos datos. Si aún no registraste tu DNI en AYNI, prueba con tu correo.';
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
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data = new FormData(event.currentTarget); setBusy(true); setError('');
    try {
      const body = register ? { nombres: data.get('nombres'), apellidos: data.get('apellidos'), correo: data.get('correo'), contrasena: data.get('contrasena'), sectorId: data.get('sectorId'), ...(dniProof ? { dni, consentimientoDni: true, dniProof } : {}), ...(data.get('telefono') ? { telefono: data.get('telefono') } : {}) } : { identificador: data.get('correo'), contrasena: data.get('contrasena') };
      const user = await api<User>(`/auth/${register ? 'register' : 'login'}`, { method: 'POST', body });
      setUser(user); refreshData(); setAuthOpen(false); notify(`Bienvenido${register ? ' a AYNI' : ' de vuelta'}, ${user.nombres}`);
    } catch (error) { setError(explainError(error)); } finally { setBusy(false); }
  }
  return <Modal title={register ? 'Únete a tu barrio' : 'Qué bueno verte'} onClose={() => setAuthOpen(false)}>
    <p className="form-intro">{register ? 'Crea tu cuenta para pedir ayuda y colaborar con tus vecinos.' : 'Entra para encontrar ayuda y conectar con tus vecinos.'}</p>
    <form ref={formRef} onSubmit={submit} className="form-stack auth-form">
      {register && <>
        <Field label="DNI (opcional)" hint="Consulta tus nombres para completar el registro más rápido."><div className="input-with-action"><input name="dni" inputMode="numeric" autoComplete="off" value={dni} onChange={event => { setDni(event.target.value.replace(/\D/g, '').slice(0, 8)); setDniProof(''); setDniMessage(''); }} placeholder="8 dígitos" maxLength={8}/><button type="button" className="secondary-button" disabled={dniBusy || dni.length !== 8 || !dniConsent || !online} onClick={lookupDni}>{dniBusy ? 'Consultando…' : 'Consultar'}</button></div></Field>
        <label className="consent-row"><input type="checkbox" checked={dniConsent} onChange={event => { setDniConsent(event.target.checked); setDniProof(''); }}/><span>Autorizo enviar mi DNI a API Perú para consultar mis nombres y apellidos.</span></label>
        {dniMessage && <p className="success-text" role="status">{dniMessage}</p>}
        <div className="form-columns"><Field label="Nombres" hint={dniProof ? 'Datos consultados; para corregirlos, borra el DNI y edítalos manualmente.' : undefined}><input name="nombres" autoComplete="given-name" required maxLength={80} readOnly={Boolean(dniProof)}/></Field><Field label="Apellidos"><input name="apellidos" autoComplete="family-name" required maxLength={100} readOnly={Boolean(dniProof)}/></Field></div>
      </>}
      <Field label={register ? 'Correo electrónico' : 'Correo o DNI'} hint={!register ? 'Usa el DNI solo si lo vinculaste al crear tu cuenta. Si no, ingresa tu correo.' : undefined}><input name="correo" type={register ? 'email' : 'text'} inputMode={register ? 'email' : 'text'} autoComplete={register ? 'email' : 'username'} required maxLength={254} placeholder={register ? 'tu@correo.com' : 'tu@correo.com o DNI'}/></Field>
      <Field label="Contraseña" hint={register ? 'Usa al menos 10 caracteres.' : undefined}><input name="contrasena" type="password" autoComplete={register ? 'new-password' : 'current-password'} required minLength={register ? 10 : 1} maxLength={72}/></Field>
      {register && <>
        <Field label="Tu sector"><select name="sectorId" required defaultValue=""><option value="" disabled>Elige dónde vives</option>{sectors.data?.map(sector => <option key={sector.id} value={sector.id}>{sector.nombre} · {sector.distrito}</option>)}</select></Field>
        <RemoteState {...sectors}/>
        <Field label="Teléfono (opcional)" hint="No se muestra públicamente en los listados."><input name="telefono" type="tel" autoComplete="tel" maxLength={25}/></Field>
      </>}
      {!online && <ErrorBox message="Necesitas conexión para iniciar sesión o crear una cuenta."/>}
      <ErrorBox message={error}/>
      <div className="auth-actions"><button type="submit" className="record-button justify-center" disabled={busy || !online || (register && !sectors.data?.length)}>{busy ? 'Un momento…' : register ? 'Crear mi cuenta' : 'Entrar'}</button>
      <button type="button" className="text-action" onClick={() => { setRegister(!register); setError(''); }}>{register ? 'Ya tengo una cuenta · Iniciar sesión' : '¿Aún no tienes cuenta? Regístrate'}</button></div>
    </form>
  </Modal>;
}
