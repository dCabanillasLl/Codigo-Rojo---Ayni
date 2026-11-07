import { AppError } from './http.js';

const blockedPatterns: Array<{ label: string; pattern: RegExp }> = [
  { label: 'drogas', pattern: /\b(droga|drogas|marihuana|cannabis|cocaina|crack|heroina|metanfetamina|extasis|mdma|lsd|fentanilo|pasta basica|pbc)\b/ },
  { label: 'alcohol', pattern: /\b(alcohol|cerveza|licor|vino|whisky|whiskey|ron|vodka|pisco|aguardiente|trago|bebida alcoholica|bebidas alcoholicas)\b/ },
  { label: 'dinero', pattern: /\b(dinero|efectivo|cash|plata|billetes?|yape|plin|transferencias?|depositos?|soles|dolares|prestamo de dinero|prestamo de plata|prestamo economico|prestamo financiero|prestame dinero|prestame plata|apoyo economico|aporte economico|ayuda economica|ayuda financiera|pago en efectivo)\b/ },
  { label: 'contenido sexual', pattern: /\b(sexo|sexual|sexuales|relaciones sexuales|servicios sexuales|servicio intimo|encuentro intimo|prostitucion|escort|porno|pornografia|pornografico|contenido erotico|contenido explicito|nudes?)\b/ },
];

function normalize(text: string) {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es').replace(/[^a-z0-9]+/g, ' ').trim();
}

export function assertAllowedRequestText(text: string): void {
  const normalized = normalize(text);
  const blocked = blockedPatterns.find(item => item.pattern.test(normalized));
  if (blocked) {
    throw new AppError(400, 'REQUEST_CONTENT_RESTRICTED',
      `AYNI no permite solicitudes relacionadas con ${blocked.label}. Edita el pedido para continuar.`);
  }
}

export function generateRequestTitle(text: string): string {
  const normalized = text.trim().replace(/\s+/g, ' ');
  const noGreeting = normalized.replace(/^(?:hola|buenas|buenos dias|buenas tardes)[,!\s]+/i, '');
  const concise = noGreeting.replace(/^(?:por favor[,\s]+)?(?:necesito|necesitamos|busco|quisiera|quiero pedir|me hace falta)\s+/i, '');
  const firstSentence = (concise || noGreeting || normalized).split(/[.!?\n]/)[0].trim();
  if (firstSentence.length <= 100) return firstSentence || 'Pedido de ayuda vecinal';
  const prefix = firstSentence.slice(0, 97);
  const boundary = prefix.lastIndexOf(' ');
  return `${prefix.slice(0, boundary > 55 ? boundary : 97).trimEnd()}…`;
}
