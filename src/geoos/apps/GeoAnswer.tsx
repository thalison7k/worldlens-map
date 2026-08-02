import { MapPin, ShieldAlert, Gauge, ListChecks, FileText, Activity } from "lucide-react";
import { bus } from "@/geoos/core/bus";

/**
 * Renderizador da resposta estruturada do Geo AI Assistant.
 *
 * O agente responde num protocolo de seções (## RESUMO, ## SITUACAO, ...).
 * Aqui elas viram cartões legíveis, e os focos geográficos viram chips
 * clicáveis que navegam o mapa (map.flyTo) e ligam a camada relacionada.
 */
export type ParsedAnswer = {
  resumo: string;
  situacao: string[];
  riscos: string[];
  evidencias: string[];
  recomendacoes: string[];
  criticidade: string;
  confianca: number | null;
  focos: { lat: number; lng: number; zoom: number; label: string; layer?: string }[];
  fallback: string;
};

const SECTION_ALIASES: Record<string, keyof ParsedAnswer | "focos"> = {
  RESUMO: "resumo",
  SITUACAO: "situacao",
  RISCOS: "riscos",
  EVIDENCIAS: "evidencias",
  RECOMENDACOES: "recomendacoes",
  FOCOS: "focos",
};

const clean = (s: string) =>
  s
    .replace(/\*\*/g, "")
    .replace(/^[-•*]\s*/, "")
    .replace(/^#+\s*/, "")
    .trim();

export function parseAnswer(text: string): ParsedAnswer {
  const out: ParsedAnswer = {
    resumo: "",
    situacao: [],
    riscos: [],
    evidencias: [],
    recomendacoes: [],
    criticidade: "",
    confianca: null,
    focos: [],
    fallback: "",
  };

  const lines = text.split("\n");
  let current: string | null = null;
  let sawSection = false;
  const resumoBuf: string[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    // Cabeçalho de seção: aceita "## RESUMO", "RESUMO", "**RISCOS**" ou "CRITICIDADE: Alto".
    const header = line
      .replace(/\*\*/g, "")
      .match(/^(?:#{1,4}\s*)?([A-ZÇÃÕÁÉÍÓÚÂÊÔÀ_ ]{4,40})\s*:?\s*(.*)$/);
    if (header) {
      const keyRaw = header[1]
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toUpperCase()
        .trim()
        .replace(/\s+/g, "_");
      const known =
        keyRaw.startsWith("CRITICIDADE") ||
        keyRaw.startsWith("CONFIANCA") ||
        Object.keys(SECTION_ALIASES).some((k) => keyRaw.startsWith(k));

      if (known) {
        if (keyRaw.startsWith("CRITICIDADE")) {
          sawSection = true;
          out.criticidade = clean(header[2]);
          current = null;
          continue;
        }
        if (keyRaw.startsWith("CONFIANCA")) {
          sawSection = true;
          const n = parseInt(clean(header[2]).replace(/[^\d]/g, ""), 10);
          out.confianca = Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : null;
          current = null;
          continue;
        }
        const mapped = Object.keys(SECTION_ALIASES).find((k) => keyRaw.startsWith(k))!;
        sawSection = true;
        current = SECTION_ALIASES[mapped];
        const rest = clean(header[2]);
        if (rest && current === "resumo") resumoBuf.push(rest);
        continue;
      }
    }


    if (!current) {
      if (!sawSection) out.fallback += (out.fallback ? "\n" : "") + clean(line);
      continue;
    }

    if (current === "resumo") {
      resumoBuf.push(clean(line));
    } else if (current === "focos") {
      // formato: -12.34, -45.67, 7 | rótulo | camada
      const parts = clean(line).split("|").map((p) => p.trim());
      const coords = (parts[0] ?? "").split(",").map((n) => Number(n.trim()));
      if (coords.length >= 2 && Number.isFinite(coords[0]) && Number.isFinite(coords[1])) {
        out.focos.push({
          lat: coords[0],
          lng: coords[1],
          zoom: Number.isFinite(coords[2]) ? coords[2] : 7,
          label: parts[1] || "Área de interesse",
          layer: parts[2] || undefined,
        });
      }
    } else {
      const arr = out[current as "situacao" | "riscos" | "evidencias" | "recomendacoes"];
      const value = clean(line);
      if (value) arr.push(value);
    }
  }

  out.resumo = resumoBuf.join(" ").trim();
  return out;
}

const CRIT_STYLE: Record<string, { dot: string; text: string; ring: string; label: string }> = {
  baixo: { dot: "bg-emerald-400", text: "text-emerald-200", ring: "border-emerald-400/30 bg-emerald-400/10", label: "Baixo" },
  moderado: { dot: "bg-yellow-400", text: "text-yellow-100", ring: "border-yellow-400/30 bg-yellow-400/10", label: "Moderado" },
  alto: { dot: "bg-orange-400", text: "text-orange-100", ring: "border-orange-400/30 bg-orange-400/10", label: "Alto" },
  critico: { dot: "bg-red-500", text: "text-red-100", ring: "border-red-500/30 bg-red-500/10", label: "Crítico" },
};

function critKey(v: string) {
  const k = v
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  if (k.includes("critic")) return "critico";
  if (k.includes("alto")) return "alto";
  if (k.includes("moder")) return "moderado";
  if (k.includes("baix")) return "baixo";
  return "";
}

function Section({
  icon: Icon,
  title,
  items,
}: {
  icon: typeof FileText;
  title: string;
  items: string[];
}) {
  if (!items.length) return null;
  return (
    <div className="mt-3">
      <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-white/45">
        <Icon className="h-3 w-3" />
        {title}
      </div>
      <ul className="space-y-1">
        {items.map((it, i) => (
          <li key={i} className="flex gap-2 text-[12px] leading-relaxed text-white/85">
            <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-[color:var(--geoos-accent)]/70" />
            <span>{it}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function GeoAnswer({ text, streaming }: { text: string; streaming?: boolean }) {
  const a = parseAnswer(text);
  const hasStructure =
    a.resumo || a.situacao.length || a.riscos.length || a.recomendacoes.length || a.evidencias.length;

  if (!hasStructure) {
    return (
      <div className="whitespace-pre-wrap text-[12px] leading-relaxed text-white/90">
        {a.fallback || text}
        {streaming && <span className="ml-0.5 inline-block h-3 w-1 animate-pulse bg-[color:var(--geoos-accent)] align-middle" />}
      </div>
    );
  }

  const crit = CRIT_STYLE[critKey(a.criticidade)];

  return (
    <div className="animate-fade-in">
      {a.resumo && (
        <p className="text-[12.5px] leading-relaxed text-white">
          {a.resumo}
          {streaming && <span className="ml-0.5 inline-block h-3 w-1 animate-pulse bg-[color:var(--geoos-accent)] align-middle" />}
        </p>
      )}

      <Section icon={Activity} title="Situação atual" items={a.situacao} />
      <Section icon={ShieldAlert} title="Principais riscos" items={a.riscos} />
      <Section icon={FileText} title="Evidências" items={a.evidencias} />
      <Section icon={ListChecks} title="Recomendações técnicas" items={a.recomendacoes} />

      {a.focos.length > 0 && (
        <div className="mt-3">
          <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-white/45">
            <MapPin className="h-3 w-3" /> Navegar no mapa
          </div>
          <div className="flex flex-wrap gap-1.5">
            {a.focos.map((f, i) => (
              <button
                key={i}
                type="button"
                onClick={() => {
                  if (f.layer) bus.emit("map.toggleLayer", { layerId: f.layer, visible: true });
                  bus.emit("map.flyTo", { lat: f.lat, lng: f.lng, zoom: f.zoom });
                  bus.emit("notify", { title: "Mapa centralizado", message: f.label, level: "info" });
                }}
                className="inline-flex min-h-[36px] items-center gap-1.5 rounded-full border border-[color:var(--geoos-accent)]/35 bg-[color:var(--geoos-accent)]/10 px-3 text-[11px] text-white/90 transition active:scale-95 hover:bg-[color:var(--geoos-accent)]/20"
              >
                <MapPin className="h-3 w-3 text-[color:var(--geoos-accent)]" />
                {f.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {(crit || a.confianca != null) && (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-white/10 pt-2.5">
          {crit && (
            <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10.5px] font-medium ${crit.ring} ${crit.text}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${crit.dot}`} />
              Criticidade: {crit.label}
            </span>
          )}
          {a.confianca != null && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[10.5px] text-white/70">
              <Gauge className="h-3 w-3" /> Confiança {a.confianca}%
            </span>
          )}
        </div>
      )}
    </div>
  );
}
