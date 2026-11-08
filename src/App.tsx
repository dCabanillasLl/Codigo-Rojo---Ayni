import { useEffect, useState } from 'react';
import { useApp } from './AppContext';
import AuthModal from './components/AuthModal';
import Icon from './components/Icon';
import RequestForm from './components/RequestForm';
import Help from './pages/Help';
import Nearby from './pages/Nearby';
import Notices from './pages/Notices';
import Profile from './pages/Profile';
import { api, errorMessage } from './lib/api';
import { LocationDialog } from './components/LocationDialog';
import NotificationCenter from './components/NotificationCenter';
import { useLanguage } from './lib/language';
import GuideBot from './components/GuideBot';

type Destination = 'cerca' | 'ayuda' | 'avisos' | 'perfil';
const navItems: { id: Destination; label: string; icon: 'home' | 'hands' | 'megaphone' | 'user' }[] = [
  { id: 'cerca', label: 'Cerca de mí', icon: 'home' },
  { id: 'ayuda', label: 'Ayuda vecinal', icon: 'hands' },
  { id: 'avisos', label: 'Avisos', icon: 'megaphone' },
  { id: 'perfil', label: 'Mi perfil', icon: 'user' },
];

function readRoute(): { page: Destination; detailId?: string; helpTab?: 'mios' } {
  const [route, id] = window.location.hash.replace(/^#\/?/, '').split('/');
  const page = (['cerca', 'ayuda', 'avisos', 'perfil'].includes(route) ? route : 'cerca') as Destination;
  const reviewsShortcut = page === 'ayuda' && id === 'mis-pedidos';
  return { page, detailId: reviewsShortcut ? undefined : id || undefined, helpTab: reviewsShortcut ? 'mios' : undefined };
}
function navigate(page: Destination, id?: string) {
  const hash = `#${page}${id ? `/${encodeURIComponent(id)}` : ''}`;
  if (window.location.hash === hash) window.dispatchEvent(new HashChangeEvent('hashchange'));
  else window.location.hash = hash;
}

export default function App() {
  const { t } = useLanguage();
  const { user, setUser, online, sessionLoading, sessionError, authOpen, setAuthOpen, requireUser, notify, notifications, notificationsError, unreadNotifications, markNotificationsRead } = useApp();
  const [route, setRoute] = useState(readRoute);
  const [helpOpen, setHelpOpen] = useState(false);
  const [locationOpen, setLocationOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [signOutBusy, setSignOutBusy] = useState(false);
  const [profileError, setProfileError] = useState('');

  useEffect(() => {
    const change = () => setRoute(readRoute());
    window.addEventListener('hashchange', change);
    return () => window.removeEventListener('hashchange', change);
  }, []);

  async function signOut() {
    setSignOutBusy(true); setProfileError('');
    try { await api('/auth/logout', { method: 'POST', body: {} }); setUser(null); notify('Sesión cerrada.'); }
    catch (cause) { setProfileError(errorMessage(cause)); }
    finally { setSignOutBusy(false); }
  }

  return <div className="min-h-screen bg-[#f3f0e8] text-[#24362e]">
    <header className="app-header sticky top-0 z-30 border-b border-[#d9ded8] bg-[#fffef9]">
      <div className="header-inner mx-auto flex max-w-[1240px] items-center justify-between px-5 lg:px-10">
        <button type="button" className="flex items-center gap-3" onClick={() => navigate('cerca')} aria-label="Ir al inicio">
          <img className="logo-image" src="/ayni-logo.png" alt="" aria-hidden="true"/><span className="font-display text-[26px] font-extrabold tracking-[-0.04em] text-[#173f32]">AYNI</span>
        </button>
        <nav className="hidden items-center gap-1 md:flex" aria-label="Navegación principal">
          {navItems.map(item => <button type="button" key={item.id} onClick={() => navigate(item.id)} className={`top-nav ${route.page === item.id ? 'active' : ''}`} aria-current={route.page === item.id ? 'page' : undefined}><Icon name={item.icon} size={18}/>{t(item.id === 'cerca' ? 'near' : item.id === 'ayuda' ? 'help' : item.id === 'avisos' ? 'notices' : 'profile')}</button>)}
        </nav>
        <div className="flex items-center gap-2">
          <span className={`status-pill hidden sm:flex ${!online ? 'offline' : ''}`} role="status"><span className="status-dot"/>{online ? t('connected') : t('offline')}</span>
          <button type="button" className="icon-button relative" aria-label={`Notificaciones${unreadNotifications ? ` sin leer: ${unreadNotifications}` : ''}`} onClick={() => { if (!requireUser()) return; setNotificationsOpen(true); markNotificationsRead(); }}><Icon name="bell" size={21}/>{unreadNotifications > 0 && <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-[#e76444] ring-2 ring-white"/>}</button>
          <button type="button" className="avatar" onClick={() => user ? navigate('perfil') : setAuthOpen(true)} aria-label={user ? `Perfil de ${user.nombres}` : 'Iniciar sesión'}>{user ? `${user.nombres[0]}${user.apellidos[0]}` : '?'}</button>
        </div>
      </div>
    </header>

    <main className="app-main mx-auto max-w-[1240px] px-5 pt-7 lg:px-10 lg:pt-10">
      {!online && <p className="offline-banner" role="status"><Icon name="wifiOff" size={18}/>Estás sin conexión. Puedes consultar información guardada y guardar pedidos para enviarlos cuando vuelvas a conectarte.</p>}
      {sessionError && <p className="offline-banner" role="status">{sessionError} · {sessionLoading ? 'Verificando sesión…' : 'Los datos del servidor pueden no estar disponibles.'}</p>}
      {route.page === 'cerca' && <Nearby detailId={route.detailId} onLocation={() => setLocationOpen(true)} onAsk={() => { if (requireUser()) setHelpOpen(true); }}/>}
      {route.page === 'ayuda' && <Help detailId={route.detailId} initialTab={route.helpTab} onLocation={() => setLocationOpen(true)} onAsk={() => { if (requireUser()) setHelpOpen(true); }}/>}
      {route.page === 'avisos' && <Notices view={route.detailId}/>}
      {route.page === 'perfil' && <Profile onLocation={() => setLocationOpen(true)} onReviewHelp={() => navigate('ayuda', 'mis-pedidos')} onSignOut={() => void signOut()} signOutBusy={signOutBusy} signOutError={profileError}/>}
    </main>

    <nav className="mobile-nav md:hidden" aria-label="Navegación principal">
      {navItems.slice(0, 2).map(item => <button type="button" key={item.id} onClick={() => navigate(item.id)} className={route.page === item.id ? 'active' : ''} aria-current={route.page === item.id ? 'page' : undefined}><Icon name={item.icon} size={21}/><span>{t(item.id === 'cerca' ? 'near' : 'help')}</span></button>)}
      <button type="button" className="mobile-help-action" onClick={() => { if (requireUser()) setHelpOpen(true); }} aria-label="Pedir ayuda"><span className="mobile-help-icon"><Icon name="mic" size={23}/></span><span>Pedir ayuda</span></button>
      {navItems.slice(2).map(item => <button type="button" key={item.id} onClick={() => navigate(item.id)} className={route.page === item.id ? 'active' : ''} aria-current={route.page === item.id ? 'page' : undefined}><Icon name={item.icon} size={21}/><span>{t(item.id === 'avisos' ? 'notices' : 'profile')}</span></button>)}
    </nav>
    {helpOpen && <RequestForm onClose={() => setHelpOpen(false)}/>}
    {locationOpen && <LocationDialog onClose={() => setLocationOpen(false)} saveToProfile={route.page === 'perfil'}/>}
    {notificationsOpen && <NotificationCenter notifications={notifications} error={notificationsError} onClose={() => setNotificationsOpen(false)}/>}
    {authOpen && <AuthModal/>}
    <GuideBot onNavigate={navigate} onAsk={() => { if (requireUser()) setHelpOpen(true); }} onOffer={() => { navigate('ayuda'); if (!user) requireUser(); }} onLocation={() => { if (requireUser()) setLocationOpen(true); }}/>
  </div>;
}
