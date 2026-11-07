import { useEffect, useRef, useState, type FormEvent } from 'react';
import Icon from './Icon';

type Destination = 'cerca' | 'ayuda' | 'avisos';
type Message = { id: number; from: 'bot' | 'you'; text: string };
type GuideBotProps = { onNavigate: (page: Destination) => void; onAsk: () => void; onOffer: () => void };

const quickQuestions = [
  { label: 'Buscar algo cerca', key: 'nearby' },
  { label: 'Pedir ayuda', key: 'ask' },
  { label: 'Ofrecer ayuda', key: 'offer' },
  { label: 'Ver avisos', key: 'notices' },
  { label: '¿Cómo funciona AYNI?', key: 'how' },
] as const;

export default function GuideBot({ onNavigate, onAsk, onOffer }: GuideBotProps) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([
    { id: 1, from: 'bot', text: '¡Hola! Soy la guía de AYNI. ¿Qué quieres hacer? Elige una opción y te llevo al lugar correcto.' },
  ]);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [messages, open]);

  function answer(key: string) {
    const item = quickQuestions.find(option => option.key === key);
    if (item) setMessages(current => [...current, { id: Date.now(), from: 'you', text: item.label }]);
    const replies: Record<string, string> = {
      nearby: 'En “Cerca de mí” puedes buscar productos y servicios de tu zona. Toca una tarjeta para ver detalles.',
      ask: 'Para pedir apoyo, escribe qué necesitas, elige tu sector y confirma. Si aún no iniciaste sesión, primero te pediré entrar.',
      offer: 'En “Ayuda vecinal”, abre un pedido del barrio y pulsa “Ofrecer mi ayuda”. Luego el vecino coordina contigo.',
      notices: 'En “Avisos” encontrarás información y actividades compartidas por vecinos.',
      how: 'AYNI conecta a personas del mismo barrio. Puedes encontrar algo, pedir apoyo u ofrecer lo que sabes o tienes. No hay pagos dentro de AYNI.',
      fallback: 'Puedo guiarte para buscar cerca, pedir u ofrecer ayuda, o ver avisos. Elige un botón y lo hacemos paso a paso.',
    };
    setMessages(current => [...current, { id: Date.now() + 1, from: 'bot', text: replies[key] || replies.fallback }]);
    if (key === 'nearby') onNavigate('cerca');
    if (key === 'notices') onNavigate('avisos');
    if (key === 'ask') onAsk();
    if (key === 'offer') onOffer();
  }

  function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = input.trim();
    if (!value) return;
    setInput('');
    const normalized = value.toLocaleLowerCase('es');
    setMessages(current => [...current, { id: Date.now(), from: 'you', text: value }]);
    const key = /aviso|evento|noticia/.test(normalized) ? 'notices'
      : /ofrec|colabor|ayudar a alguien/.test(normalized) ? 'offer'
      : /pedir|necesito|solicitud|ayuda/.test(normalized) ? 'ask'
      : /buscar|cerca|producto|servicio/.test(normalized) ? 'nearby' : 'fallback';
    window.setTimeout(() => answerFromText(key), 140);
  }

  function answerFromText(key: string) {
    const replies: Record<string, string> = {
      nearby: 'Para buscar, abre “Cerca de mí”. Allí puedes ver opciones de tu barrio.',
      ask: 'Para pedir ayuda, abre “Ayuda vecinal” y pulsa “Pedir ayuda”. Si hace falta, AYNI te pedirá iniciar sesión.',
      offer: 'Abre “Ayuda vecinal”, elige un pedido y pulsa “Ofrecer mi ayuda”.',
      notices: 'Abre “Avisos” para ver la información compartida en tu comunidad.',
      fallback: 'Todavía no entendí esa pregunta. Prueba con “buscar”, “pedir ayuda”, “ofrecer ayuda” o usa uno de los botones.',
    };
    setMessages(current => [...current, { id: Date.now(), from: 'bot', text: replies[key] || replies.fallback }]);
    if (key === 'nearby') onNavigate('cerca');
    if (key === 'notices') onNavigate('avisos');
    if (key === 'ask') onAsk();
    if (key === 'offer') onOffer();
  }

  return <>
    {open && <section className="guide-panel" aria-label="Guía sencilla de AYNI">
      <header className="guide-header"><span className="guide-avatar"><Icon name="hands" size={20}/></span><div><b>Guía AYNI</b><small>Te ayudo paso a paso</small></div><button type="button" className="icon-button" aria-label="Cerrar guía" onClick={() => setOpen(false)}><Icon name="close" size={18}/></button></header>
      <div className="guide-messages" ref={listRef} role="log" aria-live="polite" aria-relevant="additions">
        {messages.map(message => <p key={message.id} className={`guide-message ${message.from}`}><span className="sr-only">{message.from === 'bot' ? 'Guía AYNI: ' : 'Tú: '}</span>{message.text}</p>)}
      </div>
      <div className="guide-quick-actions" aria-label="Acciones rápidas">
        {quickQuestions.map(question => <button type="button" key={question.key} className="guide-chip" onClick={() => answer(question.key)}>{question.label}</button>)}
      </div>
      <form className="guide-input-row" onSubmit={send}><label className="sr-only" htmlFor="guide-question">Escribe una pregunta</label><input id="guide-question" value={input} onChange={event => setInput(event.target.value)} placeholder="Escribe una pregunta…" maxLength={240}/><button type="submit" className="guide-send" aria-label="Enviar pregunta" disabled={!input.trim()}><Icon name="arrow" size={19}/></button></form>
      <p className="guide-privacy-note">Guía automática sencilla. Tus mensajes no salen de este dispositivo.</p>
    </section>}
    <button type="button" className={`guide-launcher ${open ? 'is-open' : ''}`} aria-label={open ? 'Cerrar guía AYNI' : 'Abrir guía AYNI'} aria-expanded={open} onClick={() => setOpen(value => !value)}>
      {open ? <Icon name="close" size={23}/> : <><Icon name="hands" size={22}/><span>¿Te ayudo?</span></>}
    </button>
  </>;
}
