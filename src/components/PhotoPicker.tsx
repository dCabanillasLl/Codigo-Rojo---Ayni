import { useEffect, useId, useRef, useState, type ChangeEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { apiAssetUrl } from '../lib/api';
import { ErrorBox } from './UI';
import Icon from './Icon';
import { Modal } from './UI';
import { useLanguage } from '../lib/language';

const CROP_SIZE = 300;
const OUTPUT_SIZE = 512;
type CropOffset = { x: number; y: number };
function clampCropOffset(offset: CropOffset, width: number, height: number, zoom: number, size: number): CropOffset {
  const scale = Math.max(size / width, size / height) * zoom;
  return { x: Math.max(-(width * scale - size) / 2, Math.min((width * scale - size) / 2, offset.x)), y: Math.max(-(height * scale - size) / 2, Math.min((height * scale - size) / 2, offset.y)) };
}

export default function PhotoPicker({ value, currentUrl, onChange, onBusyChange, disabled = false, label = 'Foto del producto o servicio', variant = 'default' }: {
  value: string | null | undefined; currentUrl?: string | null;
  onChange: (photo: string | null) => void; onBusyChange: (busy: boolean) => void; disabled?: boolean; label?: string; variant?: 'default' | 'avatar';
}) {
  const { language } = useLanguage();
  const quechua = language === 'qu';
  const maxInputMegabytes = variant === 'avatar' ? 10 : 5;
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const sequence = useRef(0);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState('');
  const [cropSource, setCropSource] = useState<string | null>(null);
  const [cropZoom, setCropZoom] = useState(1);
  const [cropSize, setCropSize] = useState(CROP_SIZE);
  const [cropOffset, setCropOffset] = useState<CropOffset>({ x: 0, y: 0 });
  const [cropDimensions, setCropDimensions] = useState<{ width: number; height: number } | null>(null);
  const [viewerOpen, setViewerOpen] = useState(false);
  const cropImage = useRef<HTMLImageElement>(null);
  const cropStage = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; offset: CropOffset } | null>(null);
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
    if (file.size > maxInputMegabytes * 1024 * 1024) {
      setError(`La foto debe pesar como máximo ${maxInputMegabytes} MB.`); field.value = ''; return;
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
      if (sequence.current === operation) {
        if (variant === 'avatar') { setCropSource(result); setCropZoom(1); setCropOffset({ x: 0, y: 0 }); setCropDimensions(null); }
        else onChange(result);
      }
    } catch {
      if (sequence.current === operation) { setError('No pudimos leer la foto. Selecciona el archivo otra vez.'); field.value = ''; }
    } finally {
      if (sequence.current === operation) { setReading(false); onBusyChange(false); }
    }
  }
  function moveCrop(event: ReactPointerEvent<HTMLDivElement>) {
    if (!drag.current || !cropDimensions) return;
    const next = { x: drag.current.offset.x + event.clientX - drag.current.x, y: drag.current.offset.y + event.clientY - drag.current.y };
    setCropOffset(clampCropOffset(next, cropDimensions.width, cropDimensions.height, cropZoom, cropSize));
  }
  function finishCrop() {
    drag.current = null;
  }
  function updateZoom(value: number) {
    setCropZoom(value);
    if (cropDimensions) setCropOffset(offset => clampCropOffset(offset, cropDimensions.width, cropDimensions.height, value, cropSize));
  }
  function applyCrop() {
    const image = cropImage.current;
    if (!image || !cropDimensions) return;
    const canvas = document.createElement('canvas'); canvas.width = OUTPUT_SIZE; canvas.height = OUTPUT_SIZE;
    const context = canvas.getContext('2d'); if (!context) { setError('No pudimos preparar el recorte. Inténtalo otra vez.'); setCropSource(null); return; }
    const scale = Math.max(cropSize / cropDimensions.width, cropSize / cropDimensions.height) * cropZoom;
    context.scale(OUTPUT_SIZE / cropSize, OUTPUT_SIZE / cropSize);
    context.drawImage(image, (cropSize - cropDimensions.width * scale) / 2 + cropOffset.x, (cropSize - cropDimensions.height * scale) / 2 + cropOffset.y, cropDimensions.width * scale, cropDimensions.height * scale);
    onChange(canvas.toDataURL('image/jpeg', 0.9)); setCropSource(null);
  }
  function removePhoto() {
    sequence.current++; onChange(null); setError(''); setViewerOpen(false); setCropSource(null);
    if (input.current) input.current.value = '';
  }
  const previewUrl = preview ? (preview.startsWith('data:') ? preview : apiAssetUrl(preview)) : null;
  return <div className={`photo-picker ${variant === 'avatar' ? 'photo-picker-avatar' : ''}`}>
    {variant === 'avatar' ? <div className="photo-picker-avatar-layout">
      <input ref={input} id={id} type="file" accept="image/jpeg,image/png,image/webp" aria-describedby={`${id}-hint`} disabled={disabled || reading} onChange={event => void choose(event)}/>
      <span className="photo-picker-avatar-control">
        <button type="button" className="photo-picker-avatar-button" aria-label={preview ? (quechua ? 'Perfil siq’ita hatun rikuy' : 'Ver foto de perfil en grande') : (quechua ? 'Perfil siq’ita akllay' : 'Elegir foto de perfil')} disabled={reading || (!preview && disabled)} onClick={() => preview ? setViewerOpen(true) : input.current?.click()}>
          <span className="photo-picker-avatar-image">{previewUrl ? <img src={previewUrl} crossOrigin={preview?.startsWith('data:') ? undefined : 'use-credentials'} alt=""/> : <Icon name="user" size={32}/>}</span>
        </button>
        <label htmlFor={id} className="photo-picker-avatar-badge" aria-label={quechua ? 'Huk siq’ita akllay' : 'Elegir otra foto'}><Icon name="plus" size={14}/></label>
      </span>
      <div className="photo-picker-avatar-copy">
        <b>{label}</b><span className="photo-picker-optional">{quechua ? 'Munaspalla; llaqtamasiykikuna riqsisunaykipaq yanapan.' : 'Opcional, pero ayuda a que tus vecinos te reconozcan.'}</span>
        <p id={`${id}-hint`} className="form-hint">JPG, PNG o WebP · Máximo {maxInputMegabytes} MB</p>
        <div className="photo-picker-avatar-actions">
          <label htmlFor={id} className={`photo-picker-select ${disabled || reading ? 'is-disabled' : ''}`}>{reading ? (quechua ? 'Wakichichkan…' : 'Preparando…') : preview ? (quechua ? 'Siq’ita tikray' : 'Cambiar foto') : (quechua ? 'Siq’ita akllay' : 'Elegir foto')}</label>
          {preview && <button type="button" className="photo-picker-remove" disabled={disabled || reading} onClick={removePhoto}><Icon name="close" size={14}/>{quechua ? 'Qichuy' : 'Quitar'}</button>}
        </div>
      </div>
    </div> : <>
    <label htmlFor={id} className="photo-picker-label">{label} <span>(opcional)</span></label>
    <p id={`${id}-hint`} className="form-hint">Aceptamos imágenes JPG, PNG y WebP de hasta 5 MB.</p>
    <input ref={input} id={id} type="file" accept="image/jpeg,image/png,image/webp" aria-describedby={`${id}-hint`} disabled={disabled || reading} onChange={event => void choose(event)}/>
    {reading && <p className="form-hint" role="status">Preparando vista previa…</p>}
    {previewUrl && <div className="photo-preview"><img src={previewUrl} crossOrigin={preview?.startsWith('data:') ? undefined : 'use-credentials'} alt="Vista previa de la foto seleccionada"/><button type="button" className="outline-btn" disabled={disabled || reading} onClick={() => { sequence.current++; onChange(null); setError(''); if (input.current) input.current.value = ''; }}><Icon name="close" size={16}/>Quitar foto</button></div>}
    </>}
    {reading && variant === 'avatar' && <p className="form-hint photo-picker-reading" role="status">{quechua ? 'Siq’iykita wakichichkan…' : 'Preparando tu foto…'}</p>}
    {cropSource && <Modal title="Ajusta tu foto de perfil" onClose={() => setCropSource(null)}>
      <p className="photo-crop-instructions">Arrastra la foto para acomodarla y usa el control para acercar o alejar.</p>
      <div ref={cropStage} className="photo-crop-stage" onPointerDown={event => { event.currentTarget.setPointerCapture(event.pointerId); drag.current = { x: event.clientX, y: event.clientY, offset: cropOffset }; }} onPointerMove={moveCrop} onPointerUp={finishCrop} onPointerCancel={finishCrop}>
        <img ref={cropImage} src={cropSource} alt="Ajuste de recorte de la foto" draggable="false" onLoad={event => { setCropSize(cropStage.current?.clientWidth || CROP_SIZE); setCropDimensions({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight }); }} style={cropDimensions ? { width: `${cropDimensions.width * Math.max(cropSize / cropDimensions.width, cropSize / cropDimensions.height) * cropZoom}px`, height: `${cropDimensions.height * Math.max(cropSize / cropDimensions.width, cropSize / cropDimensions.height) * cropZoom}px`, transform: `translate(calc(-50% + ${cropOffset.x}px), calc(-50% + ${cropOffset.y}px))` } : undefined}/>
      </div>
      <label className="photo-crop-zoom"><span>Alejar</span><input type="range" min="1" max="3" step="0.01" value={cropZoom} onChange={event => updateZoom(Number(event.target.value))}/><span>Acercar</span></label>
      <div className="photo-crop-actions"><button type="button" className="outline-btn" onClick={() => setCropSource(null)}>Cancelar</button><button type="button" className="record-button" disabled={!cropDimensions} onClick={applyCrop}>Usar esta foto</button></div>
    </Modal>}
    {viewerOpen && previewUrl && <Modal title={quechua ? 'Perfil siq’iyki' : 'Tu foto de perfil'} onClose={() => setViewerOpen(false)}>
      <div className="photo-viewer"><img src={previewUrl} crossOrigin={preview?.startsWith('data:') ? undefined : 'use-credentials'} alt="Foto de perfil ampliada"/></div>
    </Modal>}
    <ErrorBox message={error}/>
  </div>;
}
