import { useState, type FormEvent } from 'react';
import { useApp } from '../AppContext';
import { api, errorMessage, refreshData } from '../lib/api';
import { ErrorBox, Field, RemoteState, formatDate } from '../components/UI';
import Icon from '../components/Icon';
import { useRemote } from '../lib/hooks';
import type { Reputation, User } from '../types';
import { neighborRank } from '../lib/ranks';
import { useLanguage, type Language } from '../lib/language';
import PhoneField from '../components/PhoneField';

export default function Profile({ onLocation, onReviewHelp, onSignOut, signOutBusy, signOutError }: { onLocation: () => void; onReviewHelp: () => void; onSignOut: () => void; signOutBusy: boolean; signOutError?: string }) {
  const { user, setUser, online } = useApp();
  const { language, setLanguage, t } = useLanguage();
  const reputation = useRemote<Reputation>(user ? `/usuarios/${user.id}/reputacion` : null, user?.id || 'public');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [emailCode, setEmailCode] = useState('');
  const [emailCodeSent, setEmailCodeSent] = useState(false);
  if (!user) return <section className="profile-card max-w-2xl"><p className="eyebrow">TU CUENTA</p><h1 className="font-display mt-2 text-3xl font-bold">Mi perfil</h1><p className="mt-2">Inicia sesión para ver tu perfil, tus recomendaciones y tu actividad.</p></section>;

  async function updateProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget); setBusy(true); setError(''); setSuccess('');
    let profileSaved = false;
    let emailNeedsConfirmation = false;
    try {
      const correo = String(form.get('correo') || '').trim();
      const emailChanged = correo !== (user?.correo || '');
      emailNeedsConfirmation = emailChanged && Boolean(correo);
      const notificacionesCorreo = !emailChanged && form.get('notificacionesCorreo') === 'on';
      if (notificacionesCorreo && !correo) { setError('Añade un correo electrónico para activar los avisos.'); setBusy(false); return; }
      const updated = await api<User>('/auth/me', { method: 'PATCH', body: {
        correo: correo || null,
        notificacionesCorreo,
        telefono: String(form.get('telefono') || '').trim() || null,
        telefonoPublico: form.get('telefonoPublico') === 'on',
      } });
      profileSaved = true; setUser(updated); refreshData();
      if (emailNeedsConfirmation) { await api('/auth/email/verification', { method: 'POST', body: {} }); setEmailCodeSent(true); setSuccess('Perfil guardado. Te enviamos un código para confirmar el correo.'); }
      else setSuccess('Perfil actualizado.');
    } catch (cause) {
      setError(errorMessage(cause));
      if (profileSaved && emailNeedsConfirmation) setSuccess('Perfil guardado. La confirmación del correo sigue pendiente; podrás reenviar el código cuando se resuelva el problema de envío.');
    }
    finally { setBusy(false); }
  }

  async function sendEmailCode() {
    setBusy(true); setError('');
    try { await api('/auth/email/verification', { method: 'POST', body: {} }); setEmailCodeSent(true); setSuccess('Te enviamos un código de 6 dígitos. Revisa tu bandeja de entrada y spam.'); }
    catch (cause) { setError(errorMessage(cause)); } finally { setBusy(false); }
  }
  async function confirmEmail() {
    setBusy(true); setError('');
    try { const updated = await api<User>('/auth/email/verify', { method: 'POST', body: { codigo: emailCode } }); setUser(updated); setEmailCode(''); setEmailCodeSent(false); setSuccess('Correo confirmado. Ya puedes activar los avisos por correo.'); refreshData(); }
    catch (cause) { setError(errorMessage(cause)); } finally { setBusy(false); }
  }

  return <section className="grid gap-5 lg:grid-cols-[1fr_.9fr]">
    <article className="profile-card">
      <p className="eyebrow">TU CUENTA</p><h1 className="font-display mt-2 text-3xl font-bold">{user.nombres} {user.apellidos}</h1><p className="mt-2">{user.correo || 'Acceso con DNI'}</p>
      <div className="profile-location-card mt-5"><div className="profile-location-copy"><span className="eyebrow">MI UBICACIÓN PRIVADA</span><p>{user.direccion || 'Agrega una dirección o detecta tu ubicación con GPS.'}</p><small>Tu dirección exacta no se comparte con otros vecinos.</small></div><button type="button" className="outline-btn" onClick={onLocation}><Icon name="pin" size={16}/>{user.direccion ? 'Editar ubicación' : 'Configurar ubicación'}</button></div>
      <div className="mt-5"><Field label={t('language')}><select value={language} onChange={event => setLanguage(event.target.value as Language)}><option value="es">Español</option><option value="en">English</option><option value="qu">Quechua sureño</option></select></Field><p className="form-hint">{t('languageNote')}</p></div>
      <form className="form-stack mt-6" onSubmit={updateProfile}>
        <div className="form-columns profile-identity-fields"><Field label="Nombres"><input value={user.nombres} readOnly aria-readonly="true"/></Field><Field label="Apellidos"><input value={user.apellidos} readOnly aria-readonly="true"/></Field></div>
        <p className="profile-identity-note">Nombres y apellidos provienen del DNI verificado y no se pueden editar.</p>
        <div className="profile-email-section">
          <Field label="Correo electrónico (opcional)" hint="Confírmalo para demostrar que puedes recibir mensajes en esa dirección.">
            <input name="correo" type="email" autoComplete="email" maxLength={254} defaultValue={user.correo || ''} placeholder="tu@correo.com"/>
          </Field>
          {user.correo && <div className={`email-status ${user.correoVerificado ? 'is-verified' : 'is-pending'}`} role="status">
            <Icon name={user.correoVerificado ? 'check' : 'clock'} size={16}/>
            <span><b>{user.correoVerificado ? 'Correo confirmado' : 'Falta confirmar tu correo'}</b>{!user.correoVerificado && <small>Te enviaremos un código para comprobar que puedes recibir mensajes.</small>}</span>
          </div>}
          <label className="check-field email-notifications-option">
            <input name="notificacionesCorreo" type="checkbox" defaultChecked={Boolean(user.notificacionesCorreo)} disabled={!user.correoVerificado}/>
            <span><b>Recibir avisos por correo</b><small>Te avisaremos sobre tus pedidos y colaboraciones.</small></span>
          </label>
          {user.correo && !user.correoVerificado && <div className="email-verification-actions">
            {!emailCodeSent ? <button type="button" className="outline-btn email-send-code" disabled={!online || busy} onClick={() => void sendEmailCode()}>{busy ? 'Enviando…' : 'Enviar código de confirmación'}</button> : <>
              <div className="email-code-tip"><Icon name="shield" size={16}/><span>Revisa tu bandeja de entrada y spam. El código vence en 10 minutos.</span></div>
              <label className="email-code-field"><span>Código de confirmación</span><div className="email-code-controls">
                <input aria-label="Código de confirmación" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={emailCode} onChange={event => setEmailCode(event.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="6 dígitos" required/>
                <button type="button" className="small-primary" disabled={busy || emailCode.length !== 6} onClick={() => void confirmEmail()}>{busy ? 'Verificando…' : 'Confirmar'}</button>
              </div></label>
              <button type="button" className="email-resend-code" disabled={!online || busy} onClick={() => void sendEmailCode()}>{busy ? 'Enviando…' : 'No llegó el código · Reenviar'}</button>
            </>}
          </div>}
        </div>
        <PhoneField key={user.id} label="Celular para contacto (opcional)" defaultValue={user.telefono} hint="Se guardará con +51 para el enlace de WhatsApp."/>
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
        <div className="profile-review-action"><div><b>¿Recibiste ayuda de un vecino?</b><p>Cuéntale al barrio cómo fue y ayuda a otros a decidir.</p></div><button type="button" className="outline-btn" onClick={onReviewHelp}><Icon name="star" size={17}/>Comentar una ayuda recibida</button></div>
        {reputation.data.resenas.length === 0 ? <p className="profile-reviews-empty">Las opiniones sobre tus colaboraciones aparecerán aquí cuando tus vecinos confirmen las ayudas recibidas.</p> : <div className="profile-review-list">{reputation.data.resenas.map(review => <article className="profile-review-card" key={review.id}><div className="profile-review-meta"><b>{review.autor || 'Vecino'} · {review.calificacion}/5</b><small>{formatDate(review.creadoEn)}</small></div>{review.comentario && <p className="profile-review-comment">{review.comentario}</p>}<span className="profile-review-verified"><Icon name="shield" size={14}/>Ayuda confirmada dentro de AYNI</span>
          {review.miCalificacion != null ? <p className="profile-review-replied" role="status"><Icon name="check" size={14}/>Ya calificaste a este vecino · {review.miCalificacion}/5</p>
            : review.solicitudId && <button type="button" className="outline-btn profile-review-rate" onClick={() => { window.location.hash = `ayuda/${review.solicitudId}`; }}><Icon name="star" size={16}/>Calificar a {review.autor || 'este vecino'}</button>}
        </article>)}</div>}</>}
      <p className="form-hint mt-4"><Icon name="shield" size={15}/>Las recomendaciones corresponden a colaboraciones confirmadas. No verifican identidad ni certifican oficios.</p>
    </article>
  </section>;
}
