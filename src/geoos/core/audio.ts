/**
 * Motor de áudio dos alertas — sons sintetizados via Web Audio API.
 *
 * Sem arquivos externos: cada nível de severidade tem um timbre próprio
 * (crítico = sirene dupla descendente, alto = bipe duplo, moderado = ping).
 * O estado de mudo é persistido em localStorage e vale para todo o GeoOS.
 */
export type AlertTone = "critico" | "alto" | "moderado" | "ok";

const MUTE_KEY = "geoos.audio.muted";
const VOL_KEY = "geoos.audio.volume";

let ctx: AudioContext | null = null;

function audioCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!ctx) ctx = new Ctor();
  if (ctx.state === "suspended") void ctx.resume().catch(() => undefined);
  return ctx;
}

export function isMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

export function setMuted(muted: boolean) {
  try {
    localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
  } catch {
    /* noop */
  }
}

export function getVolume(): number {
  try {
    const v = Number(localStorage.getItem(VOL_KEY));
    return Number.isFinite(v) && v > 0 && v <= 1 ? v : 0.35;
  } catch {
    return 0.35;
  }
}

export function setVolume(v: number) {
  try {
    localStorage.setItem(VOL_KEY, String(Math.min(1, Math.max(0, v))));
  } catch {
    /* noop */
  }
}

/** Toca uma nota simples com envelope suave (evita cliques). */
function note(
  ac: AudioContext,
  opts: { freq: number; start: number; dur: number; gain: number; type?: OscillatorType; sweepTo?: number },
) {
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = opts.type ?? "sine";
  const t0 = ac.currentTime + opts.start;
  osc.frequency.setValueAtTime(opts.freq, t0);
  if (opts.sweepTo) osc.frequency.exponentialRampToValueAtTime(Math.max(40, opts.sweepTo), t0 + opts.dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, opts.gain), t0 + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + opts.dur);
  osc.connect(g).connect(ac.destination);
  osc.start(t0);
  osc.stop(t0 + opts.dur + 0.05);
}

/** Emite o som correspondente ao nível de severidade do alerta. */
export function playAlertSound(tone: AlertTone) {
  if (isMuted()) return;
  const ac = audioCtx();
  if (!ac) return;
  const v = getVolume();

  switch (tone) {
    case "critico":
      // sirene dupla, timbre agressivo
      note(ac, { freq: 880, sweepTo: 440, start: 0, dur: 0.42, gain: v, type: "sawtooth" });
      note(ac, { freq: 880, sweepTo: 440, start: 0.5, dur: 0.42, gain: v, type: "sawtooth" });
      note(ac, { freq: 1320, start: 0, dur: 0.12, gain: v * 0.4, type: "square" });
      break;
    case "alto":
      note(ac, { freq: 740, start: 0, dur: 0.18, gain: v * 0.85, type: "triangle" });
      note(ac, { freq: 590, start: 0.22, dur: 0.2, gain: v * 0.85, type: "triangle" });
      break;
    case "moderado":
      note(ac, { freq: 620, start: 0, dur: 0.16, gain: v * 0.6 });
      break;
    case "ok":
      note(ac, { freq: 520, start: 0, dur: 0.1, gain: v * 0.4 });
      note(ac, { freq: 780, start: 0.1, dur: 0.14, gain: v * 0.4 });
      break;
  }
}

/** Desperta o contexto de áudio a partir de um gesto do usuário (iOS/Android). */
export function unlockAudio() {
  const ac = audioCtx();
  if (ac && ac.state === "suspended") void ac.resume().catch(() => undefined);
}
