import { useEffect, useId, useRef, useState, type ChangeEvent } from 'react';
import { apiAssetUrl } from '../lib/api';
import { ErrorBox } from './UI';
import Icon from './Icon';

export default function PhotoPicker({ value, currentUrl, onChange, onBusyChange, disabled = false, label = 'Foto del producto o servicio' }: {
  value: string | null | undefined; currentUrl?: string | null;
  onChange: (photo: string | null) => void; onBusyChange: (busy: boolean) => void; disabled?: boolean; label?: string;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const sequence = useRef(0);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState('');
  const preview = value === undefined ? currentUrl : value;
  useEffect(() => () => { sequence.current++; onBusyChange(false); }, [onBusyChange]);
  async function choose(event: ChangeEvent<HTMLInputElement>) {
    const field = event.currentTarget;
    const file = field.files?.[0]; if (!file) return;
    const operation = ++sequence.current;
    setError('');
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError('Elige una foto JPG, PNG o WebP.'); field.value = ''; return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('La foto debe pesar como máximo 5 MB.'); field.value = ''; return;
    }
    setReading(true); onBusyChange(true);
    try {
      const result = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('READ_FAILED'));
        reader.onerror = () => reject(new Error('READ_FAILED'));
        reader.onabort = () => reject(new Error('READ_ABORTED'));
        reader.readAsDataURL(file);
      });
      if (sequence.current === operation) onChange(result);
    } catch {
      if (sequence.current === operation) { setError('No pudimos leer la foto. Selecciona el archivo otra vez.'); field.value = ''; }
    } finally {
      if (sequence.current === operation) { setReading(false); onBusyChange(false); }
    }
  }
  return <div className="photo-picker">
    <label htmlFor={id} className="photo-picker-label">{label} <span>(opcional)</span></label>
    <p id={`${id}-hint`} className="form-hint">Puedes publicar sin foto. Aceptamos JPG, PNG y WebP de hasta 5 MB.</p>
    <input ref={input} id={id} type="file" accept="image/jpeg,image/png,image/webp" aria-describedby={`${id}-hint`} disabled={disabled || reading} onChange={event => void choose(event)}/>
    {reading && <p className="form-hint" role="status">Preparando vista previa…</p>}
    {preview && <div className="photo-preview"><img src={preview.startsWith('data:') ? preview : apiAssetUrl(preview)} crossOrigin={preview.startsWith('data:') ? undefined : 'use-credentials'} alt="Vista previa de la foto de tu publicación"/><button type="button" className="outline-btn" disabled={disabled || reading} onClick={() => { sequence.current++; onChange(null); setError(''); if (input.current) input.current.value = ''; }}><Icon name="close" size={16}/>Quitar foto</button></div>}
    <ErrorBox message={error}/>
  </div>;
}
