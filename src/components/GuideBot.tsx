import { useEffect, useRef, useState, type FormEvent } from 'react';
import Icon, { type IconName } from './Icon';

type Destination = 'cerca' | 'ayuda' | 'avisos';
type GuideAction = 'nearby' | 'ask' | 'offer' | 'notices' | 'location' | 'tutorial';
type MessageAction = { key: GuideAction; label: string; icon: IconName };
type Message = { id: string; from: 'bot' | 'you'; text: string; action?: MessageAction };
type GuideBotProps = { onNavigate: (page: Destination) => void; onAsk: () => void; onOffer: () => void; onLocation: () => void };
type TourStep = { page: Destination; target: string; title: string; text: string };
type TourSpotlight = { top: number; left: number; width: number; height: number; right: number; bottom: number; tooltipTop: number; tooltipLeft: number; tooltipWidth: number; placement: 'above' | 'below' };

const homeActions: Array<MessageAction & { description: string }> = [
  { key: 'nearby', label: 'Buscar cerca', description: 'Productos y servicios del barrio', icon: 'search' },
  { key: 'ask', label: 'Pedir ayuda', description: 'Cuenta qué necesitas', icon: 'hands' },
  { key: 'offer', label: 'Ofrecer ayuda', description: 'Apoya a un vecino', icon: 'heart' },
  { key: 'notices', label: 'Ver avisos', description: 'Novedades de la comunidad', icon: 'megaphone' },
  { key: 'location', label: 'Configurar ubicación', description: 'Mejora lo que ves cerca', icon: 'pin' },
  { key: 'tutorial', label: 'Enséñame AYNI', description: 'Guía rápida en 4 pasos', icon: 'check' },
];
const tutorial: TourStep[] = [
  { page: 'cerca', target: 'tour-search', title: 'Busca algo de tu barrio', text: 'Escribe qué producto o servicio buscas. AYNI te muestra opciones compartidas por vecinos.' },
  { page: 'cerca', target: 'tour-location', title: 'Tu zona, a tu manera', text: 'Pulsa aquí para revisar o actualizar tu ubicación. Solo se comparte una distancia aproximada.' },
  { page: 'cerca', target: 'tour-ask', title: 'Pide lo que necesitas', text: 'Describe el pedido con tus palabras. AYNI propone un título y tú confirmas antes de publicarlo.' },
  { page: 'cerca', target: 'tour-offer', title: 'Comparte lo que puedes ofrecer', text: 'También puedes publicar un producto o servicio para que los vecinos lo encuentren.' },
  { page: 'ayuda', target: 'tour-help', title: 'Colabora con un vecino', text: 'En Ayuda vecinal puedes revisar pedidos y ofrecer apoyo. Quien publicó decide si acepta tu colaboración.' },
  { page: 'avisos', target: 'tour-notices', title: 'Entérate de lo que pasa', text: 'Consulta avisos compartidos por vecinos. En emergencias, AYNI coordina apoyo comunitario y no reemplaza a servicios oficiales.' },
];

function newMessage(from: Message['from'], text: string, extra: Partial<Message> = {}): Message {
  return { id: crypto.randomUUID(), from, text, ...extra };
}

export default function GuideBot({ onNavigate, onAsk, onOffer, onLocation }: GuideBotProps) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([
    newMessage('bot', '¡Hola! Soy tu guía de AYNI. Elige lo que quieres hacer y te acompaño paso a paso.'),
  ]);
  const [tourIndex, setTourIndex] = useState<number | null>(null);
  const [spotlight, setSpotlight] = useState<TourSpotlight | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTo({ top: list.scrollHeight, behavior: 'smooth' });
  }, [messages, open]);

  useEffect(() => {
    if (tourIndex === null) { setSpotlight(null); return; }
    let timer = 0;
    let attempts = 0;
    let scrolled = false;
    let target: HTMLElement | null = null;
    const measure = () => {
      target = document.querySelector<HTMLElement>(`[data-tour="${tutorial[tourIndex].target}"]`);
      if (!target) {
        attempts += 1;
        if (attempts < 24) timer = window.setTimeout(measure, 120);
        else setSpotlight(null);
        return;
      }
      if (!scrolled) {
        scrolled = true;
        target.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center', inline: 'nearest' });
        timer = window.setTimeout(measure, 420);
        return;
      }
      const rect = target.getBoundingClientRect();
      const pad = 8;
      const top = Math.max(4, rect.top - pad);
      const left = Math.max(4, rect.left - pad);
      const width = Math.min(window.innerWidth - left - 4, rect.width + pad * 2);
      const height = Math.min(window.innerHeight - top - 4, rect.height + pad * 2);
      const right = left + width;
      const bottom = top + height;
      const tooltipWidth = Math.min(352, window.innerWidth - 24);
      const tooltipHeight = 230;
      const placement = window.innerHeight - bottom >= tooltipHeight + 28 ? 'below' : 'above';
      const tooltipTop = placement === 'below'
        ? Math.min(window.innerHeight - tooltipHeight - 12, bottom + 18)
        : Math.max(12, top - tooltipHeight - 18);
      const tooltipLeft = Math.max(12, Math.min(window.innerWidth - tooltipWidth - 12, (left + right) / 2 - tooltipWidth / 2));
      setSpotlight({ top, left, width, height, right, bottom, tooltipTop, tooltipLeft, tooltipWidth, placement });
    };
    timer = window.setTimeout(measure, 180);
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => { window.clearTimeout(timer); window.removeEventListener('resize', measure); window.removeEventListener('scroll', measure, true); };
  }, [tourIndex]);

  function beginVisualTour(label = 'Enséñame AYNI en pantalla') {
    setMessages(current => [...current, newMessage('you', label), newMessage('bot', '¡Vamos! Te iré señalando cada parte. Pulsa “Siguiente” cuando quieras continuar.')]);
    setOpen(false);
    setTourIndex(0);
    onNavigate(tutorial[0].page);
  }

  function endVisualTour(skipped = false) {
    setTourIndex(null);
    setSpotlight(null);
    setOpen(true);
    setMessages(current => [...current, newMessage('bot', skipped ? 'Recorrido pausado. Puedes volver a iniciarlo cuando quieras.' : '¡Recorrido terminado! Ya puedes explorar AYNI por tu cuenta.')]);
  }

  function nextVisualStep() {
    if (tourIndex === null) return;
    const next = tourIndex + 1;
    if (next >= tutorial.length) { endVisualTour(); return; }
    setSpotlight(null);
    setTourIndex(next);
    onNavigate(tutorial[next].page);
  }

  function runAction(key: GuideAction) {
    if (key === 'nearby') onNavigate('cerca');
    if (key === 'ask') onAsk();
    if (key === 'offer') onOffer();
    if (key === 'notices') onNavigate('avisos');
    if (key === 'location') onLocation();
    if (key === 'tutorial') beginVisualTour();
  }

  function selectAction(item: MessageAction & { description?: string }) {
    if (item.key === 'tutorial') { beginVisualTour(item.label); return; }
    setMessages(current => [...current, newMessage('you', item.label)]);
    const guidance: Record<Exclude<GuideAction, 'tutorial'>, string> = {
      nearby: 'Te muestro dónde encontrar cosas de tu barrio. Abre esta sección y toca una tarjeta para ver sus detalles.',
      ask: 'En unos pasos publicarás tu pedido. Escribe qué necesitas, revisa el texto y confirma.',
      offer: 'Aquí puedes leer lo que necesitan tus vecinos y elegir un pedido para ofrecer tu ayuda.',
      notices: 'Aquí encontrarás avisos y actividades compartidos por vecinos.',
      location: 'Configura tu ubicación para ordenar los resultados por cercanía. Tu dirección exacta permanece privada.',
    };
    setMessages(current => [...current, newMessage('bot', guidance[item.key as Exclude<GuideAction, 'tutorial'>], { action: { key: item.key, label: item.key === 'nearby' ? 'Ir a Cerca de mí' : item.key === 'ask' ? 'Crear un pedido' : item.key === 'offer' ? 'Explorar pedidos' : item.key === 'notices' ? 'Abrir avisos' : 'Configurar ubicación', icon: item.icon } })]);
  }

  function classify(text: string): GuideAction | 'fallback' {
    const normalized = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es');
    if (/tutorial|ensename|como funciona|soy nuevo|guia/.test(normalized)) return 'tutorial';
    if (/ubicacion|zona|direccion|gps|cerca de mi/.test(normalized)) return 'location';
    if (/aviso|evento|noticia/.test(normalized)) return 'notices';
    if (/ofrec|colabor|ayudar a alguien|quiero ayudar/.test(normalized)) return 'offer';
    if (/pedir|necesito|solicitud|me hace falta/.test(normalized)) return 'ask';
    if (/buscar|producto|servicio|comprar|encontrar/.test(normalized)) return 'nearby';
    return 'fallback';
  }

  function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = input.trim();
    if (!value) return;
    setInput('');
    const intent = classify(value);
    const userMessage = newMessage('you', value);
    if (intent === 'tutorial') {
      beginVisualTour(value);
      return;
    }
    const replies: Record<Exclude<typeof intent, 'tutorial' | 'fallback'>, MessageAction> = {
      nearby: { key: 'nearby', label: 'Ir a Cerca de mí', icon: 'search' },
      ask: { key: 'ask', label: 'Crear un pedido', icon: 'hands' },
      offer: { key: 'offer', label: 'Explorar pedidos', icon: 'heart' },
      notices: { key: 'notices', label: 'Abrir avisos', icon: 'megaphone' },
      location: { key: 'location', label: 'Configurar ubicación', icon: 'pin' },
    };
    const replyText = intent === 'fallback'
      ? 'Puedo acompañarte en una tarea. Prueba “quiero buscar”, “necesito ayuda”, “quiero ayudar”, “avisos” o “enséñame AYNI”.'
      : intent === 'nearby' ? '¡Vamos a buscar por tu zona! Abre Cerca de mí para ver las opciones disponibles.'
        : intent === 'ask' ? 'Te acompaño a crear tu pedido. Cuenta qué necesitas y revisa el texto antes de publicarlo.'
          : intent === 'offer' ? '¡Gracias por querer colaborar! Mira los pedidos y elige cómo puedes apoyar.'
            : intent === 'notices' ? 'Abre los avisos de tu barrio para ver novedades.'
              : 'Vamos a configurar tu ubicación para mostrarte resultados más cercanos.';
    setMessages(current => [...current, userMessage, newMessage('bot', replyText, intent === 'fallback' ? {} : { action: replies[intent] })]);
  }

  return <>
    {open && <section className="guide-panel" aria-label="Guía sencilla de AYNI">
      <header className="guide-header"><span className="guide-avatar"><Icon name="hands" size={20}/></span><div><b>Guía AYNI</b><small>Aprende haciendo · paso a paso</small></div><button type="button" className="icon-button" aria-label="Cerrar guía" onClick={() => setOpen(false)}><Icon name="close" size={18}/></button></header>
      <div className="guide-messages" ref={listRef} role="log" aria-live="polite" aria-relevant="additions">
        {messages.map(message => <div key={message.id} className={`guide-message ${message.from}`}>
          <span className="sr-only">{message.from === 'bot' ? 'Guía AYNI: ' : 'Tú: '}</span>
          <p className="guide-message-text">{message.text}</p>
          {message.action && <button type="button" className="guide-card-action" onClick={() => runAction(message.action!.key)}><Icon name={message.action.icon} size={17}/>{message.action.label}<Icon name="arrow" size={16}/></button>}
        </div>)}
        {messages.length === 1 && <div className="guide-home-actions" aria-label="Elige qué quieres hacer">
          {homeActions.map(action => <button type="button" className="guide-home-card" key={action.key} onClick={() => selectAction(action)}><span className="guide-home-icon"><Icon name={action.icon} size={18}/></span><span className="guide-home-copy"><b>{action.label}</b><small>{action.description}</small></span><Icon name="chevron" size={16}/></button>)}
        </div>}
      </div>
      <div className="guide-quick-actions" aria-label="Sugerencias rápidas">
        {homeActions.filter(action => ['nearby', 'ask', 'tutorial'].includes(action.key)).map(action => <button type="button" key={action.key} className="guide-chip" onClick={() => selectAction(action)}>{action.label}</button>)}
      </div>
      <form className="guide-input-row" onSubmit={send}><label className="sr-only" htmlFor="guide-question">Escribe una pregunta</label><input id="guide-question" value={input} onChange={event => setInput(event.target.value)} placeholder="¿En qué te ayudo?" maxLength={240}/><button type="submit" className="guide-send" aria-label="Enviar pregunta" disabled={!input.trim()}><Icon name="arrow" size={19}/></button></form>
      <p className="guide-privacy-note">Guía automática sencilla. Tus mensajes no salen de este dispositivo.</p>
    </section>}
    <button type="button" className={`guide-launcher ${open ? 'is-open' : ''}`} aria-label={open ? 'Cerrar guía AYNI' : 'Abrir guía AYNI'} aria-expanded={open} onClick={() => setOpen(value => !value)}>
      {open ? <Icon name="close" size={23}/> : <><Icon name="hands" size={22}/><span>¿Te ayudo?</span></>}
    </button>
    {tourIndex !== null && spotlight && <>
      <div className="guide-tour-shade" style={{ top: 0, left: 0, width: '100vw', height: spotlight.top }}/>
      <div className="guide-tour-shade" style={{ top: spotlight.top, left: 0, width: spotlight.left, height: spotlight.height }}/>
      <div className="guide-tour-shade" style={{ top: spotlight.top, left: spotlight.right, width: Math.max(0, window.innerWidth - spotlight.right), height: spotlight.height }}/>
      <div className="guide-tour-shade" style={{ top: spotlight.bottom, left: 0, width: '100vw', height: Math.max(0, window.innerHeight - spotlight.bottom) }}/>
      <div className="guide-spotlight" aria-hidden="true" style={{ top: spotlight.top, left: spotlight.left, width: spotlight.width, height: spotlight.height }}/>
      <section className="guide-tour-card" role="dialog" aria-live="polite" aria-label={`Guía AYNI, paso ${tourIndex + 1} de ${tutorial.length}`} data-placement={spotlight.placement} style={{ top: spotlight.tooltipTop, left: spotlight.tooltipLeft, width: spotlight.tooltipWidth }}>
        <div className="guide-tour-topline"><span>RECORRIDO AYNI</span><button type="button" onClick={() => endVisualTour(true)} aria-label="Salir del recorrido"><Icon name="close" size={17}/></button></div>
        <div className="guide-tour-progress"><i style={{ width: `${((tourIndex + 1) / tutorial.length) * 100}%` }}/></div>
        <span className="guide-tour-counter">PASO {tourIndex + 1} DE {tutorial.length}</span>
        <h2>{tutorial[tourIndex].title}</h2><p>{tutorial[tourIndex].text}</p>
        <div className="guide-tour-footer"><span><Icon name="pin" size={15}/> Mira lo resaltado</span><button type="button" className="guide-tour-next" onClick={nextVisualStep}>{tourIndex === tutorial.length - 1 ? 'Terminar' : 'Siguiente'}<Icon name={tourIndex === tutorial.length - 1 ? 'check' : 'arrow'} size={17}/></button></div>
      </section>
    </>}
  </>;
}
