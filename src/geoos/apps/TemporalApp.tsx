import { useState } from "react";
import { Sparkles, Play, Pause, SkipBack } from "lucide-react";
import { bus, type TimelineRange } from "@/geoos/core/bus";

const RANGES: { id: TimelineRange; label: string }[] = [
  { id: "today", label: "Hoje" },
  { id: "24h", label: "24h" },
  { id: "7d", label: "7 dias" },
  { id: "30d", label: "30 dias" },
  { id: "12m", label: "12 meses" },
  { id: "years", label: "Anos" },
];

export default function TemporalApp() {
  const [range, setRange] = useState<TimelineRange>("7d");
  const [t, setT] = useState(100);
  const [playing, setPlaying] = useState(false);

  function emit(nextT: number, nextRange: TimelineRange = range) {
    bus.emit("timeline.change", { t: nextT, range: nextRange });
  }

  function onRange(id: TimelineRange) {
    setRange(id);
    emit(t, id);
  }
  function onSlider(v: number) {
    setT(v);
    emit(v);
  }

  // simple play loop via bus tick — decoupled from map/analytics
  function togglePlay() {
    setPlaying((p) => {
      const next = !p;
      if (next) {
        const iv = setInterval(() => {
          setT((cur) => {
            const nv = cur >= 100 ? 0 : cur + 2;
            emit(nv);
            return nv;
          });
        }, 250);
        (window as unknown as { __temporalIv?: number }).__temporalIv = iv as unknown as number;
      } else {
        const w = window as unknown as { __temporalIv?: number };
        if (w.__temporalIv) clearInterval(w.__temporalIv);
      }
      return next;
    });
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-white/10 px-5 py-3">
        <Sparkles className="h-4 w-4 text-[color:var(--geoos-accent)]" />
        <h3 className="text-sm font-semibold">Temporal Engine</h3>
        <span className="ml-auto rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-white/50">
          {range} · t={t}
        </span>
      </div>
      <div className="flex flex-wrap gap-1 border-b border-white/10 p-3">
        {RANGES.map((r) => (
          <button
            key={r.id}
            onClick={() => onRange(r.id)}
            className={`rounded-full border px-3 py-1 text-[11px] transition ${
              range === r.id
                ? "border-[color:var(--geoos-accent)]/60 bg-[color:var(--geoos-accent)]/15 text-white"
                : "border-white/10 bg-white/5 text-white/70 hover:bg-white/10"
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>
      <div className="flex-1 p-5">
        <input
          type="range"
          min={0}
          max={100}
          value={t}
          onChange={(e) => onSlider(Number(e.target.value))}
          className="w-full accent-[color:var(--geoos-accent)]"
        />
        <div className="mt-2 flex justify-between font-mono text-[10px] text-white/40">
          <span>início</span>
          <span>agora</span>
        </div>
      </div>
      <div className="flex items-center gap-2 border-t border-white/10 p-3">
        <button
          onClick={() => onSlider(0)}
          className="grid h-8 w-8 place-items-center rounded-lg border border-white/10 bg-white/5 text-white/70 hover:bg-white/10"
        >
          <SkipBack className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={togglePlay}
          className="grid h-8 w-8 place-items-center rounded-lg border border-[color:var(--geoos-accent)]/40 bg-[color:var(--geoos-accent)]/15 text-white hover:bg-[color:var(--geoos-accent)]/25"
        >
          {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
        </button>
        <p className="ml-2 text-[11px] text-white/50">
          Todos os apps assinantes (Mapa, Command Center, Analysis) se atualizam via Event Bus.
        </p>
      </div>
    </div>
  );
}
