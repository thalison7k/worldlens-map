import type { Occurrence, OccurrenceKind } from "./types";

// Negative weight per occurrence kind — heavier weight means bigger hit to ISA.
const NEG: Partial<Record<OccurrenceKind, number>> = {
  queimada: 1.4,
  enchente: 1.2,
  desmatamento: 1.3,
  lixo: 1.0,
  buraco: 0.6,
  arvore_risco: 0.8,
  agua_parada: 0.9,
  poluicao: 1.3,
  erosao: 0.9,
};

export type IsaResult = {
  score: number;
  classification: "Excelente" | "Boa" | "Regular" | "Ruim" | "Crítica";
  trend: "up" | "down" | "flat";
  breakdown: { kind: OccurrenceKind; contribution: number }[];
  topFactors: OccurrenceKind[];
  suggestions: string[];
  explanation: string;
};

export function computeIsa(occurrences: Occurrence[]): IsaResult {
  const totals = new Map<OccurrenceKind, number>();
  for (const o of occurrences) {
    const w = NEG[o.kind];
    if (!w) continue;
    totals.set(o.kind, (totals.get(o.kind) ?? 0) + o.intensity * w);
  }
  const raw = [...totals.values()].reduce((a, b) => a + b, 0);
  const score = Math.max(0, Math.min(100, Math.round(100 - raw * 1.8)));

  const classification: IsaResult["classification"] =
    score >= 85 ? "Excelente" : score >= 70 ? "Boa" : score >= 50 ? "Regular" : score >= 30 ? "Ruim" : "Crítica";

  // trend: compare newer vs older half
  const sorted = [...occurrences].sort((a, b) => a.timestamp - b.timestamp);
  const mid = Math.floor(sorted.length / 2);
  const older = sorted.slice(0, mid).length;
  const newer = sorted.slice(mid).length;
  const trend: IsaResult["trend"] = newer > older * 1.1 ? "down" : newer * 1.1 < older ? "up" : "flat";

  const breakdown = [...totals.entries()]
    .map(([kind, contribution]) => ({ kind, contribution: Math.round(contribution * 10) / 10 }))
    .sort((a, b) => b.contribution - a.contribution);

  const topFactors = breakdown.slice(0, 3).map((b) => b.kind);

  const suggestions = buildSuggestions(topFactors);

  const explanation = topFactors.length
    ? `A nota ${score} reflete principalmente ${topFactors
        .map(labelKind)
        .join(", ")} na região visível. ${
        trend === "down"
          ? "A tendência é de piora nos últimos períodos."
          : trend === "up"
            ? "A tendência é de melhora recente."
            : "A situação permanece estável."
      }`
    : `A região não apresenta ocorrências ambientais relevantes no período — ISA ${score} (${classification}).`;

  return { score, classification, trend, breakdown, topFactors, suggestions, explanation };
}

function labelKind(k: OccurrenceKind): string {
  const map: Record<OccurrenceKind, string> = {
    queimada: "queimadas",
    chuva: "eventos de chuva",
    enchente: "enchentes",
    desmatamento: "desmatamento",
    lixo: "lixo irregular",
    buraco: "buracos na via",
    sensor: "alertas de sensores",
    drone: "sobrevoos de drone",
    arvore_risco: "árvores em risco",
    agua_parada: "focos de água parada",
    poluicao: "poluição",
    erosao: "erosão",
  };
  return map[k];
}

function buildSuggestions(kinds: OccurrenceKind[]): string[] {
  const bank: Partial<Record<OccurrenceKind, string>> = {
    queimada: "Ampliar brigadas de incêndio e monitorar focos por satélite (NASA FIRMS).",
    enchente: "Revisar drenagem urbana e limpar bocas de lobo antes do período de chuvas.",
    desmatamento: "Cruzar imagens Sentinel-2 recentes e acionar fiscalização em polígonos suspeitos.",
    lixo: "Aumentar frequência de coleta e mapear pontos viciados para intervenção.",
    buraco: "Programar operação tapa-buraco priorizando corredores de maior fluxo.",
    arvore_risco: "Vistoria fitossanitária e poda preventiva nas árvores sinalizadas.",
    agua_parada: "Mutirões de eliminação de criadouros de Aedes aegypti nos bairros afetados.",
    poluicao: "Cruzar dados de qualidade do ar (OpenWeather/Copernicus) com fontes emissoras.",
    erosao: "Contenção de encostas e revegetação nas áreas de solo exposto.",
  };
  return kinds.map((k) => bank[k]).filter((v): v is string => Boolean(v));
}
