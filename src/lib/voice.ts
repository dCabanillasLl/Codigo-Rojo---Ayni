import { Capacitor, registerPlugin } from '@capacitor/core';

export const nativeVoice = () => Capacitor.getPlatform() === 'android';
export const AyniVoice = registerPlugin<{
  recognize(): Promise<{ text?: string; cancelled?: boolean }>;
  speak(options: { text: string }): Promise<void>;
  stopSpeaking(): Promise<void>;
}>('AyniVoice');

export function stopSpeaking() {
  window.speechSynthesis?.cancel();
  if (nativeVoice()) void AyniVoice.stopSpeaking().catch(() => {});
}

export async function speak(text: string): Promise<boolean> {
  if (!text.trim()) return false;
  try {
    if (nativeVoice()) {
      await AyniVoice.speak({ text });
    } else {
      if (!window.speechSynthesis || !window.SpeechSynthesisUtterance) return false;
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'es-PE';
      window.speechSynthesis.speak(utterance);
    }
    return true;
  } catch { return false; }
}
