import { useEffect, useRef, useState } from 'react';

type ResultEvent = { results: { length: number; [index: number]: { [index: number]: { transcript: string } } } };
type Recognition = {
  lang: string; continuous: boolean; interimResults: boolean;
  onresult: ((event: ResultEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void; stop: () => void; abort: () => void;
};
type VoiceWindow = Window & { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };

export function useDictation(value: string, onChange: (text: string) => void, onError: (message: string) => void, maxLength: number) {
  const [recording, setRecording] = useState(false);
  const sessionRef = useRef<Recognition | null>(null);
  const callbacks = useRef({ onChange, onError });
  callbacks.current = { onChange, onError };
  const Voice = (window as VoiceWindow).SpeechRecognition || (window as VoiceWindow).webkitSpeechRecognition;

  function cancel() {
    const session = sessionRef.current;
    sessionRef.current = null;
    if (session) {
      session.onresult = session.onerror = session.onend = null;
      session.abort();
    }
    setRecording(false);
  }

  useEffect(() => () => {
    const session = sessionRef.current;
    sessionRef.current = null;
    if (session) {
      session.onresult = session.onerror = session.onend = null;
      session.abort();
    }
  }, []);

  function toggle() {
    if (sessionRef.current) { sessionRef.current.stop(); return; }
    if (!Voice) { callbacks.current.onError('El dictado no está disponible en este navegador. Puedes escribir tu pedido.'); return; }
    callbacks.current.onError('');
    const base = value.trim();
    let received = false;
    let failed = false;
    try {
      window.speechSynthesis?.cancel();
      const session = new Voice();
      sessionRef.current = session;
      session.lang = 'es-PE';
      session.continuous = true;
      session.interimResults = true;
      session.onresult = event => {
        if (sessionRef.current !== session) return;
        // Results are a snapshot: replace interim hypotheses rather than appending them.
        const text = Array.from({ length: event.results.length }, (_, i) => event.results[i][0]?.transcript || '').join(' ').replace(/\s+/g, ' ').trim();
        if (!text) return;
        received = true;
        callbacks.current.onChange([base, text].filter(Boolean).join(' ').slice(0, maxLength));
      };
      session.onerror = event => {
        if (sessionRef.current !== session) return;
        failed = true;
        const messages: Record<string, string> = {
          'not-allowed': 'Permite el acceso al micrófono en el navegador para dictar.',
          'service-not-allowed': 'El navegador no permite el reconocimiento de voz. Prueba otro navegador o escribe el pedido.',
          'audio-capture': 'No se encuentra un micrófono disponible. Revisa su conexión y permisos.',
          'network': 'Se perdió la conexión del reconocimiento de voz. Revisa internet e intenta de nuevo.',
          'no-speech': 'No se detectó voz. Acércate al micrófono e intenta de nuevo.',
        };
        callbacks.current.onError(messages[event.error] || 'No pudimos reconocer la voz. Intenta de nuevo o escribe el pedido.');
        sessionRef.current = null;
        session.onresult = session.onerror = session.onend = null;
        session.abort();
        setRecording(false);
      };
      session.onend = () => {
        if (sessionRef.current !== session) return;
        sessionRef.current = null;
        setRecording(false);
        if (!received && !failed) callbacks.current.onError('No se detectó texto. Revisa el micrófono y vuelve a dictar.');
      };
      setRecording(true);
      session.start();
    } catch {
      cancel();
      callbacks.current.onError('El micrófono no está disponible. Revisa los permisos e intenta de nuevo.');
    }
  }
  return { recording, supported: Boolean(Voice), toggle, cancel };
}
