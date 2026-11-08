import { useId, useState } from 'react';

// Accept a pasted international number without duplicating the fixed +51 prefix.
function nationalDigits(value: string) {
  const digits = value.replace(/\D/g, '');
  return digits.length === 11 && digits.startsWith('51') ? digits.slice(2) : digits;
}

export default function PhoneField({ defaultValue, label = 'Celular (opcional)', hint }: { defaultValue?: string | null; label?: string; hint?: string }) {
  const id = useId();
  const [number, setNumber] = useState(() => nationalDigits(defaultValue || ''));
  const [inputNotice, setInputNotice] = useState('');
  function updateNumber(value: string) {
    const next = nationalDigits(value);
    if (next && !next.startsWith('9')) {
      setInputNotice('El celular debe empezar con 9.');
      return;
    }
    setInputNotice('');
    setNumber(next);
  }
  return <div className="form-field">
    <label htmlFor={id}>{label}</label>
    <div className="phone-control">
      <span className="phone-prefix" aria-hidden="true">+51</span>
      <input id={id} name="telefonoNacional" type="tel" inputMode="numeric" autoComplete="tel-national" value={number} onChange={event => updateNumber(event.target.value)} onPaste={event => {
        const pasted = event.clipboardData.getData('text');
        if (!pasted) return;
        event.preventDefault();
        const input = event.currentTarget;
        const replacement = number.slice(0, input.selectionStart ?? 0) + pasted + number.slice(input.selectionEnd ?? number.length);
        updateNumber(replacement);
      }} maxLength={9} pattern="9[0-9]{8}" title="Ingresa un celular peruano de 9 dígitos que empiece con 9." placeholder="987654321" aria-describedby={`${id}-hint${inputNotice ? ` ${id}-notice` : ''}`} aria-label={`${label}, Perú +51`}/>
    </div>
    <input type="hidden" name="telefono" value={number ? `+51${number}` : ''}/>
    {inputNotice && <small id={`${id}-notice`} className="field-validation-error" role="status">{inputNotice}</small>}
    <small id={`${id}-hint`}>Perú (+51). Ingresa 9 dígitos que empiecen con 9.{hint ? ` ${hint}` : ''}</small>
  </div>;
}
