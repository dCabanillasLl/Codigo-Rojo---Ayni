import { useEffect, useId, useRef, type ReactNode } from 'react';
import Icon from './Icon';

export function Modal({ title, children, onClose, wide = false }: { title: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const closeRef = useRef(onClose); closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const dialog = ref.current;
    dialog?.showModal();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { dialog?.close(); document.body.style.overflow = previousOverflow; previous?.focus(); };
  }, []);
  return <dialog ref={ref} className={`help-modal modal-dialog ${wide ? 'modal-wide' : ''}`} aria-labelledby={titleId} onCancel={event => { event.preventDefault(); closeRef.current(); }} onClick={event => { if (event.target === event.currentTarget) closeRef.current(); }}>
    <div className="modal-header"><div><p className="eyebrow">AYNI · TU BARRIO TE ACOMPAÑA</p><h2 id={titleId} className="font-display">{title}</h2></div><button type="button" className="icon-button" aria-label="Cerrar" onClick={onClose}><Icon name="close" /></button></div>
    <div className="modal-content">{children}</div>
  </dialog>;
}
export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return <label className="form-field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>;
}
export function ErrorBox({ message }: { message?: string }) { return message ? <p className="error-box" role="alert"><Icon name="alert" size={18}/><span>{message}</span></p> : null; }
export function RemoteState({ loading, error, cachedAt, reload }: { loading: boolean; error: string; cachedAt?: string | null; reload: () => void }) {
  return <>
    {loading && <p className="loading-message" role="status">Consultando a tu barrio…</p>}
    {cachedAt && <p className="offline-banner" role="status"><Icon name="wifiOff" size={18}/>Ves información guardada el {formatDate(cachedAt)}. Puede haber cambiado.</p>}
    {error && !loading && <div className="error-box" role="alert"><span>{error}</span><button type="button" onClick={reload} className="text-action">Reintentar</button></div>}
  </>;
}
export function Empty({ title, text }: { title: string; text: string }) { return <div className="empty-state"><Icon name="hands" size={34}/><h3 className="font-display">{title}</h3><p>{text}</p></div>; }
export function PageHeading({ eyebrow, title, text, children }: { eyebrow: string; title: string; text: string; children?: ReactNode }) {
  return <div className="page-heading"><div><p className="eyebrow">{eyebrow}</p><h1 className="font-display mt-2 text-4xl font-bold tracking-[-.04em]">{title}</h1><p className="mt-2 text-[#65726b]">{text}</p></div>{children}</div>;
}
export function formatDate(value: string | null | undefined) { if (!value) return ''; const date = new Date(value); return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat('es-PE', { dateStyle: 'short', timeStyle: 'short' }).format(date); }
export function distance(value: number | null | undefined, fallback: string) { return value == null ? fallback : Number(value) < 1000 ? `Aprox. ${Math.round(Number(value) / 50) * 50} m` : `Aprox. ${(Number(value)/1000).toFixed(1)} km`; }
export function initials(name: string) { return name.trim().split(/\s+/).slice(0,2).map(part => part[0]).join('').toUpperCase(); }
export function statusLabel(state: string) { return ({ abierta: 'Espera ayuda', en_curso: 'Ayuda en curso', completada: 'Completada', cancelada: 'Cancelada', vencida: 'Vencida', pendiente: 'Propuesta', aceptada: 'Aceptada', retirada: 'Retirada', rechazada: 'Rechazada', reservada: 'Reservada', entregada: 'Entregada', publicada: 'Publicada', publicado: 'Publicado', pausada: 'Pausada', borrador: 'Borrador', archivada: 'Archivada' } as Record<string,string>)[state] || state; }
export function speak(text: string) {
  if (!('speechSynthesis' in window)) return false;
  window.speechSynthesis.cancel(); const utterance = new SpeechSynthesisUtterance(text); utterance.lang = 'es-PE'; window.speechSynthesis.speak(utterance); return true;
}
export async function shareItem(title: string, text: string, hash: string) {
  const url = `${window.location.origin}${window.location.pathname}${hash}`;
  if (navigator.share) await navigator.share({ title, text, url });
  else if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(`${title}\n${text}\n${url}`); return 'Enlace copiado para compartir'; }
  else { window.open(`https://wa.me/?text=${encodeURIComponent(`${title}\n${text}\n${url}`)}`, '_blank', 'noopener,noreferrer'); return 'Continúa en WhatsApp para elegir con quién compartir'; }
  return '';
}
