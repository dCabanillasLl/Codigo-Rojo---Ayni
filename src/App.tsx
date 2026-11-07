import { useEffect, useState } from "react";
import { useApp } from "./AppContext";
import AuthModal from "./components/AuthModal";
import RequestForm from "./components/RequestForm";
import Nearby from "./pages/Nearby";
import Help from "./pages/Help";
import Resources from "./pages/Resources";

type IconName =
  | "home"
  | "hands"
  | "megaphone"
  | "user"
  | "bell"
  | "pin"
  | "chevron"
  | "shield"
  | "star"
  | "clock"
  | "mic"
  | "search"
  | "sliders"
  | "store"
  | "heart"
  | "arrow"
  | "close"
  | "check"
  | "wifiOff"
  | "headphones"
  | "whatsapp"
  | "share"
  | "calendar"
  | "package"
  | "alert"
  | "plus";

const paths: Record<IconName, React.ReactNode> = {
  home: (
    <>
      <path d="m3 11 9-8 9 8" />
      <path d="M5 10v10h14V10" />
      <path d="M9 20v-6h6v6" />
    </>
  ),
  hands: (
    <>
      <path d="M8.5 12.5 5 9a2.1 2.1 0 0 0-3 3l5.4 5.4A5.5 5.5 0 0 0 11.3 19H14" />
      <path d="m15.5 12.5 3.5-3.5a2.1 2.1 0 0 1 3 3l-5.4 5.4A5.5 5.5 0 0 1 12.7 19H10" />
      <path d="m8 8 2.3-2.3a2.4 2.4 0 0 1 3.4 0L16 8" />
      <path d="m9 13 3-3 3 3" />
    </>
  ),
  megaphone: (
    <>
      <path d="m3 11 14-6v14L3 13Z" />
      <path d="M11.6 16.7 13 21H7l-1.5-6" />
      <path d="M21 9v6" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </>
  ),
  bell: (
    <>
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
      <path d="M10 21h4" />
    </>
  ),
  pin: (
    <>
      <path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" />
      <circle cx="12" cy="10" r="2.5" />
    </>
  ),
  chevron: <path d="m9 18 6-6-6-6" />,
  shield: (
    <>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
      <path d="m9 12 2 2 4-4" />
    </>
  ),
  star: <path d="m12 2 3 6 6.5 1-4.7 4.6 1.1 6.4-5.9-3.1L6.1 20l1.1-6.4L2.5 9 9 8Z" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  mic: (
    <>
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v4M8 22h8" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-4-4" />
    </>
  ),
  sliders: (
    <>
      <path d="M4 6h16M4 18h16M7 6v4M17 14v4" />
      <circle cx="7" cy="12" r="2" />
      <circle cx="17" cy="12" r="2" />
    </>
  ),
  store: (
    <>
      <path d="M4 10v11h16V10M3 4h18l-1 6a3 3 0 0 1-5 1 3 3 0 0 1-6 0 3 3 0 0 1-5-1Z" />
      <path d="M9 21v-6h6v6" />
    </>
  ),
  heart: (
    <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z" />
  ),
  arrow: (
    <>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </>
  ),
  close: (
    <>
      <path d="m6 6 12 12M18 6 6 18" />
    </>
  ),
  check: <path d="m5 12 4 4L19 6" />,
  wifiOff: (
    <>
      <path d="M2 8.8A15 15 0 0 1 8.5 6M22 8.8A15 15 0 0 0 15 6M5 12.8a10 10 0 0 1 7-2.8c1.2 0 2.3.2 3.3.6M8.5 16.5a5 5 0 0 1 7 0M12 21h.01M3 3l18 18" />
    </>
  ),
  headphones: (
    <>
      <path d="M4 14v-2a8 8 0 0 1 16 0v2" />
      <path d="M4 14h3v6H5a1 1 0 0 1-1-1ZM20 14h-3v6h2a1 1 0 0 0 1-1Z" />
    </>
  ),
  whatsapp: (
    <>
      <path d="M20.5 11.6a8.5 8.5 0 0 1-12.6 7.5L3 20.5l1.3-4.7A8.5 8.5 0 1 1 20.5 11.6Z" />
      <path d="M8.2 7.7c.3-.5.6-.5.9-.5h.4l.8 2c.1.3 0 .5-.2.7l-.6.7c.9 1.8 2.2 3 4 3.8l.6-.8c.2-.2.5-.3.7-.2l2 .9c.3.1.3.4.3.6-.1.8-.6 1.5-1.3 1.8-1 .4-2.4.2-4.5-.8-2.8-1.3-4.5-4.5-4.6-4.7-.4-1-.4-2.4.1-3.1Z" />
    </>
  ),
  share: (
    <>
      <circle cx="18" cy="5" r="2" />
      <circle cx="6" cy="12" r="2" />
      <circle cx="18" cy="19" r="2" />
      <path d="m8 11 8-5M8 13l8 5" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M16 3v4M8 3v4M3 10h18" />
    </>
  ),
  package: (
    <>
      <path d="m12 3 9 4.5v9L12 21l-9-4.5v-9Z" />
      <path d="m3 7.5 9 4.5 9-4.5M12 12v9" />
    </>
  ),
  alert: (
    <>
      <path d="M10.3 3.7 2.2 18a2 2 0 0 0 1.7 3h16.2a2 2 0 0 0 1.7-3L13.7 3.7a2 2 0 0 0-3.4 0Z" />
      <path d="M12 9v4M12 17h.01" />
    </>
  ),
  plus: (
    <>
      <path d="M12 5v14M5 12h14" />
    </>
  ),
};

function Icon({
  name,
  size = 20,
  className = "",
}: {
  name: IconName;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}

const nearbyItems = [
  {
    kind: "PRODUCTO LOCAL",
    name: "Pan artesanal recién horneado",
    owner: "Panadería Don Lucho",
    distance: "350 m",
    tone: "gold",
    icon: "store" as IconName,
    rating: "4.9",
    reviews: 38,
    latitude: -12.0708,
    longitude: -77.0614,
    mapNumber: 1,
  },
  {
    kind: "SERVICIO",
    name: "Arreglos y costura",
    owner: "Rosa M.",
    distance: "600 m",
    tone: "rose",
    icon: "heart" as IconName,
    rating: "4.8",
    reviews: 24,
    latitude: -12.0765,
    longitude: -77.0601,
    mapNumber: 2,
  },
  {
    kind: "SERVICIO",
    name: "Reparación de bicicletas",
    owner: "Taller El Pedal",
    distance: "850 m",
    tone: "green",
    icon: "package" as IconName,
    rating: "4.9",
    reviews: 51,
    latitude: -12.0715,
    longitude: -77.0704,
    mapNumber: 3,
  },
];

const navItems: { id: string; label: string; icon: IconName }[] = [
  { id: "cerca", label: "Cerca de mí", icon: "home" },
  { id: "ayuda", label: "Ayuda vecinal", icon: "hands" },
  { id: "avisos", label: "Avisos", icon: "megaphone" },
  { id: "perfil", label: "Mi perfil", icon: "user" },
];

export default function App() {
  const { user, online, sessionLoading, sessionError, authOpen, setAuthOpen, setUser, requireUser, notify } = useApp();
  const [active, setActive] = useState("cerca");
  const [helpOpen, setHelpOpen] = useState(false);
  const [toast, setToast] = useState("");

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  function speak(text: string) {
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(new SpeechSynthesisUtterance(text));
      setToast("Reproduciendo en voz alta");
    } else setToast("La lectura en voz alta no está disponible");
  }

  function resetHelp() {
    setHelpOpen(false);
  }

  return (
    <div className="min-h-screen bg-[#f3f0e8] text-[#24362e]">
      <header className="app-header sticky top-0 z-30 border-b border-[#d9ded8] bg-[#fffef9]">
        <div className="header-inner mx-auto flex max-w-[1240px] items-center justify-between px-5 lg:px-10">
          <button
            className="flex items-center gap-3"
            onClick={() => setActive("cerca")}
            aria-label="Ir al inicio"
          >
            <span className="logo-mark">
              <span />A
            </span>
            <span className="font-display text-[26px] font-extrabold tracking-[-0.04em] text-[#173f32]">
              AYNI
            </span>
          </button>
          <nav className="hidden items-center gap-1 md:flex">
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => setActive(item.id)}
                className={`top-nav ${active === item.id ? "active" : ""}`}
              >
                <Icon name={item.icon} size={18} />
                {item.label}
              </button>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setToast(online ? "El estado de conexión se detecta automáticamente" : "Sin conexión a internet")}
              className={`status-pill hidden sm:flex ${!online ? "offline" : ""}`}
            >
              <span className="status-dot" />
              {online ? "Con conexión" : "Sin conexión"}
            </button>
            <button
              className="icon-button relative"
              aria-label="Notificaciones"
              onClick={() => { if (requireUser()) setActive("avisos"); }}
            >
              <Icon name="bell" size={21} />
              <span className="absolute right-2.5 top-2.5 h-2 w-2 rounded-full bg-[#e76444] ring-2 ring-white" />
            </button>
          <button className="avatar" onClick={() => user ? setActive("perfil") : setAuthOpen(true)} aria-label={user ? `Perfil de ${user.nombres}` : "Iniciar sesión"}>
              {user ? `${user.nombres[0]}${user.apellidos[0]}` : "?"}
            </button>
          </div>
        </div>
      </header>

      <main className="app-main mx-auto max-w-[1240px] px-5 pt-7 lg:px-10 lg:pt-10">
        {sessionError && <p className="offline-banner" role="status">{sessionError} · {sessionLoading ? 'Verificando sesión…' : 'Los datos del servidor pueden no estar disponibles.'}</p>}
        {active === "cerca" && <Nearby onLocation={() => setToast("Elige tu sector desde el selector de zona")} onAsk={() => { if (requireUser()) setHelpOpen(true); }} />}
            {false && <section className="mb-8 grid items-end gap-8 lg:grid-cols-[1fr_430px]">
              <div>
                <p className="eyebrow">TU BARRIO, MÁS CERCA</p>
                <h1 className="font-display mt-3 max-w-[680px] text-[42px] font-bold leading-[1.04] tracking-[-0.045em] text-[#173f32] sm:text-[56px]">
                  Buenos días,
                  <br />
                  <span className="text-[#e36543]">Milagros.</span>
                </h1>
                <p className="mt-4 max-w-xl text-[17px] leading-7 text-[#627069]">
                  Descubre quién puede ayudarte, compra local y conecta con las personas que hacen
                  especial tu barrio.
                </p>
              </div>
              <button
                className="location-card group text-left"
                onClick={() => setToast("Ubicación actualizada: Pueblo Libre")}
              >
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#e5eee8] text-[#2d6a4e]">
                  <Icon name="pin" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-bold uppercase tracking-[.12em] text-[#79847f]">
                    Tu ubicación
                  </span>
                  <span className="mt-1 block truncate font-semibold text-[#24362e]">
                    Pueblo Libre · Sector 3
                  </span>
                </span>
                <Icon
                  name="chevron"
                  className="text-[#839089] transition-transform group-hover:translate-x-1"
                />
              </button>
            </section>}

            {null}
        {active === "ayuda" && <Help onAsk={() => { if (requireUser()) setHelpOpen(true); }} />}
        {active === "avisos" && <section><h1 className="font-display text-3xl font-bold">Avisos del barrio</h1><p className="mt-2">Esta sección se conectará con avisos publicados por vecinos.</p></section>}
        {active === "perfil" && <section><h1 className="font-display text-3xl font-bold">{user ? `${user.nombres} ${user.apellidos}` : 'Mi perfil'}</h1><p className="mt-2">{user?.sectorNombre || 'Inicia sesión para ver tu perfil.'}</p><button className="outline-btn mt-4" onClick={() => user ? void (async()=>{await fetch('/api/auth/logout',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json','X-AYNI-Client':'web'}});setUser(null);notify('Sesión cerrada');})() : setAuthOpen(true)}>{user ? 'Cerrar sesión' : 'Iniciar sesión'}</button></section>}
        {active === "recursos" && <Resources />}
      </main>

      <nav className="mobile-nav md:hidden" aria-label="Navegación principal">
        {navItems.slice(0, 2).map((item) => (
          <button
            key={item.id}
            onClick={() => setActive(item.id)}
            className={active === item.id ? "active" : ""}
            aria-current={active === item.id ? "page" : undefined}
          >
            <Icon name={item.icon} size={21} />
            <span>{item.id === "ayuda" ? "Ayuda" : item.label}</span>
          </button>
        ))}
        <button
          className="mobile-help-action"
          onClick={() => { if (requireUser()) setHelpOpen(true); }}
          aria-label="Pedir ayuda"
        >
          <span className="mobile-help-icon">
            <Icon name="mic" size={23} />
          </span>
          <span>Pedir ayuda</span>
        </button>
        {navItems.slice(2).map((item) => (
          <button
            key={item.id}
            onClick={() => setActive(item.id)}
            className={active === item.id ? "active" : ""}
            aria-current={active === item.id ? "page" : undefined}
          >
            <Icon name={item.icon} size={21} />
            <span>{item.id === "perfil" ? "Perfil" : item.label}</span>
          </button>
        ))}
      </nav>

      {helpOpen && <RequestForm onClose={resetHelp} />}
      {authOpen && <AuthModal />}
      {toast && <div className="toast" role="status"><Icon name="check" size={17}/>{toast}</div>}
    </div>
  );
}

function HelpBoard({
  onAsk,
  onSpeak,
  sent,
  offline,
}: {
  onAsk: () => void;
  onSpeak: (s: string) => void;
  sent: boolean;
  offline: boolean;
}) {
  const requests = [
    {
      who: "María E.",
      need: "Necesito apoyo para llevar unas cajas",
      place: "Sector 2 · a 450 m",
      time: "Hace 12 min",
      category: "Un favor",
      urgent: true,
    },
    {
      who: "Carlos R.",
      need: "Busco una taladradora por esta tarde",
      place: "Sector 4 · a 700 m",
      time: "Hace 25 min",
      category: "Préstamo",
      urgent: false,
    },
    {
      who: "Lucía P.",
      need: "Dono ropa de abrigo para niños",
      place: "Sector 3 · a 850 m",
      time: "Hace 1 h",
      category: "Donación",
      urgent: false,
    },
  ];
  return (
    <section>
      <div className="page-heading">
        <div>
          <p className="eyebrow">NOS APOYAMOS</p>
          <h1 className="font-display mt-2 text-4xl font-bold tracking-[-.04em]">Ayuda vecinal</h1>
          <p className="mt-2 text-[#65726b]">Pequeñas acciones que hacen un barrio más fuerte.</p>
        </div>
        <button onClick={onAsk} className="record-button">
          <Icon name="plus" /> Pedir ayuda
        </button>
      </div>
      {offline && (
        <div className="offline-banner">
          <Icon name="wifiOff" />
          <span>
            <b>Estás sin conexión.</b> Ves el tablero descargado hoy a las 9:42.
          </span>
        </div>
      )}
      {sent && (
        <div className="my-request">
          <span className="grid h-11 w-11 place-items-center rounded-full bg-[#fff0d8] text-[#a66a1c]">
            <Icon name={offline ? "wifiOff" : "clock"} />
          </span>
          <div className="flex-1">
            <p className="text-xs font-bold uppercase tracking-[.1em] text-[#8a713f]">TU PEDIDO</p>
            <h3 className="mt-1 font-bold">Necesito una escalera por una hora</h3>
          </div>
          <span className="rounded-full bg-white px-3 py-1.5 text-xs font-bold">
            {offline ? "Pendiente de envío" : "Buscando ayuda"}
          </span>
        </div>
      )}
      <div className="mt-8 flex items-center justify-between">
        <h2 className="font-display text-2xl font-bold">Pedidos abiertos cerca</h2>
        <span className="text-sm text-[#718078]">Actualizado hace 2 min</span>
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        {requests.map((r) => (
          <article className="request-card" key={r.need}>
            <div className="flex items-center justify-between">
              <span className={`category ${r.urgent ? "urgent" : ""}`}>
                {r.urgent && <Icon name="alert" size={13} />}
                {r.category}
              </span>
              <button className="listen-btn" onClick={() => onSpeak(`${r.who} dice: ${r.need}`)}>
                <Icon name="headphones" size={16} /> Escuchar
              </button>
            </div>
            <div className="mt-5 flex items-center gap-3">
              <div className="small-avatar">
                {r.who
                  .split(" ")
                  .map((x) => x[0])
                  .join("")}
              </div>
              <div>
                <p className="font-bold">{r.who}</p>
                <p className="text-xs text-[#78847e]">Vecino amistoso</p>
              </div>
            </div>
            <h3 className="mt-5 min-h-[52px] text-lg font-bold leading-snug">{r.need}</h3>
            <p className="mt-3 flex items-center gap-2 text-sm text-[#748078]">
              <Icon name="pin" size={16} />
              {r.place}
            </p>
            <p className="mt-2 flex items-center gap-2 text-sm text-[#748078]">
              <Icon name="clock" size={16} />
              {r.time}
            </p>
            <button
              className="offer-button"
              onClick={() => alert(`Gracias. Le avisaremos a ${r.who} que puedes ayudar.`)}
            >
              Puedo ayudar <Icon name="arrow" size={17} />
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}

function Notices({
  onToast,
  onSpeak,
}: {
  onToast: (x: string) => void;
  onSpeak: (x: string) => void;
}) {
  return (
    <section>
      <div className="page-heading">
        <div>
          <p className="eyebrow">LO QUE PASA CERCA</p>
          <h1 className="font-display mt-2 text-4xl font-bold tracking-[-.04em]">
            Avisos del barrio
          </h1>
          <p className="mt-2 text-[#65726b]">Actividades, colectas y sabores que nos reúnen.</p>
        </div>
        <button
          onClick={() => onToast("Tu aviso se guardó como borrador")}
          className="record-button"
        >
          <Icon name="plus" /> Crear aviso
        </button>
      </div>
      <div className="mt-8 grid gap-5 lg:grid-cols-[1.35fr_.8fr]">
        <article className="flyer-card">
          <div className="flyer-art">
            <p className="text-xs font-extrabold uppercase tracking-[.18em] text-[#844c27]">
              Este domingo
            </p>
            <h2 className="font-display mt-3 text-5xl font-extrabold leading-[.95] tracking-[-.05em] text-[#743822]">
              Picarones
              <br />
              de Juanita
            </h2>
            <div className="mt-6 inline-block -rotate-2 rounded-lg bg-[#fff4d8] px-4 py-2 font-bold text-[#75432c]">
              Desde las 4:00 p. m.
            </div>
            <span className="flyer-ring r1" />
            <span className="flyer-ring r2" />
            <span className="flyer-dot d1" />
            <span className="flyer-dot d2" />
          </div>
          <div className="p-6">
            <div className="flex flex-wrap items-center gap-4 text-sm text-[#68766f]">
              <span className="flex items-center gap-2">
                <Icon name="calendar" size={17} /> Domingo, 18 de mayo
              </span>
              <span className="flex items-center gap-2">
                <Icon name="pin" size={17} /> Sector 3
              </span>
            </div>
            <p className="mt-4 leading-7 text-[#4f5e56]">
              Juanita prepara picarones para recaudar fondos para la olla común. Puedes colaborar
              con insumos o difundir el aviso.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <button
                onClick={() => onToast("Abriendo conversación con mensaje preparado")}
                className="whatsapp-btn"
              >
                <Icon name="whatsapp" size={19} /> Contactar por WhatsApp
              </button>
              <button onClick={() => onToast("Flyer listo para compartir")} className="outline-btn">
                <Icon name="share" size={18} /> Compartir
              </button>
              <button
                onClick={() =>
                  onSpeak(
                    "Este domingo, picarones de Juanita desde las cuatro de la tarde en el sector tres. Puedes colaborar con insumos.",
                  )
                }
                className="outline-btn"
              >
                <Icon name="headphones" size={18} /> Escuchar
              </button>
            </div>
          </div>
        </article>
        <div className="space-y-4">
          <article className="compact-notice peach">
            <span className="category">COLECTA</span>
            <h3>Apoyo para tratamiento de salud</h3>
            <p>Viernes · Sector 1</p>
            <button onClick={() => onToast("Aviso abierto")}>
              Ver aviso <Icon name="arrow" size={16} />
            </button>
          </article>
          <article className="compact-notice sage">
            <span className="category">ACTIVIDAD</span>
            <h3>Limpieza del parque El Carmen</h3>
            <p>Sábado, 9:00 a. m. · Sector 3</p>
            <button onClick={() => onToast("Aviso abierto")}>
              Ver aviso <Icon name="arrow" size={16} />
            </button>
          </article>
        </div>
      </div>
    </section>
  );
}

function Profile() {
  return (
    <section>
      <div className="page-heading">
        <div>
          <p className="eyebrow">TU COMUNIDAD</p>
          <h1 className="font-display mt-2 text-4xl font-bold tracking-[-.04em]">Mi perfil</h1>
        </div>
      </div>
      <div className="mt-8 grid gap-5 lg:grid-cols-[.8fr_1.4fr]">
        <article className="profile-card text-center">
          <div className="mx-auto grid h-24 w-24 place-items-center rounded-full bg-[#e4eee8] text-2xl font-bold text-[#2d694e]">
            MC
          </div>
          <h2 className="font-display mt-4 text-2xl font-bold">Milagros C.</h2>
          <p className="mt-1 text-sm text-[#718078]">Pueblo Libre · Sector 3</p>
          <div className="mx-auto mt-4 inline-flex items-center gap-2 rounded-full bg-[#fff2d5] px-4 py-2 text-sm font-bold text-[#805b20]">
            <Icon name="star" size={17} className="fill-[#e9b54a] text-[#e9b54a]" /> Vecina amistosa
          </div>
          <div className="mt-7 grid grid-cols-3 border-t border-[#e4e7e2] pt-6">
            <div>
              <b className="block text-xl">8</b>
              <span className="text-xs text-[#738078]">Ayudas</span>
            </div>
            <div>
              <b className="block text-xl">12</b>
              <span className="text-xs text-[#738078]">Gracias</span>
            </div>
            <div>
              <b className="block text-xl">4.9</b>
              <span className="text-xs text-[#738078]">Valoración</span>
            </div>
          </div>
        </article>
        <div className="space-y-4">
          <article className="profile-card">
            <h3 className="font-display text-xl font-bold">Tu actividad</h3>
            <div className="mt-5 space-y-4">
              {[
                ["check", "Ayuda completada", "Prestaste una caja de herramientas · Ayer"],
                ["package", "Préstamo en curso", "Maceta grande para Rosa M. · Devuelve el martes"],
                ["heart", "Agradecimiento recibido", "“Milagros fue muy amable y puntual.”"],
              ].map(([icon, title, sub]) => (
                <div className="activity-row" key={title}>
                  <span>
                    <Icon name={icon as IconName} size={19} />
                  </span>
                  <div>
                    <b>{title}</b>
                    <p>{sub}</p>
                  </div>
                  <Icon name="chevron" className="ml-auto text-[#96a09b]" />
                </div>
              ))}
            </div>
          </article>
          <button className="profile-card flex w-full items-center gap-4 text-left">
            <span className="grid h-11 w-11 place-items-center rounded-full bg-[#eef2ef]">
              <Icon name="shield" />
            </span>
            <span className="flex-1">
              <b className="block">Confianza y seguridad</b>
              <span className="text-sm text-[#718078]">Revisa tus recomendaciones y reportes</span>
            </span>
            <Icon name="chevron" />
          </button>
        </div>
      </div>
    </section>
  );
}
