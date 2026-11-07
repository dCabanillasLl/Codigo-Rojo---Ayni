import { Modal, formatDate } from './UI';
import Icon from './Icon';
import type { AppNotification } from '../lib/storage';

export default function NotificationCenter({ notifications, onClose }: { notifications: AppNotification[]; onClose: () => void }) {
  return <Modal title="Notificaciones" onClose={onClose}>
    <p className="form-intro">Avisos de las acciones realizadas en este dispositivo. Necesitas conexión para recibir cambios nuevos del servidor.</p>
    {notifications.length === 0 ? <div className="empty-state"><Icon name="bell" size={32}/><h3 className="font-display">Todavía no tienes notificaciones</h3><p>Las confirmaciones de tus acciones aparecerán aquí.</p></div> : <div className="space-y-3">{notifications.map(item => <article className="contribution-card" key={item.id}><div className="action-row items-start"><span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${item.read ? 'bg-[#bdc8c0]' : 'bg-[#e76444]'}`} aria-hidden="true"/><div className="min-w-0 flex-1"><p>{item.text}</p><time className="form-hint" dateTime={item.createdAt}>{formatDate(item.createdAt)}</time></div></div></article>)}</div>}
  </Modal>;
}
