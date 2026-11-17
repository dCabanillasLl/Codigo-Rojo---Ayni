import { useState, type FormEvent } from 'react';
import { useApp } from '../AppContext';
import { api, errorMessage, refreshData } from '../lib/api';
import { ErrorBox, Field, Modal, RemoteState, formatDate } from '../components/UI';
import Icon from '../components/Icon';
import { useRemote } from '../lib/hooks';
import type { Reputation, User } from '../types';
import { neighborRank } from '../lib/ranks';
import { useLanguage, type Language } from '../lib/language';
import PhoneField from '../components/PhoneField';
import NeighborRankIcon from '../components/NeighborRankIcon';
import PhotoPicker from '../components/PhotoPicker';

export default function Profile({ onLocation, onReviewHelp, onSignOut, signOutBusy, signOutError }: { onLocation: () => void; onReviewHelp: () => void; onSignOut: () => void; signOutBusy: boolean; signOutError?: string }) {
  const { user, setUser, online, notify, setAuthOpen } = useApp();
  const { language, setLanguage, t } = useLanguage();
  const reputation = useRemote<Reputation>(user ? `/usuarios/${user.id}/reputacion` : null, user?.id || 'public');
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [emailTipDismissed, setEmailTipDismissed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [emailCode, setEmailCode] = useState('');
  const [emailCodeSent, setEmailCodeSent] = useState(false);
  const [profilePhoto, setProfilePhoto] = useState<string | null | undefined>(undefined);
  const [profilePhotoBusy, setProfilePhotoBusy] = useState(false);
  const rank = reputation.data ? neighborRank(reputation.data.colaboracionesConfirmadas) : null;
  const rankLabel = rank ? t(rank.name === 'Semilla' ? 'rankSeed' : rank.name === 'Tejedor' ? 'rankWeaver' : rank.name === 'Ayni' ? 'rankAyni' : 'rankReference') : '';
  if (!user) return <section className="profile-card max-w-2xl"><p className="eyebrow">{t('account')}</p><h1 className="font-display mt-2 text-3xl font-bold">{t('myProfile')}</h1><p className="mt-2">{t('profileLoginPrompt')}</p></section>;

  async function updateProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget); setBusy(true); setError(''); setSuccess('');
    let profileSaved = false;
    let emailNeedsConfirmation = false;
    try {
      const correo = String(form.get('correo') || '').trim();
      const emailChanged = correo !== (user?.correo || '');
      emailNeedsConfirmation = emailChanged && Boolean(correo);
      const notificacionesCorreo = !emailChanged && form.get('notificacionesCorreo') === 'on';
      if (notificacionesCorreo && !correo) { setError(language === 'qu' ? 'Correo willayta churay, correo willaykunata chaskinaykipaq.' : 'Añade un correo electrónico para activar los avisos.'); setBusy(false); return; }
      const updated = await api<User>('/auth/me', { method: 'PATCH', body: {
        correo: correo || null,
        notificacionesCorreo,
        telefono: String(form.get('telefono') || '').trim() || null,
        telefonoPublico: form.get('telefonoPublico') === 'on',
        ...(profilePhoto !== undefined ? { fotoPerfil: profilePhoto } : {}),
      } });
      profileSaved = true; setUser(updated); setProfilePhoto(undefined); refreshData();
      if (emailNeedsConfirmation) { await api('/auth/email/verification', { method: 'POST', body: {} }); setEmailCodeSent(true); setSuccess(language === 'qu' ? 'Perfil waqaychasqam. Correo takyachinapaq yupayta apachirqayku.' : 'Perfil guardado. Te enviamos un código para confirmar el correo.'); }
      else setSuccess(language === 'qu' ? 'Perfil tikrasqa.' : 'Perfil actualizado.');
    } catch (cause) {
      setError(errorMessage(cause));
      if (profileSaved && emailNeedsConfirmation) setSuccess(language === 'qu' ? 'Perfil waqaychasqam. Correo takyachiyqa suyasqallaraqmi; apachiy allin kaqtin kutichiyta mañakuy.' : 'Perfil guardado. La confirmación del correo sigue pendiente; podrás reenviar el código cuando se resuelva el problema de envío.');
    }
    finally { setBusy(false); }
  }

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const element = event.currentTarget;
    const form = new FormData(element);
    const actual = String(form.get('actual') || '');
    const nueva = String(form.get('nueva') || '');
    const confirmacion = String(form.get('confirmacion') || '');
    setPasswordError('');
    if (nueva !== confirmacion) { setPasswordError(language === 'qu' ? 'Musuq contraseña nisqakunaqa manam kaqllachu.' : 'Las contraseñas nuevas no coinciden.'); return; }
    if (actual === nueva) { setPasswordError(language === 'qu' ? 'Kunan contraseña nisqamanta hukta akllay.' : 'Elige una contraseña diferente de la actual.'); return; }
    if (new TextEncoder().encode(nueva).length > 72) { setPasswordError(language === 'qu' ? 'Contraseña nisqaqa ancha hatunmi. Aswanqa 72 bytes nisqa kasqa.' : 'La contraseña es demasiado larga. Usa como máximo 72 bytes.'); return; }
    setPasswordBusy(true);
    try {
      await api('/auth/password', { method: 'POST', expectedUserId: user!.id, body: { actual, nueva, confirmacion } });
      element.reset();
      setUser(null);
      notify(language === 'qu' ? 'Contraseña tikrasqa. Musuq contraseña nisqawan yaykuy.' : 'Contraseña actualizada. Inicia sesión con tu nueva contraseña.');
      setAuthOpen(true);
    } catch (cause) { setPasswordError(errorMessage(cause)); }
    finally { setPasswordBusy(false); }
  }

  async function sendEmailCode() {
    setBusy(true); setError('');
    try { await api('/auth/email/verification', { method: 'POST', body: {} }); setEmailCodeSent(true); setSuccess(language === 'qu' ? 'Suqta yupayniyuq takyachina yupayta apachirqayku. Correo chaskinaykipi qhaway.' : 'Te enviamos un código de 6 dígitos. Revisa tu bandeja de entrada y spam.'); }
    catch (cause) { setError(errorMessage(cause)); } finally { setBusy(false); }
  }
  async function confirmEmail() {
    setBusy(true); setError('');
    try { const updated = await api<User>('/auth/email/verify', { method: 'POST', body: { codigo: emailCode } }); setUser(updated); setEmailCode(''); setEmailCodeSent(false); setSuccess(language === 'qu' ? 'Correo takyachisqa. Kunanqa correo willaykunata chaskiyta atinki.' : 'Correo confirmado. Ya puedes activar los avisos por correo.'); refreshData(); }
    catch (cause) { setError(errorMessage(cause)); } finally { setBusy(false); }
  }

  return <section className="profile-page">
    <article className="profile-card">
      <p className="eyebrow">{t('account')}</p><h1 className="profile-title font-display mt-2 font-bold">{user.nombres} {user.apellidos}</h1><p className="profile-account-email mt-2">{user.correo || t('accessDni')}</p>
      <div className="profile-photo-section"><PhotoPicker value={profilePhoto} currentUrl={user.fotoPerfilUrl} onChange={setProfilePhoto} onBusyChange={setProfilePhotoBusy} disabled={busy || !online} label={t('profilePhoto')} variant="avatar"/></div>
      <div className="profile-location-card mt-5"><div className="profile-location-copy"><span className="eyebrow">{t('privateLocation')}</span><p>{user.direccion || t('addLocation')}</p><small>{t('exactLocationPrivate')}</small></div><button type="button" className="outline-btn" onClick={onLocation}><Icon name="pin" size={16}/>{user.direccion ? t('editLocation') : t('setLocation')}</button></div>
      <div className="mt-5"><Field label={t('language')}><select value={language} onChange={event => setLanguage(event.target.value as Language)}><option value="es">{t('spanish')}</option><option value="en">English</option><option value="qu">{t('southernQuechua')}</option></select></Field><p className="form-hint">{t('languageNote')}</p></div>
      <form className="form-stack mt-6" onSubmit={updateProfile}>
        <div className="form-columns profile-identity-fields"><Field label={t('firstNames')}><input value={user.nombres} readOnly aria-readonly="true"/></Field><Field label={t('lastNames')}><input value={user.apellidos} readOnly aria-readonly="true"/></Field></div>
        <p className="profile-identity-note">{t('identityNote')}</p>
        <div className="profile-email-section">
          {!user.correoVerificado && !emailTipDismissed && <aside className="email-code-tip">
            <div><b>{t('emailTipTitle')}</b><p>{t('emailTipText')}</p><button type="button" className="email-resend-code" onClick={() => setEmailTipDismissed(true)}>{t('notNow')}</button></div>
          </aside>}
          <Field label={t('emailOptional')} hint={t('emailHint')}>
            <input name="correo" type="email" autoComplete="email" maxLength={254} defaultValue={user.correo || ''} placeholder="tu@correo.com"/>
          </Field>
          {user.correo && <div className={`email-status ${user.correoVerificado ? 'is-verified' : 'is-pending'}`} role="status">
            <Icon name={user.correoVerificado ? 'check' : 'clock'} size={16}/>
            <span><b>{user.correoVerificado ? t('emailVerified') : t('emailNotVerified')}</b>{!user.correoVerificado && <small>{t('emailVerificationHint')}</small>}</span>
          </div>}
          <label className="check-field email-notifications-option">
            <input name="notificacionesCorreo" type="checkbox" defaultChecked={Boolean(user.notificacionesCorreo)} disabled={!user.correoVerificado}/>
            <span><b>{t('emailNotifications')}</b><small>{t('emailNotificationsHint')}</small></span>
          </label>
          {user.correo && !user.correoVerificado && <div className="email-verification-actions">
            {!emailCodeSent ? <button type="button" className="outline-btn email-send-code" disabled={!online || busy} onClick={() => void sendEmailCode()}>{busy ? t('sending') : t('sendCode')}</button> : <>
              <div className="email-code-tip"><Icon name="shield" size={16}/><span>{t('checkInbox')}</span></div>
              <label className="email-code-field"><span>{t('verificationCode')}</span><div className="email-code-controls">
                <input aria-label={t('verificationCode')} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={emailCode} onChange={event => setEmailCode(event.target.value.replace(/\D/g, '').slice(0, 6))} placeholder={t('digits')} required/>
                <button type="button" className="small-primary" disabled={busy || emailCode.length !== 6} onClick={() => void confirmEmail()}>{busy ? t('checking') : t('confirm')}</button>
              </div></label>
              <button type="button" className="email-resend-code" disabled={!online || busy} onClick={() => void sendEmailCode()}>{busy ? t('sending') : t('resendCode')}</button>
            </>}
          </div>}
        </div>
        <PhoneField key={user.id} label={t('contactPhone')} defaultValue={user.telefono} hint={t('phoneHint')}/>
        <label className="check-field"><input name="telefonoPublico" type="checkbox" defaultChecked={Boolean(user.telefonoPublico)}/>{t('publicPhoneConsent')}</label>
        <p className="form-hint">{t('phonePrivacy')}</p>
        <ErrorBox message={error}/>{success && <p className="success-message" role="status">{success}</p>}
        <button type="submit" className="record-button profile-save-button justify-center" disabled={busy || profilePhotoBusy || !online}>{busy ? t('saving') : profilePhotoBusy ? t('preparingPhoto') : t('save')}</button>
      </form>
      <ErrorBox message={signOutError}/><button type="button" className="outline-btn profile-signout-button mt-5" onClick={onSignOut} disabled={signOutBusy || !online}>{signOutBusy ? t('signingOut') : t('signOut')}</button>
    </article>

    <div className="grid content-start gap-5">
    <article className="profile-card neighbor-reputation-panel" aria-labelledby="neighbor-reputation-title">
      <header className="neighbor-reputation-heading">
        <p className="eyebrow">{t('reputationEyebrow')}</p>
        <h2 id="neighbor-reputation-title" className="font-display">{t('confirmedHelp')}</h2>
      </header>
      <RemoteState {...reputation}/>
      {reputation.data && rank && <>
        <div className="neighbor-rank-summary" data-rank={rank.name}>
          <div className="neighbor-rank-heading"><NeighborRankIcon rank={rank.name}/><h3 className="font-display">{t('rank')} {rankLabel}</h3></div>
          <p>{t('rankRule')}</p>
        </div>
        <dl className="neighbor-reputation-stats">
          <div className="neighbor-reputation-stat"><dt>{t('completedHelp')}</dt><dd><span>{reputation.data.colaboracionesConfirmadas}</span><span className="neighbor-stat-icon"><Icon name="hand" size={22}/></span></dd></div>
          <div className="neighbor-reputation-stat"><dt>{t('endorsements')}</dt><dd><span>{reputation.data.vistosBuenos}</span><span className="neighbor-stat-icon"><Icon name="thumbsUp" size={22}/></span></dd></div>
          <div className="neighbor-reputation-stat"><dt>{t('average')}</dt><dd><span>{reputation.data.promedio ?? '—'}</span><span className="neighbor-stat-icon"><Icon name="star" size={21}/></span></dd></div>
        </dl>
        <div className="neighbor-review-action">
          <div><b>{t('receivedHelp')}</b><p>{t('receivedHelpHint')}</p></div>
          <button type="button" className="neighbor-review-button" onClick={onReviewHelp}><Icon name="star" size={20}/><span>{t('reviewHelp')}</span></button>
        </div>
        {reputation.data.resenas.length === 0 ? <p className="profile-reviews-empty">{t('noReviews')}</p> : <div className="profile-review-list">{reputation.data.resenas.map(review => <article className="profile-review-card" key={review.id}><div className="profile-review-meta"><b>{review.autor || 'Vecino'} · {review.calificacion}/5</b><small>{formatDate(review.creadoEn)}</small></div>{review.comentario && <p className="profile-review-comment">{review.comentario}</p>}<span className="profile-review-verified"><Icon name="shield" size={14}/>{t('verifiedHelp')}</span>
          {review.miCalificacion != null ? <p className="profile-review-replied" role="status"><Icon name="check" size={14}/>{t('alreadyRated')} · {review.miCalificacion}/5</p>
            : review.solicitudId && <button type="button" className="outline-btn profile-review-rate" onClick={() => { window.location.hash = `ayuda/${review.solicitudId}`; }}><Icon name="star" size={16}/>{t('rateNeighbor')}</button>}
        </article>)}</div>}</>}
      <p className="neighbor-reputation-note"><Icon name="shield" size={16}/><span>{t('recommendationNote')}</span></p>
    </article>
      <article className="profile-card account-security-card" aria-labelledby="account-security-title">
        <div className="account-security-heading"><span className="account-security-icon"><Icon name="shield" size={24}/></span><div><p className="eyebrow">{t('careAccount')}</p><h2 id="account-security-title" className="font-display">{t('security')}</h2></div></div>
        <p>{t('securityText')}</p>
        <button type="button" className="outline-btn" onClick={() => { setPasswordError(''); setPasswordOpen(true); }}>{t('changePassword')}</button>
        <small>{user.correoVerificado ? t('emailRecoveryVerified') : t('emailRecoveryUnverified')}</small>
      </article>
    </div>
    {passwordOpen && <Modal title={t('changePassword')} onClose={() => { if (!passwordBusy) setPasswordOpen(false); }}>
        <form className="form-stack mt-5" onSubmit={changePassword}>
          <p className="form-hint">{t('passwordChangeHint')}</p>
          <Field label={t('currentPassword')}><input name="actual" type="password" autoComplete="current-password" required maxLength={200}/></Field>
          <Field label={t('newPassword')} hint={t('passwordMin')}><input name="nueva" type="password" autoComplete="new-password" required minLength={8} maxLength={72}/></Field>
          <Field label={t('confirmNewPassword')}><input name="confirmacion" type="password" autoComplete="new-password" required minLength={8} maxLength={72}/></Field>
          <ErrorBox message={passwordError}/>
          <button type="submit" className="record-button justify-center" disabled={passwordBusy || busy || signOutBusy || !online}>{passwordBusy ? t('changingPassword') : t('saveNewPassword')}</button>
        </form>
    </Modal>}
  </section>;
}
