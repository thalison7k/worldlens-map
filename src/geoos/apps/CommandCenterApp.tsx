import { useCallback, useState } from "react";
import { Activity, AlertTriangle, Flame, Droplets, Zap, Users } from "lucide-react";
import { useBus } from "@/geoos/core/useBus";
import type { TimelineRange } from "@/geoos/core/bus";

const KPIS = [
  { icon: AlertTriangle, label: "Alertas ativos", value: 42, delta: "+6", accent: "0 70% 60%" },
  { icon: Flame, label: "Focos de incêndio", value: 18, delta: "+2", accent: "20 90% 60%" },
  { icon: Droplets, label: "Áreas de risco hídrico", value: 7, delta: "-1", accent: "200 85% 60%" },
  { icon: Zap, label: "Sensores online", value: "3 214", delta: "99,4%", accent: "50 90% 60%" },
  { icon: Users, label: "Equipes em campo", value: 24, delta: "+3", accent: "155 60% 55%" },
  { icon: Activity, label: "Ocorrências (24h)", value: 189, delta: "+11", accent: "265 80% 70%" },
];

const FEED = [
  { time: "14:22", label: "Queimada detectada — Amazonas", level: "critical" },
  { time: "14:15", label: "Nível do rio Tietê subindo 12 cm/h", level: "warn" },
  { time: "14:07", label: "Sensor IoT 8821 recalibrado", level: "info" },
  { time: "13:58", label: "Drone DR-14 concluiu sobrevoo", level: "info" },
  { time: "13:41", label: "Alerta AQI ultrapassa 180 — Osasco", level: "warn" },
  { time: "13:22", label: "Nova ocorrência: alagamento — Bairro Norte", level: "critical" },
];

export default function CommandCenterApp() {
  const [tl, setTl] = useState<{ t: number; range: TimelineRange } | null>(null);
  useBus(
    "timeline.change",
    useCallback((p: { t: number; range: TimelineRange }) => setTl(p), []),
  );
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-white/10 px-5 py-3">
        <div>
          <h3 className="text-sm font-semibold">Command Center</h3>
          <p className="text-xs text-white/50">
            {tl ? `Janela temporal: ${tl.range} · t=${tl.t}` : "Operação em tempo real · última atualização há 3s"}
          </p>
        </div>
        <span className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] text-white/70">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
          Realtime
        </span>
      </div>

      <div className="grid grid-cols-3 gap-3 border-b border-white/10 p-4">
        {KPIS.map((k) => (
          <div key={k.label} className="rounded-xl border border-white/10 bg-white/5 p-3">
            <div className="flex items-center justify-between">
              <k.icon className="h-4 w-4" style={{ color: `hsl(${k.accent})` }} />
              <span className="text-[10px] uppercase tracking-wider text-white/40">{k.delta}</span>
            </div>
            <div className="mt-2 text-xl font-semibold text-white">{k.value}</div>
            <div className="text-[11px] text-white/50">{k.label}</div>
          </div>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <div className="mb-2 text-[10px] uppercase tracking-wider text-white/40">Feed de eventos</div>
        <div className="space-y-1">
          {FEED.map((f, i) => (
            <div key={i} className="flex items-start gap-3 rounded-lg border border-white/5 bg-white/[0.03] px-3 py-2 text-xs">
              <span className="mt-0.5 font-mono text-white/40">{f.time}</span>
              <span
                className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full"
                style={{
                  background:
                    f.level === "critical" ? "hsl(0 70% 60%)" : f.level === "warn" ? "hsl(45 90% 60%)" : "hsl(200 60% 60%)",
                }}
              />
              <span className="text-white/80">{f.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
