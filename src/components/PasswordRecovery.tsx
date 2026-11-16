import { useEffect, useState, type FormEvent } from 'react';
import { api, errorMessage } from '../lib/api';
import { ErrorBox, Field } from './UI';
import PasswordField from './PasswordField';

export default function PasswordRecovery({ online, onBack, onComplete }: { online: boolean; onBack: () => void; onComplete: () => void }) {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [resendAt, setResendAt] = useState(0);
  const [now, setNow] = useState(Date.now());
  const cooldown = Math.max(0, Math.ceil((resendAt - now) / 1000));
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(timer); }, []);
  async function sendCode(event?: FormEvent) {
    event?.preventDefault();
    if (busy || cooldown) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const result = await api<{ mensaje: string }>('/auth/password/recovery', { method: 'POST', timeoutMs: 45000, body: { correo: email.trim() } });
      setSent(true); setCode(''); setMessage(result.mensaje); setNow(Date.now()); setResendAt(Date.now() + 60000);
    } catch (cause) { setError(errorMessage(cause)); } finally { setBusy(false); }
  }
  async function reset(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setError('');
    if (password !== confirmation) { setError('Las contraseñas nuevas no coinciden.'); return; }
    if (new TextEncoder().encode(password).length > 72) { setError('La contraseña es demasiado larga. Usa como máximo 72 bytes.'); return; }
    setBusy(true);
    try { await api('/auth/password/reset', { method: 'POST', body: { correo: email.trim(), codigo: code, nueva: password, confirmacion: confirmation } }); onComplete(); }
    catch (cause) { setError(errorMessage(cause)); } finally { setBusy(false); }
  }
  return <div className="form-stack">
    <p className="form-intro">{sent ? `Ingresa el código enviado a ${email} y elige una nueva contraseña.` : 'Escribe el correo que añadiste y confirmaste en tu perfil. Te enviaremos un código para recuperar el acceso.'}</p>
    {!sent ? <form className="form-stack" onSubmit={sendCode}>
      <Field label="Correo de recuperación"><input type="email" autoComplete="email" required maxLength={254} value={email} onChange={event => setEmail(event.target.value)}/></Field>
      <p className="form-hint">El correo es opcional en AYNI. Si no añadiste y confirmaste uno antes, esta opción no podrá recuperar tu cuenta.</p>
      <ErrorBox message={error}/>
      <button className="record-button justify-center" disabled={busy || !online}>{busy ? 'Enviando…' : 'Enviar código'}</button>
    </form> : <form className="form-stack" onSubmit={reset}>
      {message && <p className="success-message" role="status">{message}</p>}
      <Field label="Código de recuperación" hint="6 dígitos. Vence en 10 minutos y admite hasta 5 intentos."><input inputMode="numeric" autoComplete="one-time-code" required pattern="[0-9]{6}" maxLength={6} value={code} onChange={event => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}/></Field>
      <PasswordField label="Nueva contraseña" name="nueva" value={password} onChange={setPassword} autoComplete="new-password" minLength={8} hint="Usa al menos 8 caracteres."/>
      <PasswordField label="Confirmar nueva contraseña" name="confirmacion" value={confirmation} onChange={setConfirmation} autoComplete="new-password" minLength={8} confirmAgainst={password}/>
      <ErrorBox message={error}/>
      <button className="record-button justify-center" disabled={busy || !online}>{busy ? 'Guardando…' : 'Guardar nueva contraseña'}</button>
      <button type="button" className="text-action" disabled={busy || !online || cooldown > 0} onClick={() => void sendCode()}>{cooldown ? `Reenviar código en ${cooldown} s` : 'Reenviar código'}</button>
      <button type="button" className="text-action" disabled={busy} onClick={() => { setSent(false); setCode(''); setPassword(''); setConfirmation(''); setError(''); setMessage(''); setResendAt(0); }}>Usar otro correo</button>
    </form>}
    <button type="button" className="text-action" disabled={busy} onClick={onBack}>Volver a iniciar sesión</button>
  </div>;
}
