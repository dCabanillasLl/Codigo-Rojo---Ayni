import { useEffect, useId, useRef, useState } from 'react';
import Icon from './Icon';

type Props = {
  label: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: 'new-password' | 'current-password';
  minLength?: number;
  hint?: string;
  confirmAgainst?: string;
};

export default function PasswordField({ label, name, value, onChange, autoComplete, minLength = 1, hint, confirmAgainst }: Props) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [visible, setVisible] = useState(false);
  const mismatch = confirmAgainst !== undefined && value !== confirmAgainst;
  const message = mismatch && value ? 'Las contraseñas no coinciden.' : hint;
  useEffect(() => {
    input.current?.setCustomValidity(mismatch ? 'Las contraseñas no coinciden.' : '');
  }, [mismatch]);

  return <div className="form-field">
    <label htmlFor={id}>{label}</label>
    <div className="password-control">
      <input ref={input} id={id} name={name} type={visible ? 'text' : 'password'} value={value} onChange={event => onChange(event.target.value)} autoComplete={autoComplete} required minLength={minLength} maxLength={72} aria-invalid={mismatch && Boolean(value) ? true : undefined} aria-describedby={message ? `${id}-hint` : undefined}/>
      <button type="button" className="password-toggle" aria-label={`${visible ? 'Ocultar' : 'Mostrar'} ${label.toLowerCase()}`} aria-controls={id} aria-pressed={visible} onClick={() => setVisible(current => !current)}><Icon name={visible ? 'eyeOff' : 'eye'} size={21}/></button>
    </div>
    {message && <small id={`${id}-hint`} className={mismatch && value ? 'field-validation-error' : undefined} aria-live="polite">{message}</small>}
  </div>;
}
