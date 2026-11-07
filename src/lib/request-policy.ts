type Rule = { label: string; terms: string[]; phrases?: string[]; typoTolerant?: string[] };

const rules: Rule[] = [
  { label: 'drogas', terms: ['droga', 'drogas', 'marihuana', 'cannabis', 'cocaina', 'crack', 'heroina', 'metanfetamina', 'extasis', 'mdma', 'lsd', 'fentanilo', 'ketamina', 'anfetamina', 'opio', 'tusi', 'perico'], typoTolerant: ['drogas', 'marihuana', 'cannabis', 'cocaina', 'heroina', 'metanfetamina', 'extasis', 'fentanilo', 'ketamina', 'anfetamina'] },
  { label: 'alcohol', terms: ['alcohol', 'cerveza', 'licor', 'vino', 'whisky', 'whiskey', 'ron', 'vodka', 'pisco', 'aguardiente', 'trago'], phrases: ['bebida alcoholica', 'bebidas alcoholicas'], typoTolerant: ['alcohol', 'cerveza', 'aguardiente'] },
  { label: 'dinero', terms: ['dinero', 'efectivo', 'cash', 'plata', 'billete', 'billetes', 'yape', 'plin', 'transferencia', 'transferencias', 'deposito', 'depositos', 'soles', 'dolares'], phrases: ['prestamo de dinero', 'prestamo de plata', 'prestamo economico', 'prestamo financiero', 'prestame dinero', 'prestame plata', 'apoyo economico', 'aporte economico', 'ayuda economica', 'ayuda financiera', 'pago en efectivo'] },
  { label: 'contenido sexual', terms: ['sexo', 'sexual', 'sexuales', 'prostitucion', 'prostituta', 'prostitutas', 'prostituto', 'prostitutos', 'escort', 'porno', 'pornografia', 'pornografico', 'nude', 'nudes', 'desnudo', 'desnudos', 'desnuda', 'desnudas', 'onlyfans'], phrases: ['relaciones sexuales', 'servicios sexuales', 'servicio intimo', 'encuentro intimo', 'contenido erotico', 'contenido explicito', 'trabajo sexual', 'trabajadora sexual', 'trabajador sexual', 'masaje erotico', 'masaje sensual', 'only fans'], typoTolerant: ['sexual', 'sexuales', 'prostitucion', 'prostituta', 'prostituto', 'pornografia', 'pornografico', 'desnudos', 'desnudas'] },
];

function normalize(text: string) {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es')
    .replace(/[013457@$]/g, value => ({ '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', '$': 's' })[value] || value)
    .replace(/[^a-z0-9\s]/g, '')
    .trim();
}

function distanceAtMostOne(left: string, right: string): boolean {
  if (Math.abs(left.length - right.length) > 1) return false;
  if (left.length === right.length) {
    for (let index = 0; index < left.length - 1; index += 1) {
      if (left[index] !== right[index] && left[index] === right[index + 1] && left[index + 1] === right[index]
        && left.slice(0, index) === right.slice(0, index) && left.slice(index + 2) === right.slice(index + 2)) return true;
    }
  }
  let a = 0; let b = 0; let edits = 0;
  while (a < left.length && b < right.length) {
    if (left[a] === right[b]) { a += 1; b += 1; continue; }
    edits += 1;
    if (edits > 1) return false;
    if (left.length > right.length) a += 1;
    else if (right.length > left.length) b += 1;
    else { a += 1; b += 1; }
  }
  return edits + Number(a < left.length || b < right.length) <= 1;
}

export function blockedRequestReason(text: string): string | undefined {
  const normalized = normalize(text);
  const words = normalized.split(/\s+/).filter(Boolean);
  for (const rule of rules) {
    if (rule.phrases?.some(phrase => (` ${normalized} `).includes(` ${phrase} `))) {
      return `AYNI no permite solicitudes relacionadas con ${rule.label}. Edita el pedido para continuar.`;
    }
    const candidates = words.flatMap(word => [word, word.replace(/(.)\1+/g, '$1')]);
    // Catch intentionally spaced spellings such as "s e x o" without fuzzy matching whole sentences.
    for (let start = 0; start < words.length; start += 1) {
      let joined = '';
      for (let end = start; end < Math.min(words.length, start + 8); end += 1) {
        joined += words[end];
        if (joined.length >= 3 && joined.length <= 18) candidates.push(joined, joined.replace(/(.)\1+/g, '$1'));
      }
    }
    for (const candidate of candidates) {
      if (rule.terms.includes(candidate)) return `AYNI no permite solicitudes relacionadas con ${rule.label}. Edita el pedido para continuar.`;
      if (candidate.length >= 6 && rule.typoTolerant?.some(term => distanceAtMostOne(candidate, term))) {
        return `AYNI no permite solicitudes relacionadas con ${rule.label}. Revisa la palabra “${candidate}”.`;
      }
    }
  }
  return undefined;
}

export function requestTitle(text: string): string {
  const normalized = text.trim().replace(/\s+/g, ' ');
  const noGreeting = normalized.replace(/^(?:hola|buenas|buenos dias|buenas tardes)[,!\s]+/i, '');
  const concise = noGreeting.replace(/^(?:por favor[,\s]+)?(?:necesito|necesitamos|busco|quisiera|quiero pedir|me hace falta)\s+/i, '');
  const firstSentence = (concise || noGreeting || normalized).split(/[.!?\n]/)[0].trim();
  if (firstSentence.length <= 100) return firstSentence || 'Pedido de ayuda vecinal';
  const prefix = firstSentence.slice(0, 97);
  const boundary = prefix.lastIndexOf(' ');
  return `${prefix.slice(0, boundary > 55 ? boundary : 97).trimEnd()}…`;
}
