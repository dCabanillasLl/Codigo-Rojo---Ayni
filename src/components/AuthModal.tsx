import { useState, type FormEvent } from 'react';
import { useApp } from '../AppContext';
import { api, errorMessage, refreshData } from '../lib/api';
import { Modal, Field, ErrorBox, RemoteState } from './UI';
import type { User } from '../types';

export default function AuthModal() {
  const { setAuthOpen, setUser, sectors, online, notify } = useApp();
  const [register, setRegister] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data = new FormData(event.currentTarget); setBusy(true); setError('');
    try {
      const body = register ? { nombres: data.get('nombres'), apellidos: data.get('apellidos'), correo: data.get('correo'), contrasena: data.get('contrasena'), sectorId: data.get('sectorId'), ...(data.get('telefono') ? { telefono: data.get('telefono') } : {}) } : { correo: data.get('correo'), contrasena: data.get('contrasena') };
      const user = await api<User>(`/auth/${register ? 'register' : 'login'}`, { method: 'POST', body });
      setUser(user); refreshData(); setAuthOpen(false); notify(`Bienvenido${register ? ' a AYNI' : ' de vuelta'}, ${user.nombres}`);
    } catch (error) { setError(errorMessage(error)); } finally { setBusy(false); }
  }
  return <Modal title={register ? 'Únete a tu barrio' : 'Qué bueno verte'} onClose={() => setAuthOpen(false)}>
    <p className="form-intro">Tu cuenta permite coordinar la ayuda y reconocer a quienes colaboran contigo.</p>
    <form onSubmit={submit} className="form-stack">
      {register && <div className="form-columns"><Field label="Nombres"><input name="nombres" autoComplete="given-name" required maxLength={80}/></Field><Field label="Apellidos"><input name="apellidos" autoComplete="family-name" required maxLength={100}/></Field></div>}
      <Field label="Correo electrónico"><input name="correo" type="email" autoComplete="email" required maxLength={254}/></Field>
      <Field label="Contraseña" hint={register ? 'Usa al menos 10 caracteres.' : undefined}><input name="contrasena" type="password" autoComplete={register ? 'new-password' : 'current-password'} required minLength={register ? 10 : 1} maxLength={72}/></Field>
      {register && <>
        <Field label="Tu sector"><select name="sectorId" required defaultValue=""><option value="" disabled>Elige dónde vives</option>{sectors.data?.map(sector => <option key={sector.id} value={sector.id}>{sector.nombre} · {sector.distrito}</option>)}</select></Field>
        <RemoteState {...sectors}/>
        <Field label="Teléfono (opcional)" hint="No se muestra públicamente en los listados."><input name="telefono" type="tel" autoComplete="tel" maxLength={25}/></Field>
      </>}
      {!online && <ErrorBox message="Necesitas conexión para iniciar sesión o crear una cuenta."/>}
      <ErrorBox message={error}/>
      <button type="submit" className="record-button justify-center" disabled={busy || !online || (register && !sectors.data?.length)}>{busy ? 'Un momento…' : register ? 'Crear mi cuenta' : 'Entrar a AYNI'}</button>
      <button type="button" className="text-action" onClick={() => { setRegister(!register); setError(''); }}>{register ? 'Ya tengo una cuenta' : 'Soy nuevo, quiero registrarme'}</button>
    </form>
  </Modal>;
}
