import { Compass, Square, Circle, Slash, MapPin } from "lucide-react";
import { bus } from "@/geoos/core/bus";

const TOOLS = [
  { id: "point", icon: MapPin, label: "Ponto" },
  { id: "line", icon: Slash, label: "Linha" },
  { id: "poly", icon: Square, label: "Polígono / Retângulo" },
  { id: "circle", icon: Circle, label: "Círculo" },
];

const METRICS = [
  { label: "Área", value: "12,4 km²" },
  { label: "Perímetro", value: "14,8 km" },
  { label: "População estimada", value: "48 210" },
  { label: "Ocorrências", value: "127" },
  { label: "Vegetação (NDVI)", value: "0,62" },
  { label: "Temperatura média", value: "27,4 °C" },
  { label: "Qualidade do ar", value: "AQI 42" },
  { label: "Sensores IoT", value: "38" },
  { label: "Hospitais", value: "3" },
  { label: "Escolas", value: "11" },
  { label: "Postes", value: "820" },
  { label: "Rodovias", value: "18,2 km" },
];

export default function AnalysisApp() {
  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-white/10 px-5 py-4">
        <div className="flex items-center gap-2">
          <Compass className="h-4 w-4 text-[color:var(--geoos-accent)]" />
          <h3 className="text-sm font-semibold">Analysis Engine</h3>
        </div>
        <p className="mt-1 text-xs text-white/50">Desenhe uma região para análise territorial completa.</p>
      </div>

      <div className="grid grid-cols-2 gap-2 border-b border-white/10 p-3">
        {TOOLS.map(({ id, icon: Icon, label }) => (
          <button
            key={id}
            onClick={() => {
              bus.emit("filters.change", { key: "analysis.tool", value: id });
              bus.emit("analysis.result", {
                region: `demo:${id}`,
                metrics: Object.fromEntries(METRICS.map((m) => [m.label, m.value])),
              });
              bus.emit("notify", { title: "Análise atualizada", message: `Ferramenta: ${label}`, level: "info" });
            }}
            className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs hover:bg-white/10"
          >
            <Icon className="h-3.5 w-3.5" />
            <span>{label}</span>
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <div className="mb-3 text-[10px] uppercase tracking-wider text-white/40">Resumo executivo · região demo</div>
        <div className="grid grid-cols-2 gap-2">
          {METRICS.map((m) => (
            <div key={m.label} className="rounded-lg border border-white/10 bg-white/5 p-3">
              <div className="text-[10px] uppercase tracking-wide text-white/40">{m.label}</div>
              <div className="mt-1 text-sm font-semibold text-white/90">{m.value}</div>
            </div>
          ))}
        </div>
        <div className="mt-4 rounded-lg border border-[color:var(--geoos-accent)]/30 bg-[color:var(--geoos-accent)]/10 p-3 text-xs text-white/80">
          Nota de risco ambiental: <span className="font-semibold text-white">72 / 100</span> — categoria alta.
          Recomenda-se ampliar cobertura de drenagem e monitoramento de queimadas na porção norte.
        </div>
      </div>
    </div>
  );
}
