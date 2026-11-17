import { useDictation } from '../lib/use-dictation';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { api } from '../lib/api';
import Icon, { type IconName } from './Icon';
import { speak } from './UI';

type Destination = 'cerca' | 'ayuda' | 'avisos';
type GuideAction = 'nearby' | 'ask' | 'offer' | 'service' | 'serviceSearch' | 'notice' | 'notices' | 'location' | 'tutorial';
type RequestDraft = { description: string; helpType: string; urgent: boolean; earthquake: boolean; emergencyNeeds: string[]; peopleCount?: number; locationQuery?: string };
type ServiceDraft = { title: string; description: string; categoryHint?: string };
type NoticeDraft = { title: string; content: string; categoryHint?: string; dateTime?: string; locationQuery?: string };
type MessageAction = { key: GuideAction; label: string; icon: IconName; requestDraft?: RequestDraft; serviceDraft?: ServiceDraft; noticeDraft?: NoticeDraft; searchQuery?: string };
type Message = { id: string; from: 'bot' | 'you'; text: string; action?: MessageAction };
type GuideBotProps = { onNavigate: (page: Destination) => void; onAsk: (draft?: RequestDraft) => void; onOffer: () => void; onOfferService: (draft?: ServiceDraft) => void; onFindService: (query: string) => void; onCreateNotice: (draft?: NoticeDraft) => void; onLocation: () => void };
type TourStep = { page: Destination; target: string; title: string; text: string };
type TourSpotlight = { top: number; left: number; width: number; height: number; right: number; bottom: number; tooltipTop: number; tooltipLeft: number; tooltipWidth: number; placement: 'above' | 'below' };

function normalizeAssistantText(text: string) {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es');
}

function isUrgentBloodRequest(text: string) {
  const normalized = normalizeAssistantText(text);
  return /donar sangre|donacion de sangre|necesito sangre|(?:necesito|necesitamos|requiero|requerimos|busco|se necesita|se necesitan)\s+(?:un(?:a)?\s+)?donantes?(?:\s+de sangre)?|busco donantes?/.test(normalized);
}

function isEarthquakeHelpRequest(text: string) {
  const normalized = normalizeAssistantText(text);
  return /temblor|sismo|terremoto/.test(normalized) && /necesit|ayuda|apoyo|viver|alimento|comida|agua|medicin|herid|atrapad|evacu|abrigo/.test(normalized);
}

function isServiceOffer(text: string) {
  const normalized = normalizeAssistantText(text);
  return /(?:ofrezco|brindo|realizo|dicto|doy|ensen|publico|hago|presto|me dedico a|quiero publicar|quiero ofrecer).{0,60}(?:servicio|clase|repar|tutoria|oficio|limpieza|jardin|gasfiter|electric|mudanza)/.test(normalized);
}

function isNoticeDraftIntent(text: string) {
  const normalized = normalizeAssistantText(text);
  return /quiero (?:publicar|crear|redactar|anunciar)|ayudame a (?:publicar|crear|redactar|anunciar)|(?:publica|crea|redacta|anuncia)r?\s+(?:un\s+)?aviso|^anuncio(?:\s|:)|convoca(?:r|mos)?|invito(?:\s|\b)|invitamos(?:\s|\b)|habra|se realizara|se llevara a cabo/.test(normalized);
}

function parseNoticeDateTime(text: string) {
  const normalized = normalizeAssistantText(text);
  const monthNames = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'setiembre', 'octubre', 'noviembre', 'diciembre'];
  let dateParts: { year: number; month: number; day: number } | undefined;
  const namedDate = normalized.match(/\b(\d{1,2})\s+de\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|setiembre|septiembre|octubre|noviembre|diciembre)(?:\s+de\s+(\d{4}))?\b/);
  const numericDate = normalized.match(/\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{4}))?\b/);
  if (namedDate) {
    const month = namedDate[2] === 'septiembre' ? 8 : monthNames.indexOf(namedDate[2]);
    let year = Number(namedDate[3] || new Date().getFullYear());
    const monthIndex = month;
    if (!namedDate[3] && new Date(year, monthIndex, Number(namedDate[1])) < new Date(new Date().setHours(0, 0, 0, 0))) year++;
    dateParts = { year, month: monthIndex, day: Number(namedDate[1]) };
  } else if (numericDate) {
    let year = Number(numericDate[3] || new Date().getFullYear());
    const monthIndex = Number(numericDate[2]) - 1;
    if (!numericDate[3] && new Date(year, monthIndex, Number(numericDate[1])) < new Date(new Date().setHours(0, 0, 0, 0))) year++;
    dateParts = { year, month: monthIndex, day: Number(numericDate[1]) };
  } else if (/\bmanana\b/.test(normalized)) {
    const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
    dateParts = { year: tomorrow.getFullYear(), month: tomorrow.getMonth(), day: tomorrow.getDate() };
  } else if (/\bhoy\b/.test(normalized)) {
    const today = new Date(); dateParts = { year: today.getFullYear(), month: today.getMonth(), day: today.getDate() };
  } else {
    const weekdays = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
    const weekdayMatch = normalized.match(/\b(?:este\s+|el\s+|proximo\s+)?(domingo|lunes|martes|miercoles|jueves|viernes|sabado)\b/);
    if (weekdayMatch) {
      const today = new Date();
      let daysAhead = (weekdays.indexOf(weekdayMatch[1]) - today.getDay() + 7) % 7;
      if (daysAhead === 0) daysAhead = 7;
      today.setDate(today.getDate() + daysAhead);
      dateParts = { year: today.getFullYear(), month: today.getMonth(), day: today.getDate() };
    }
  }
  if (!dateParts) return undefined;
  const time = normalized.match(/\b(?:a\s+las?|desde\s+las?)\s+(\d{1,2})(?::(\d{2}))?(?:\s*(am|pm|a\.?\s*m\.?|p\.?\s*m\.?))?(?=\s|$|[,;.!?])/);
  if (!time) return undefined;
  let hour = Number(time[1]);
  const minute = Number(time[2] || 0);
  const meridiem = time[3]?.replace(/\s|\./g, '');
  if (meridiem === 'pm' && hour < 12) hour += 12;
  if (meridiem === 'am' && hour === 12) hour = 0;
  if (hour > 23 || minute > 59) return undefined;
  const value = new Date(dateParts.year, dateParts.month, dateParts.day, hour, minute);
  if (value.getFullYear() !== dateParts.year || value.getMonth() !== dateParts.month || value.getDate() !== dateParts.day) return undefined;
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}T${String(value.getHours()).padStart(2, '0')}:${String(value.getMinutes()).padStart(2, '0')}`;
}

function parseNoticeLocation(text: string) {
  const match = text.match(/\b(?:en|lugar:|direccion:)\s+((?:el|la|los|las)\s+)?([^.!?]+)/i);
  if (!match) return undefined;
  return `${match[1] || ''}${match[2]}`.trim().replace(/\s+(?:a las|desde las)\b.*$/i, '').replace(/\s+/g, ' ') || undefined;
}

function basicReply(text: string) {
  const normalized = normalizeAssistantText(text).replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  if (/^(hola|holi|buenas|buenos dias|buenas tardes|buenas noches|que tal)$/.test(normalized)) {
    return '¡Hola! Puedo ayudarte a buscar cerca, preparar un pedido de ayuda, ofrecer apoyo, redactar un servicio o crear un aviso. También puedo mostrarte actividades y ayudarte con tu ubicación.';
  }
  if (/^(gracias|muchas gracias|te agradezco|ok gracias|listo gracias)$/.test(normalized)) {
    return '¡Con gusto! Aquí estoy si necesitas buscar algo, pedir ayuda o conocer otra función de AYNI.';
  }
  if (/^(que puedes hacer|para que sirves|como me ayudas|que haces)$/.test(normalized)) {
    return 'Puedo guiarte para buscar productos y servicios, preparar pedidos de ayuda, redactar una publicación de servicio, ofrecer apoyo, ver avisos y configurar tu ubicación. Dime qué necesitas con tus propias palabras.';
  }
  if (/^(como estas|estas ahi|me escuchas)$/.test(normalized)) {
    return '¡Sí, aquí estoy! Cuéntame qué necesitas o elige una de las opciones rápidas.';
  }
  if (/^(chau|adios|hasta luego|nos vemos)$/.test(normalized)) {
    return '¡Hasta luego! Cuando quieras, vuelvo a ayudarte con AYNI.';
  }
  return undefined;
}

const homeActions: Array<MessageAction & { description: string }> = [
  { key: 'nearby', label: 'Buscar cerca', description: 'Productos y servicios del barrio', icon: 'search' },
  { key: 'ask', label: 'Pedir ayuda', description: 'Cuenta qué necesitas', icon: 'hands' },
  { key: 'offer', label: 'Ofrecer ayuda', description: 'Apoya a un vecino', icon: 'heart' },
  { key: 'service', label: 'Publicar un servicio', description: 'Comparte lo que sabes hacer', icon: 'store' },
  { key: 'notice', label: 'Crear un aviso', description: 'Anuncia una actividad o campaña', icon: 'megaphone' },
  { key: 'notices', label: 'Ver avisos', description: 'Novedades del barrio', icon: 'megaphone' },
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

export default function GuideBot({ onNavigate, onAsk, onOffer, onOfferService, onFindService, onCreateNotice, onLocation }: GuideBotProps) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const [voiceError, setVoiceError] = useState('');
  const [messages, setMessages] = useState<Message[]>([
    newMessage('bot', '¡Hola! Soy tu guía de AYNI. Elige lo que quieres hacer y te acompaño paso a paso.'),
  ]);
  const [tourIndex, setTourIndex] = useState<number | null>(null);
  const [spotlight, setSpotlight] = useState<TourSpotlight | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const { recording, supported: Voice, toggle: dictate, cancel: cancelDictation } = useDictation(input, setInput, setVoiceError, 600);

  useEffect(() => () => { window.speechSynthesis?.cancel(); }, []);

  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTo({ top: list.scrollHeight, behavior: 'smooth' });
  }, [messages, open]);

  useEffect(() => {
    const field = inputRef.current;
    if (!field) return;
    field.style.height = 'auto';
    field.style.height = `${Math.min(field.scrollHeight, 120)}px`;
  }, [input]);

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
      const tooltipWidth = Math.min(400, window.innerWidth - 24);
      const tooltipHeight = 260;
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
    cancelDictation();
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

  function runAction(action: MessageAction) {
    const { key } = action;
    if (key === 'nearby') onNavigate('cerca');
    if (key === 'ask') onAsk(action.requestDraft);
    if (key === 'offer') onOffer();
    if (key === 'service') onOfferService(action.serviceDraft);
    if (key === 'serviceSearch') onFindService(action.searchQuery || 'servicio');
    if (key === 'notice') onCreateNotice(action.noticeDraft);
    if (key === 'notices') onNavigate('avisos');
    if (key === 'location') onLocation();
    if (key === 'tutorial') beginVisualTour();
  }

  function inferHelpType(text: string) {
    const normalized = normalizeAssistantText(text);
    if (isEarthquakeHelpRequest(text)) return 'Emergencia por sismo';
    if (isUrgentBloodRequest(text)) return 'Apoyo urgente — donación de sangre';
    if (/presta|prestamo|alquilar|alquiler|por (?:un|una|unos|unas) (?:dia|dias|hora|horas|rato)/.test(normalized)) return 'Préstamo temporal';
    if (/intercambi|cambio|a cambio de/.test(normalized)) return 'Intercambio';
    if (/articulo|objeto|herramienta|escalera|taladro|silla|mesa|carretilla|bicicleta|libro/.test(normalized)) return 'Préstamo o intercambio de un artículo';
    if (/acompan|cuid|visita|conversar|hacer compania/.test(normalized)) return 'Acompañamiento';
    if (/traslad|llevar|movilidad|transporte/.test(normalized)) return 'Traslado o movilidad';
    if (/repar|arregl|instal|constru/.test(normalized)) return 'Reparación o apoyo práctico';
    if (/comida|alimento|agua|medicina|medicamento|ropa|abrigo/.test(normalized)) return 'Bienes de primera necesidad';
    return 'Apoyo vecinal';
  }

  function prepareRequest(text: string) {
    const clean = text.trim().replace(/^(?:hola|buenas|por favor)[,\s!:]+/i, '');
    const earthquake = isEarthquakeHelpRequest(clean);
    const normalized = normalizeAssistantText(clean);
    const emergencyNeeds: string[] = [];
    if (earthquake) {
      if (/\bagua\b/.test(normalized)) emergencyNeeds.push('Agua');
      if (/viver|alimento|comida/.test(normalized)) emergencyNeeds.push('Alimentos');
      if (/medicin|medicamento/.test(normalized)) emergencyNeeds.push('Medicinas');
      if (/abrigo|ropa|frazada|manta/.test(normalized)) emergencyNeeds.push('Abrigo');
      if (/primeros auxilios|botiquin/.test(normalized)) emergencyNeeds.push('Primeros auxilios');
      if (/herid|lesionad/.test(normalized)) emergencyNeeds.push('Personas heridas');
      if (/atrapad/.test(normalized)) emergencyNeeds.push('Personas atrapadas');
      if (/evacu|salir del lugar/.test(normalized)) emergencyNeeds.push('Apoyo para evacuar');
      if (/adulto mayor|discapacidad|asistencia especial/.test(normalized)) emergencyNeeds.push('Asistencia especial');
    }
    const countMatch = clean.match(/\b(\d{1,3})\s+personas?\b/i) ?? clean.match(/\bpara\s+(\d{1,3})\s+personas?\b/i);
    const peopleCount = countMatch ? Math.max(1, Math.min(100, Number(countMatch[1]))) : undefined;
    const details = earthquake ? clean.split(/\b(?:necesito|necesitamos|necesita|necesitan|requiero|requerimos)\b/i)[0].trim() : clean;
    const description = details.charAt(0).toLocaleUpperCase('es') + details.slice(1);
    const urgent = isUrgentBloodRequest(clean);
    return { description, helpType: inferHelpType(clean), urgent: urgent || earthquake, earthquake, emergencyNeeds, peopleCount, locationQuery: parseNoticeLocation(clean) };
  }

  function prepareServiceSearch(text: string) {
    const normalized = normalizeAssistantText(text);
    if (/mover.{0,30}mueble|mudanza/.test(normalized)) return 'mudanza';
    if (/traslad|transport/.test(normalized)) return 'transporte';
    if (/limpieza/.test(normalized)) return 'limpieza';
    if (/repar|arreglar/.test(normalized)) return 'reparación';
    if (/instalar|instalación/.test(normalized)) return 'instalación';
    return text.trim()
      .replace(/^(?:necesito|necesitamos|busco|quiero contratar|requiero)\s+(?:ayuda\s+)?(?:para\s+)?/i, '')
      .split(/[.!?\n]/)[0]
      .replace(/\s+(?:a mi nuevo|en mi nuevo|a mi|en el|en la|en)\b.*$/i, '')
      .trim() || 'servicio';
  }

  function prepareService(text: string): ServiceDraft {
    const description = text.trim().replace(/^(?:hola|buenas|por favor)[,\s!:]+/i, '');
    let title = description
      .replace(/^(?:quiero publicar|quiero ofrecer|quisiera ofrecer|me gustaria ofrecer|publico|ofrezco|brindo|realizo|hago|dicto|ensen(?:o|ar)|presto|puedo ofrecer|me dedico a)\s+/i, '')
      .replace(/^(?:mis?\s+)?servicios?\s+(?:de|para)\s+/i, '')
      .split(/[.!?\n]/)[0].trim();
    if (!title) title = 'Servicio para el barrio';
    title = title.charAt(0).toLocaleUpperCase('es') + title.slice(1);
    const normalized = normalizeAssistantText(description);
    const categoryHint = /clase|ensen|tutoria|matematica|ingles|curso/.test(normalized) ? 'Clases y oficios'
      : /repar|arregl|mantenimiento|bicicleta|gasfiter|electric/.test(normalized) ? 'Reparaciones'
        : /comida|menu|postre|torta|alimento/.test(normalized) ? 'Alimentos'
          : /hogar|limpieza|jardin|mudanza/.test(normalized) ? 'Hogar' : undefined;
    return { title, description: description.charAt(0).toLocaleUpperCase('es') + description.slice(1), categoryHint };
  }

  function prepareNotice(text: string): NoticeDraft {
    const content = text.trim()
      .replace(/^(?:quiero\s+(?:publicar|crear|redactar|anunciar)|quisiera\s+anunciar|anuncio|aviso\s+para\s+(?:mis\s+)?vecinos)\s*[:,!-]?\s*/i, '')
      .replace(/^que\s+/i, '');
    const eventLead = content.match(/^\s*(?:este|el)\s+(?:lunes|martes|miercoles|jueves|viernes|sabado|domingo)\s+(?:habra|se realizara|se llevara a cabo)\s+(?:un[oa]?\s+)?(.+)/i);
    const titleBase = eventLead?.[1] || content.split(/\b(?:el\s+(?:lunes|martes|miercoles|jueves|viernes|sabado|domingo|\d{1,2}\s+de)|a\s+las|desde\s+las)\b/i)[0];
    let title = titleBase.split(/[.!?\n]/)[0].trim().replace(/^(?:un|una|el|la|que)\s+/i, '');
    if (title.length > 72) title = `${title.slice(0, 69).trimEnd()}…`;
    if (!title) title = 'Aviso para el barrio';
    title = title.charAt(0).toLocaleUpperCase('es') + title.slice(1);
    const normalized = normalizeAssistantText(content);
    const categoryHint = /campana|recoleccion|colecta|donacion/.test(normalized) ? 'Campañas'
      : /actividad|jornada|reunion|taller|festival|feria|celebracion|evento/.test(normalized) ? 'Actividades' : 'Aviso vecinal';
    return { title, content: content.charAt(0).toLocaleUpperCase('es') + content.slice(1), categoryHint, dateTime: parseNoticeDateTime(text), locationQuery: parseNoticeLocation(content) };
  }

  function selectAction(item: MessageAction & { description?: string }) {
    if (item.key === 'tutorial') { beginVisualTour(item.label); return; }
    setMessages(current => [...current, newMessage('you', item.label)]);
    const guidance: Record<Exclude<GuideAction, 'tutorial'>, string> = {
      nearby: 'Te muestro dónde encontrar cosas de tu barrio. Abre esta sección y toca una tarjeta para ver sus detalles.',
      ask: 'En unos pasos publicarás tu pedido. Escribe qué necesitas, revisa el texto y confirma.',
      offer: 'Aquí puedes leer lo que necesitan tus vecinos y elegir un pedido para ofrecer tu ayuda.',
      service: 'Cuéntame qué servicio ofreces y prepararé una publicación para que la revises.',
      serviceSearch: 'Voy a mostrarte servicios cercanos que podrían ayudarte.',
      notice: 'Cuéntame qué actividad, campaña o información quieres compartir y redactaré el aviso para que lo revises.',
      notices: 'Aquí encontrarás avisos y actividades compartidos por vecinos.',
      location: 'Configura tu ubicación para ordenar los resultados por cercanía. Tu dirección exacta permanece privada.',
    };
    setMessages(current => [...current, newMessage('bot', guidance[item.key as Exclude<GuideAction, 'tutorial'>], { action: { key: item.key, label: item.key === 'nearby' ? 'Ir a Cerca de mí' : item.key === 'ask' ? 'Crear un pedido' : item.key === 'offer' ? 'Explorar pedidos' : item.key === 'service' ? 'Redactar servicio' : item.key === 'serviceSearch' ? 'Buscar servicios' : item.key === 'notice' ? 'Crear aviso' : item.key === 'notices' ? 'Abrir avisos' : 'Configurar ubicación', icon: item.icon } })]);
  }

  function classify(text: string): GuideAction | 'fallback' {
    const normalized = normalizeAssistantText(text);
    if (/tutorial|ensename|como funciona|soy nuevo|guia/.test(normalized)) return 'tutorial';
    if (isNoticeDraftIntent(text)) return 'notice';
    if (/(?:necesit|busco|quiero contratar|requier).{0,70}(?:mover|mudanza|traslad|transportar|limpieza|reparar|instalar|gasfiter|electricista)/.test(normalized)) return 'serviceSearch';
    if (isServiceOffer(text)) return 'service';
    if (/ubicacion|zona|direccion|gps|cerca de mi/.test(normalized)) return 'location';
    if (/aviso|evento|noticia/.test(normalized)) return 'notices';
    if (/ofrec|colabor|ayudar a alguien|quiero ayudar/.test(normalized)) return 'offer';
    if (isEarthquakeHelpRequest(text) || isUrgentBloodRequest(text) || /pedir|necesit|requier|solicitud|me hace falta|nos hace falta|busco|quisiera|quiero (?:un|una|que)|me (?:pueden|podrian|podrias) (?:prestar|ayudar)|alguien (?:tiene|presta)|se me (?:rompio|malogro|acabo)/.test(normalized)) return 'ask';
    if (/buscar|producto|servicio|comprar|encontrar/.test(normalized)) return 'nearby';
    return 'fallback';
  }

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = input.trim();
    if (!value || thinking || recording) return;
    setInput('');
    const simpleAnswer = basicReply(value);
    if (simpleAnswer) {
      setMessages(current => [...current, newMessage('you', value), newMessage('bot', simpleAnswer)]);
      return;
    }
    const intent = classify(value);
    const userMessage = newMessage('you', value);
    if (intent === 'tutorial') {
      beginVisualTour(value);
      return;
    }
    if (intent === 'service') {
      const serviceDraft = prepareService(value);
      const categoryNote = serviceDraft.categoryHint ? ` Sugerí ${serviceDraft.categoryHint} como categoría.` : '';
      setMessages(current => [...current, userMessage, newMessage('bot', `Preparé un borrador de tu servicio.${categoryNote} Revisa el título, la descripción, el precio y la ubicación antes de publicarlo.`, { action: { key: 'service', label: 'Revisar publicación del servicio', icon: 'store', serviceDraft } })]);
      return;
    }
    if (intent === 'serviceSearch') {
      const searchQuery = prepareServiceSearch(value);
      setMessages(current => [...current, userMessage, newMessage('bot', `Entiendo que buscas un servicio para “${searchQuery}”. Te llevaré a Cerca de mí con el filtro de servicios aplicado para que revises las opciones publicadas por vecinos.`, { action: { key: 'serviceSearch', label: 'Buscar servicios cercanos', icon: 'search', searchQuery } })]);
      return;
    }
    if (intent === 'notice') {
      const noticeDraft = prepareNotice(value);
      const details = [
        `categoría ${noticeDraft.categoryHint}`,
        noticeDraft.dateTime ? 'fecha y hora detectadas' : 'completa la fecha y la hora',
        noticeDraft.locationQuery ? `lugar detectado: ${noticeDraft.locationQuery}; confirma una sugerencia para fijar el punto` : 'indica el lugar y selecciona el punto en el mapa',
      ].join('; ');
      setMessages(current => [...current, userMessage, newMessage('bot', `Preparé un borrador de aviso con título breve y contenido. Detecté ${details}. Revisa los datos antes de publicarlo.`, { action: { key: 'notice', label: 'Revisar aviso', icon: 'megaphone', noticeDraft } })]);
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
      ? ''
      : intent === 'nearby' ? '¡Vamos a buscar por tu zona! Abre Cerca de mí para ver las opciones disponibles.'
        : intent === 'ask' ? 'Te acompaño a crear tu pedido. Cuenta qué necesitas y revisa el texto antes de publicarlo.'
          : intent === 'offer' ? '¡Gracias por querer colaborar! Mira los pedidos y elige cómo puedes apoyar.'
            : intent === 'notices' ? 'Abre los avisos de tu barrio para ver novedades.'
              : 'Vamos a configurar tu ubicación para mostrarte resultados más cercanos.';
    if (intent === 'ask') {
      const requestDraft = prepareRequest(value);
      const urgencyNote = requestDraft.earthquake ? ` Activé el modo de emergencia por sismo${requestDraft.emergencyNeeds.length ? ` y marqué ${requestDraft.emergencyNeeds.join(', ').toLocaleLowerCase('es')}` : ''}${requestDraft.peopleCount ? ` para ${requestDraft.peopleCount} personas` : ''}.` : requestDraft.urgent ? ' Lo clasifiqué como Apoyo urgente para darle prioridad en AYNI.' : '';
      setMessages(current => [...current, userMessage, newMessage('bot', `Entendí lo que necesitas. Preparé la descripción y sugerí ${requestDraft.helpType.toLocaleLowerCase('es')}.${urgencyNote} Al abrir la plantilla podrás revisar el tipo y completar la ubicación; el título se genera automáticamente y el pedido no se publica hasta que tú lo confirmes.`, { action: { key: 'ask', label: 'Revisar borrador de ayuda', icon: 'hands', requestDraft } })]);
      return;
    }
    if (intent !== 'fallback') {
      setMessages(current => [...current, userMessage, newMessage('bot', replyText, { action: replies[intent] })]);
      return;
    }

    const history = [...messages, userMessage].slice(-8).map(message => ({
      role: message.from === 'you' ? 'user' as const : 'model' as const,
      text: message.text,
    }));
    setMessages(current => [...current, userMessage]);
    setThinking(true);
    try {
      const result = await api<{ answer: string }>('/assistant/chat', {
        method: 'POST',
        body: { messages: history },
        timeoutMs: 16_000,
      });
      setMessages(current => [...current, newMessage('bot', result.answer)]);
    } catch {
      setMessages(current => [...current, newMessage('bot', 'Aún no puedo responder esa pregunta. Prueba una opción rápida o pregúntame cómo buscar, pedir ayuda, ofrecer ayuda o ver avisos.')]);
    } finally {
      setThinking(false);
    }
  }

  return <>
    {open && <section className="guide-panel" aria-label="Guía sencilla de AYNI">
      <header className="guide-header"><span className="guide-avatar"><img src="/ayni-logo.png" alt=""/></span><div><b>Tu guía vecinal</b><small>Estoy aquí para ayudarte</small></div><button type="button" className="icon-button" aria-label="Cerrar guía" onClick={() => { cancelDictation(); window.speechSynthesis?.cancel(); setOpen(false); }}><Icon name="close" size={18}/></button></header>
      <div className="guide-messages" ref={listRef} role="log" aria-live="polite" aria-relevant="additions">
        {messages.map(message => <div key={message.id} className={`guide-message ${message.from}`}>
          <span className="sr-only">{message.from === 'bot' ? 'Guía AYNI: ' : 'Tú: '}</span>
          <p className="guide-message-text">{message.text}</p>
          {message.action && <button type="button" className="guide-card-action" onClick={() => runAction(message.action!)}><Icon name={message.action.icon} size={17}/>{message.action.label}<Icon name="arrow" size={16}/></button>}
          {message.from === 'bot' && message.text.length > 0 && <button type="button" className="guide-speech-action" disabled={recording} aria-label="Escuchar mensaje de AYNI" onClick={() => { if (!speak(message.text)) setVoiceError('La lectura en voz alta no está disponible en este navegador.'); }}><Icon name="headphones" size={16}/>Escuchar mensaje</button>}
        </div>)}
        {thinking && <div className="guide-message bot" role="status"><p className="guide-message-text">Estoy pensando cómo ayudarte…</p></div>}
        {messages.length === 1 && <div className="guide-home-actions" aria-label="Elige qué quieres hacer">
          {homeActions.map(action => <button type="button" className="guide-home-card" key={action.key} onClick={() => selectAction(action)}><span className="guide-home-icon"><Icon name={action.icon} size={18}/></span><span className="guide-home-copy"><b>{action.label}</b><small>{action.description}</small></span><Icon name="chevron" size={16}/></button>)}
        </div>}
      </div>
      <div className="guide-quick-actions" aria-label="Sugerencias rápidas">
        {homeActions.filter(action => ['nearby', 'ask', 'tutorial'].includes(action.key)).map(action => <button type="button" key={action.key} className="guide-chip" onClick={() => selectAction(action)}>{action.label}</button>)}
      </div>
      {recording && <p className="recording-message" role="status">Escuchando… Habla y pulsa Terminar dictado cuando acabes.</p>}
      {voiceError && <p className="guide-voice-error" role="status">{voiceError}</p>}
      <form className="guide-input-row" onSubmit={send}><label className="sr-only" htmlFor="guide-question">Escribe una pregunta o lo que necesitas</label><textarea ref={inputRef} id="guide-question" rows={1} value={input} onChange={event => { cancelDictation(); setInput(event.target.value); }} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} placeholder="Escribe lo que necesitas…" maxLength={600} disabled={thinking}/><button type="button" className="guide-voice-btn guide-read-input" aria-label="Escuchar texto escrito" title="Escuchar texto escrito" onClick={() => { if (!speak(input.trim())) setVoiceError(input.trim() ? 'La lectura en voz alta no está disponible en este navegador.' : 'Escribe un mensaje para poder escucharlo.'); }} disabled={recording || !input.trim() || thinking}><Icon name="headphones" size={18}/></button>{Voice && <button type="button" className={`guide-voice-btn ${recording ? 'is-recording' : ''}`} aria-label={recording ? 'Terminar dictado' : 'Dictar pregunta'} title={recording ? 'Terminar dictado' : 'Dictar pregunta'} onClick={dictate} disabled={thinking}><Icon name="mic" size={18}/></button>}<button type="submit" className="guide-send" aria-label="Enviar pregunta" disabled={recording || !input.trim() || thinking}><Icon name="arrow" size={19}/></button></form>
      <p className="guide-privacy-note">No escribas tu DNI, dirección ni contraseñas.</p>
    </section>}
    <button type="button" className={`guide-launcher ${open ? 'is-open' : ''}`} aria-label={open ? 'Cerrar guía AYNI' : 'Abrir guía AYNI'} aria-expanded={open} onClick={() => { cancelDictation(); window.speechSynthesis?.cancel(); setOpen(value => !value); }}>
      {open ? <Icon name="close" size={23}/> : <><Icon name="hands" size={22}/><span>¿Te ayudo?</span></>}
    </button>
    {tourIndex !== null && spotlight && <>
      <div className="guide-tour-shade" style={{ top: 0, left: 0, width: '100vw', height: spotlight.top + 1 }}/>
      <div className="guide-tour-shade" style={{ top: spotlight.top - 1, left: 0, width: spotlight.left + 1, height: spotlight.height + 2 }}/>
      <div className="guide-tour-shade" style={{ top: spotlight.top - 1, left: spotlight.right - 1, width: Math.max(0, window.innerWidth - spotlight.right + 1), height: spotlight.height + 2 }}/>
      <div className="guide-tour-shade" style={{ top: spotlight.bottom - 1, left: 0, width: '100vw', height: Math.max(0, window.innerHeight - spotlight.bottom + 1) }}/>
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
