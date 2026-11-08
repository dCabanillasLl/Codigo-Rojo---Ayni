import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { config } from '../config.js';
import { AppError, asyncHandler } from '../lib/http.js';

const router = Router();
const requestSchema = z.object({
  messages: z.array(z.object({
    role: z.enum(['user', 'model']),
    text: z.string().trim().min(1).max(600),
  }).strict()).min(1).max(8),
}).strict();

const systemInstruction = `Eres la guía amable y sencilla de AYNI, una aplicación comunitaria peruana para conectar vecinos con productos, servicios, pedidos de ayuda, ofertas solidarias y avisos.
Responde en español claro, en un máximo de 3 frases cortas y con una acción concreta cuando sea posible. Usa palabras cotidianas y no supongas conocimientos técnicos.
Solo explica cómo usar AYNI y sus funciones. No inventes ofertas, vecinos, estados, precios, direcciones, ubicaciones ni información oficial. No tienes acceso a la cuenta ni a los datos en vivo; indica a la persona qué pantalla revisar.
AYNI no procesa pagos ni reemplaza a los servicios oficiales de emergencia. Nunca solicites ni repitas DNI, contraseña, códigos, dirección exacta u otros datos personales; recomienda no compartirlos en el chat.
No des instrucciones para conseguir drogas, alcohol, dinero a cambio, contenido sexual, actividades ilegales o peligrosas. Si te preguntan por algo ajeno a AYNI, responde brevemente que puedes ayudar con la aplicación.`;

const chatLimiter = rateLimit({
  windowMs: 60_000,
  limit: 12,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: { code: 'AI_RATE_LIMITED', message: 'Has enviado varias preguntas. Espera un minuto y vuelve a intentar.' } },
});

router.post('/assistant/chat', chatLimiter, asyncHandler(async (req, res) => {
  if (!config.geminiApiKey) throw new AppError(503, 'GEMINI_NOT_CONFIGURED', 'La guía inteligente todavía no está configurada.');
  const { messages } = requestSchema.parse(req.body);
  const firstUserIndex = messages.findIndex(message => message.role === 'user');
  if (firstUserIndex < 0) throw new AppError(400, 'USER_MESSAGE_REQUIRED', 'Escribe una pregunta para la guía.');
  const turns: Array<{ role: 'user' | 'model'; text: string }> = [];
  for (const message of messages.slice(firstUserIndex)) {
    const previous = turns.at(-1);
    if (previous?.role === message.role) previous.text += `\n${message.text}`;
    else turns.push({ ...message });
  }
  const contents = turns.map(message => ({ role: message.role, parts: [{ text: message.text }] }));

  let response: Response;
  try {
    response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.geminiModel)}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': config.geminiApiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemInstruction }] },
        contents,
        generationConfig: { temperature: 0.35, maxOutputTokens: 220 },
      }),
      signal: AbortSignal.timeout(12_000),
    });
  } catch {
    throw new AppError(503, 'GEMINI_UNAVAILABLE', 'La guía inteligente no está disponible por ahora. Puedes usar las opciones rápidas o intentarlo más tarde.');
  }

  if (!response.ok) {
    if (response.status === 429) throw new AppError(429, 'GEMINI_RATE_LIMITED', 'La guía recibió muchas preguntas. Espera un momento e inténtalo otra vez.');
    if (response.status === 401 || response.status === 403) throw new AppError(503, 'GEMINI_AUTH_FAILED', 'La clave de Gemini no fue aceptada. Revisa GEMINI_API_KEY en backend/.env y reinicia el backend.');
    throw new AppError(502, 'GEMINI_REQUEST_FAILED', 'No pudimos obtener una respuesta de Gemini. Inténtalo de nuevo.');
  }

  const payload = await response.json() as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> }; finishReason?: string }>;
  };
  const answer = payload.candidates?.[0]?.content?.parts?.map(part => part.text ?? '').join('').trim();
  if (!answer) throw new AppError(502, 'GEMINI_EMPTY_RESPONSE', 'No llegó una respuesta. Prueba con otra pregunta breve.');
  res.setHeader('Cache-Control', 'no-store');
  res.json({ data: { answer } });
}));

export default router;
