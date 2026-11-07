import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

export type Language = 'es' | 'en' | 'qu';
const words: Record<Language, Record<string, string>> = {
  es: { near:'Cerca de mí', help:'Ayuda vecinal', notices:'Avisos', profile:'Mi perfil', connected:'Con conexión', offline:'Sin conexión', language:'Idioma', save:'Guardar perfil', ask:'¿Qué necesitas?', describe:'Cuéntalo con tus palabras. Revisa el texto antes de publicarlo.', request:'Tu pedido', dictate:'Dictar mi pedido', listening:'Escuchando…', publish:'Confirmar y publicar pedido', later:'Guardar para enviar después', rank:'Rango vecinal', completed:'Ayudas completadas', languageNote:'El quechua sureño varía por comunidad; algunas etiquetas se muestran en español para evitar traducciones imprecisas.' },
  en: { near:'Near me', help:'Neighbor help', notices:'Notices', profile:'My profile', connected:'Online', offline:'Offline', language:'Language', save:'Save profile', ask:'What do you need?', describe:'Describe it in your own words. Review it before publishing.', request:'Your request', dictate:'Dictate my request', listening:'Listening…', publish:'Confirm and publish request', later:'Save to send later', rank:'Neighbor rank', completed:'Completed help', languageNote:'Some community-specific labels remain in Spanish.' },
  qu: { near:'Sispa wasi', help:'Yanapay', notices:'Willakuykuna', profile:'Ñuqap perfil', connected:'Tinkisqa', offline:'Mana tinkisqa', language:'Rimay', save:'Waqaychay', ask:'¿Imatam necesitanki?', describe:'Willay imayna kasqanta; manaraq willachkaspa qhawapay.', request:'Mañakuy', dictate:'Rimayta willay', listening:'Uyarichkan…', publish:'Kuska willachiy', later:'Qhipaman waqaychay', rank:'Wasi masiypa rango', completed:'Tukusqa yanapakuykuna', languageNote:'Quechua sureño: algunas etiquetas conservan el español para respetar variantes locales.' },
};
type LanguageState = { language: Language; setLanguage: (language: Language) => void; t: (key: string) => string };
const Context = createContext<LanguageState | null>(null);
export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageValue] = useState<Language>(() => {
    try { const saved = localStorage.getItem('ayni-language'); return saved === 'en' || saved === 'qu' ? saved : 'es'; } catch { return 'es'; }
  });
  const setLanguage = (value: Language) => { setLanguageValue(value); try { localStorage.setItem('ayni-language', value); } catch { /* Preference persistence is optional. */ } };
  const value = useMemo(() => ({ language, setLanguage, t: (key: string) => words[language][key] ?? words.es[key] ?? key }), [language]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useLanguage() { const value = useContext(Context); if (!value) throw new Error('LanguageProvider missing'); return value; }
