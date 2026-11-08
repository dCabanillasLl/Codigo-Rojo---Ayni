import { ErrorBox, Modal, formatDate } from './UI';
import Icon from './Icon';
import type { AppNotification } from '../lib/storage';

export default function NotificationCenter({ notifications, error, onClose }: { notifications: AppNotification[]; error?: string; onClose: () => void }) {
  return <Modal title="Notificaciones" onClose={onClose}>
    <p className="form-intro">Este historial es privado de tu cuenta. Aquí recibes cambios de tus acciones y actividades a las que confirmaste asistencia; se actualiza al volver a la aplicación y periódicamente con conexión.</p>
    <ErrorBox message={error || ''}/>
    {notifications.length === 0 ? <div className="empty-state"><Icon name="bell" size={32}/><h3 className="font-display">Todavía no tienes notificaciones</h3><p>Las confirmaciones de tus acciones aparecerán aquí.</p></div> : <div className="space-y-3">{notifications.map(item => <article className="contribution-card" key={item.id}><div className="action-row items-start"><span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${item.read ? 'bg-[#bdc8c0]' : 'bg-[#e76444]'}`} aria-hidden="true"/><div className="min-w-0 flex-1"><p>{item.text}</p>{item.avisoId && <a className="text-action" href="#avisos/asistencias" onClick={onClose}>Ver mis asistencias</a>}<time className="form-hint" dateTime={item.createdAt}>{formatDate(item.createdAt)}</time></div></div></article>)}</div>}
  </Modal>;
}
