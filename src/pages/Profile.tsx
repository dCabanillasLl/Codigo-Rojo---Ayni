import { useState, type FormEvent } from 'react';
import { useApp } from '../AppContext';
import { api, errorMessage, refreshData } from '../lib/api';
import { ErrorBox, Field, RemoteState, formatDate } from '../components/UI';
import Icon from '../components/Icon';
import { useRemote } from '../lib/hooks';
import type { Reputation, User } from '../types';
import { neighborRank } from '../lib/ranks';
import { useLanguage, type Language } from '../lib/language';

export default function Profile({ onLocation, onSignOut, signOutBusy, signOutError }: { onLocation: () => void; onSignOut: () => void; signOutBusy: boolean; signOutError?: string }) {
  const { user, setUser, online } = useApp();
  const { language, setLanguage, t } = useLanguage();
  const reputation = useRemote<Reputation>(user ? `/usuarios/${user.id}/reputacion` : null, user?.id || 'public');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  if (!user) return <section className="profile-card max-w-2xl"><p className="eyebrow">TU CUENTA</p><h1 className="font-display mt-2 text-3xl font-bold">Mi perfil</h1><p className="mt-2">Inicia sesión para ver tu perfil, tus recomendaciones y tu actividad.</p></section>;

  async function updateProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget); setBusy(true); setError(''); setSuccess('');
    try {
      const updated = await api<User>('/auth/me', { method: 'PATCH', body: {
        nombres: String(form.get('nombres')).trim(), apellidos: String(form.get('apellidos')).trim(),
        telefono: String(form.get('telefono') || '').trim() || null,
        telefonoPublico: form.get('telefonoPublico') === 'on',
      } });
      setUser(updated); refreshData(); setSuccess('Perfil actualizado.');
    } catch (cause) { setError(errorMessage(cause)); }
    finally { setBusy(false); }
  }

  return <section className="grid gap-5 lg:grid-cols-[1fr_.9fr]">
    <article className="profile-card">
      <p className="eyebrow">TU CUENTA</p><h1 className="font-display mt-2 text-3xl font-bold">{user.nombres} {user.apellidos}</h1><p className="mt-2">{user.correo}</p>
      <div className="action-row mt-4"><span>{user.sectorNombre || 'Sector sin seleccionar'}</span><button type="button" className="text-action" onClick={onLocation}>Cambiar zona</button></div>
      <div className="mt-5"><Field label={t('language')}><select value={language} onChange={event => setLanguage(event.target.value as Language)}><option value="es">Español</option><option value="en">English</option><option value="qu">Quechua sureño</option></select></Field><p className="form-hint">{t('languageNote')}</p></div>
      <form className="form-stack mt-6" onSubmit={updateProfile}>
        <div className="form-columns"><Field label="Nombres"><input name="nombres" required minLength={2} maxLength={80} defaultValue={user.nombres}/></Field><Field label="Apellidos"><input name="apellidos" required minLength={2} maxLength={100} defaultValue={user.apellidos}/></Field></div>
        <Field label="Teléfono para contacto (opcional)" hint="Para el enlace de WhatsApp, usa prefijo internacional; ejemplo: +51987654321."><input name="telefono" type="tel" maxLength={25} defaultValue={user.telefono || ''} placeholder="+51987654321"/></Field>
        <label className="check-field"><input name="telefonoPublico" type="checkbox" defaultChecked={Boolean(user.telefonoPublico)}/>Permitir que contacten mi teléfono por WhatsApp desde mis publicaciones</label>
        <p className="form-hint">El teléfono se oculta por defecto. Si lo haces público, cualquier persona que vea una publicación tuya podrá abrir un chat de WhatsApp.</p>
        <ErrorBox message={error}/>{success && <p className="success-message" role="status">{success}</p>}
        <button type="submit" className="record-button justify-center" disabled={busy || !online}>{busy ? 'Guardando…' : 'Guardar perfil'}</button>
      </form>
      <ErrorBox message={signOutError}/><button type="button" className="outline-btn mt-5" onClick={onSignOut} disabled={signOutBusy || !online}>{signOutBusy ? 'Cerrando sesión…' : 'Cerrar sesión'}</button>
    </article>

    <article className="profile-card">
      <p className="eyebrow">VISTO BUENO VECINAL</p><h2 className="font-display mt-2 text-2xl font-bold">Ayudas confirmadas</h2>
      <RemoteState {...reputation}/>
      {reputation.data && <><div className="trust-card mt-4"><Icon name="star" size={21}/><div><b>Rango {neighborRank(reputation.data.colaboracionesConfirmadas).name}</b><p>Se obtiene por aportes completados y confirmados; no se puede asignar a uno mismo.</p></div></div><div className="mt-5 grid grid-cols-3 border-y border-[#e4e7e2] py-4"><div><b className="block text-xl">{reputation.data.colaboracionesConfirmadas}</b><span className="text-xs text-[#738078]">Ayudas completadas</span></div><div><b className="block text-xl">{reputation.data.vistosBuenos}</b><span className="text-xs text-[#738078]">Vistos buenos</span></div><div><b className="block text-xl">{reputation.data.promedio ?? '—'}</b><span className="text-xs text-[#738078]">Promedio</span></div></div>
        {reputation.data.resenas.length === 0 ? <p className="mt-4 text-sm text-[#65726b]">Las recomendaciones aparecerán cuando confirmes una ayuda recibida.</p> : <div className="mt-4 space-y-3">{reputation.data.resenas.map(review => <article className="contribution-card" key={review.id}><div className="action-row justify-between"><b>{review.autor || 'Vecino'} · {review.calificacion}/5</b><small>{formatDate(review.creadoEn)}</small></div>{review.comentario && <p className="mt-2">{review.comentario}</p>}<span className="form-hint">Ayuda confirmada dentro de AYNI</span></article>)}</div>}</>}
      <p className="form-hint mt-4"><Icon name="shield" size={15}/>Las recomendaciones corresponden a colaboraciones confirmadas. No verifican identidad ni certifican oficios.</p>
    </article>
  </section>;
}
