/**
 * Voz do Geo AI — síntese de fala (Web Speech API) em português do Brasil.
 *
 * Usada para leitura das análises ambientais em campo, onde o operador precisa
 * tomar decisões sem olhar a tela. Converte a resposta estruturada do agente
 * (## RESUMO / ## RISCOS / ## RECOMENDACOES) num texto falado limpo.
 */
const VOICE_KEY = "geoos.ai.voice";

export function speechSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

export function isVoiceEnabled(): boolean {
  try {
    return localStorage.getItem(VOICE_KEY) === "1";
  } catch {
    return false;
  }
}

export function setVoiceEnabled(on: boolean) {
  try {
    localStorage.setItem(VOICE_KEY, on ? "1" : "0");
  } catch {
    /* noop */
  }
  if (!on) stopSpeech();
}

function pickVoice(): SpeechSynthesisVoice | null {
  if (!speechSupported()) return null;
  const voices = window.speechSynthesis.getVoices();
  return (
    voices.find((v) => /pt[-_]BR/i.test(v.lang) && /google|natural|neural/i.test(v.name)) ??
    voices.find((v) => /pt[-_]BR/i.test(v.lang)) ??
    voices.find((v) => /^pt/i.test(v.lang)) ??
    null
  );
}

/** Remove marcações e ruído visual para a leitura ficar natural. */
export function speechText(raw: string, opts: { onlyDecision?: boolean } = {}): string {
  const clean = raw
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[*_`>|]/g, " ")
    .replace(/\p{Extended_Pictographic}/gu, " ");

  const sections = new Map<string, string>();
  let current = "";
  for (const line of clean.split("\n")) {
    const h = line.match(/^##\s*([A-ZÁÉÍÓÚÂÊÔÃÕÇ]+)\s*:?\s*(.*)$/i);
    if (h) {
      current = h[1].toUpperCase();
      sections.set(current, h[2] ? `${h[2]} ` : "");
      continue;
    }
    if (current) sections.set(current, (sections.get(current) ?? "") + line.replace(/^\s*-\s*/, " ") + " ");
  }

  if (sections.size === 0) return clean.replace(/\s+/g, " ").trim();

  const order = opts.onlyDecision
    ? ["RESUMO", "RISCOS", "RECOMENDACOES", "CRITICIDADE"]
    : ["RESUMO", "SITUACAO", "RISCOS", "RECOMENDACOES", "CRITICIDADE", "CONFIANCA"];
  const titles: Record<string, string> = {
    RESUMO: "Resumo.",
    SITUACAO: "Situação.",
    RISCOS: "Riscos.",
    RECOMENDACOES: "Recomendações.",
    CRITICIDADE: "Criticidade:",
    CONFIANCA: "Confiança:",
  };

  return order
    .filter((k) => sections.get(k)?.trim())
    .map((k) => `${titles[k]} ${sections.get(k)!.replace(/\s+/g, " ").trim()}`)
    .join(" ")
    .trim();
}

export function stopSpeech() {
  if (speechSupported()) window.speechSynthesis.cancel();
}

export function isSpeaking(): boolean {
  return speechSupported() && window.speechSynthesis.speaking;
}

/** Fala um texto em pt-BR; devolve true se a fala foi iniciada. */
export function speak(text: string, opts: { rate?: number; onEnd?: () => void } = {}): boolean {
  if (!speechSupported()) return false;
  const body = text.trim();
  if (!body) return false;
  stopSpeech();
  const u = new SpeechSynthesisUtterance(body.slice(0, 4000));
  const v = pickVoice();
  if (v) u.voice = v;
  u.lang = v?.lang ?? "pt-BR";
  u.rate = opts.rate ?? 1.03;
  u.pitch = 1;
  u.volume = 1;
  u.onend = () => opts.onEnd?.();
  u.onerror = () => opts.onEnd?.();
  window.speechSynthesis.speak(u);
  return true;
}
