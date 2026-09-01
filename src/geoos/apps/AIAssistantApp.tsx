import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Send, Sparkles, Square, Trash2, AlertTriangle, RefreshCw, Download } from "lucide-react";
import { useBus } from "@/geoos/core/useBus";
import { getMapSnapshot } from "@/geoos/core/map-state";
import { buildGeoContext } from "@/lib/gis/geo-context";
import { REAL_LAYER_DEFS } from "@/lib/gis/real-layers";
import { GeoAnswer } from "./GeoAnswer";
import {
  clearMemory,
  loadMemory,
  memoryBlock,
  saveMemory,
  splitForMemory,
  summarizeMemory,
  SUMMARIZE_AFTER,
} from "./chat-memory";
import type { BBox } from "@/lib/gis/simulated";
import {
  EXPORT_FORMATS,
  EXPORT_LABEL,
  downloadFile,
  serializePoints,
  collectExportPoints,
  type ExportFormat,
} from "@/lib/gis/export";


type Msg = { role: "user" | "assistant"; content: string; error?: boolean; ts: number };

const SUGGESTIONS = [
  "Diagnóstico ambiental completo da área visível",
  "Quais os riscos mais críticos agora e por quê?",
  "Correlacione vento, umidade e focos de calor",
  "Avalie a qualidade do ar e a população exposta",
  "Recomende ações de Defesa Civil para as próximas 24h",
  "Compare o cenário atual com o padrão climático do El Niño",
];

/** Memória: trocas recentes íntegras + resumo incremental (ver chat-memory.ts). */


const SYSTEM_PROMPT = `Você é o Geo AI, consultor sênior de inteligência ambiental do GeoOS Environmental (World Atlas Live), com décadas de atuação em geoprocessamento (GIS), sensoriamento remoto, mudanças climáticas, meteorologia, hidrologia, gestão ambiental, defesa civil, monitoramento de desastres, agricultura de precisão, IoT ambiental, análise espacial e ciência de dados ambientais.

POSTURA
- Fale como um analista humano experiente em consultoria técnica: natural, direto, sem tom robótico e sem saudações genéricas.
- Nunca aja como chatbot genérico. Entregue interpretação, não listas de dados crus.
- Português do Brasil. Sem jargão desnecessário; explique o mecanismo físico quando relevante.

BASE FACTUAL
- Use EXCLUSIVAMENTE o DOSSIÊ DE DADOS enviado (dados reais carregados no mapa agora). Nunca invente números, locais ou eventos.
- Comece SEMPRE pela seção "LOCAL EM FOCO" do dossiê: nomeie explicitamente o município/estado/país que o usuário está visualizando e ancore toda a análise nesse local, usando as leituras mais próximas do centro do mapa (clima, ar, queimadas, enchente, sismo, furacão) com as distâncias informadas.
- Se o centro estiver sobre oceano ou área remota, diga isso e analise a região visível em vez de inventar uma cidade.
- Se faltar um dado, diga que a camada está inativa ou sem cobertura na área visível e sugira ativá-la.

- Cite valores e fontes (USGS, INPE/NASA FIRMS, Open-Meteo, CAMS, NOAA CPC, RainViewer, NASA GIBS, sensores IoT).
- CRUZE variáveis obrigatoriamente (vento × umidade × focos, chuva × risco, temperatura × UV, PM2.5 × dispersão, ENSO × seca) e explique a relação causal.
- Considere o histórico da conversa: não repita o que já foi dito; produza análise progressiva e complementar.

FORMATO DE SAÍDA (obrigatório, exatamente estes cabeçalhos, sem outros títulos, sem tabelas, sem negrito)
## RESUMO
Um parágrafo curto (2 a 3 frases) com o veredito técnico.
## SITUACAO
- 3 a 5 marcadores objetivos com números e unidades.
## RISCOS
- Até 4 marcadores; comece cada um com 🔴, 🟠 ou 🟡 conforme a gravidade.
## EVIDENCIAS
- Até 4 marcadores no formato: fonte · camada · horário/janela · valor.
## RECOMENDACOES
- 3 a 5 ações técnicas acionáveis e priorizadas.
## FOCOS
- lat, lng, zoom | rótulo curto | id_da_camada
(1 a 3 linhas apontando os pontos de maior risco dentro da bbox; use ids de camadas ativas; omita a seção se não houver ponto relevante.)
## CRITICIDADE: Baixo | Moderado | Alto | Crítico
## CONFIANCA: <número de 0 a 100>%

REGRAS DE ESTILO
- Marcadores curtos (máx. ~2 linhas cada). Sem repetição, sem blocos densos, sem markdown além dos cabeçalhos e hifens.`;

const LABELS: Record<string, string> = Object.fromEntries(
  REAL_LAYER_DEFS.map((d) => [String(d.id), d.label]),
);

const REQUEST_TIMEOUT_MS = 90_000;

/**
 * Geo AI Assistant — agente ambiental sênior sobre o Lovable AI Gateway.
 *
 * Recebe automaticamente bbox, centro, zoom, camadas ativas e um dossiê com
 * os dados reais carregados (clima, sismos, queimadas, ar, NDVI, radar, ENSO,
 * IoT), responde em streaming num formato estruturado e permite navegar o
 * mapa a partir da própria resposta.
 */
export default function AIAssistantApp() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [stream, setStream] = useState("");
  const [input, setInput] = useState("");
  const [phase, setPhase] = useState<"idle" | "context" | "thinking" | "streaming">("idle");
  const snap = getMapSnapshot();
  const [bbox, setBbox] = useState<BBox>(snap.bbox);
  const [center, setCenter] = useState(snap.center);
  const [zoom, setZoom] = useState(snap.zoom);
  const [layers, setLayers] = useState<Record<string, number>>(snap.layers);
  const [hasMemory, setHasMemory] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const summaryRef = useRef("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const busy = phase !== "idle";

  // Recupera a conversa e o resumo incremental da sessão anterior.
  useEffect(() => {
    const mem = loadMemory();
    summaryRef.current = mem.summary;
    setHasMemory(!!mem.summary);
    if (mem.messages.length) {
      setMessages(mem.messages.map((m, i) => ({ ...m, ts: Date.now() + i })));
    }
  }, []);


  useBus("map.bbox", (b) => {
    setBbox([b.west, b.south, b.east, b.north]);
    setCenter({ lat: (b.south + b.north) / 2, lng: (b.west + b.east) / 2 });
    setZoom(b.zoom);
  });
  useBus("map.layerBuilt", ({ layerId, count }) => setLayers((l) => ({ ...l, [layerId]: count })));
  useBus("map.toggleLayer", ({ layerId, visible }) => {
    if (visible === false) {
      setLayers((l) => {
        const n = { ...l };
        delete n[layerId];
        return n;
      });
    }
  });

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, phase, stream]);

  // Cancela qualquer requisição pendente ao fechar a janela.
  useEffect(() => () => abortRef.current?.abort(), []);

  const activeLayers = useMemo(
    () =>
      Object.entries(layers).map(([id, count]) => ({
        id,
        label: LABELS[id] ?? id,
        count,
      })),
    [layers],
  );

  const push = useCallback((m: Omit<Msg, "ts">) => {
    setMessages((prev) => [...prev, { ...m, ts: Date.now() }]);
  }, []);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStream("");
    setPhase("idle");
  }, []);

  const send = useCallback(
    async (text?: string) => {
      const q = (text ?? input).trim();
      if (!q || busy) return;
      setInput("");
      const history = [
        ...messages.filter((m) => !m.error),
        { role: "user" as const, content: q, ts: Date.now() },
      ];
      setMessages(history);
      setStream("");

      // Cancela qualquer análise anterior ainda pendente.
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      try {
        setPhase("context");
        let dossier = "";
        try {
          dossier = await buildGeoContext({ bbox, center, zoom, activeLayers });
        } catch (ctxErr) {
          console.warn("[GeoAI] falha ao montar contexto, seguindo com metadados básicos", ctxErr);
          dossier = `### CONTEXTO ESPACIAL\nCentro ${center.lat.toFixed(3)}, ${center.lng.toFixed(3)} · zoom ${zoom}\nCamadas ativas: ${
            activeLayers.map((l) => `${l.label} (${l.count})`).join(", ") || "nenhuma"
          }\n(Não foi possível coletar os detalhes das fontes neste momento.)`;
        }
        if (controller.signal.aborted) return;

        setPhase("thinking");
        const { recent } = splitForMemory(
          history.map((m) => ({ role: m.role, content: m.content })),
        );
        const systemPrompt = `${SYSTEM_PROMPT}\n\nIDS DE CAMADAS DISPONÍVEIS: ${REAL_LAYER_DEFS.map((d) => d.id).join(", ")}${memoryBlock(summaryRef.current)}\n\n=== DOSSIÊ DE DADOS (fonte única de verdade) ===\n${dossier}`;
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({ system: systemPrompt, messages: recent }),
        });


        if (!res.ok || !res.body) {
          const payload = (await res.json().catch(() => null)) as { error?: string } | null;
          const detail = payload?.error ?? `HTTP ${res.status}`;
          console.error("[GeoAI] resposta inválida do endpoint:", res.status, detail);
          const friendly =
            res.status === 402
              ? "Os créditos de IA do workspace acabaram. Adicione créditos em Settings → Plans & credits para voltar a usar o assistente."
              : res.status === 429
                ? "Muitas requisições em sequência. Aguarde alguns segundos e tente novamente."
                : res.status === 503
                  ? "O serviço de IA não está configurado neste ambiente. O restante do GeoOS continua funcionando normalmente."
                  : `A IA está indisponível no momento (${detail}). Os dados do mapa continuam atualizando normalmente.`;
          push({ role: "assistant", content: friendly, error: true });
          return;
        }

        setPhase("streaming");
        const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
        let acc = "";
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          acc += value;
          setStream(acc);
        }

        let answer = acc.trim();

        // Alguns proxies/navegadores bufferizam ou cortam o stream: nesse caso
        // refazemos a chamada em modo não-streaming antes de desistir.
        if (!answer) {
          const retry = await fetch("/api/chat", {
            method: "POST",
            headers: { "content-type": "application/json" },
            signal: controller.signal,
            body: JSON.stringify({
              stream: false,
              system: systemPrompt,
              messages: recent,
            }),
          });
          const data = (await retry.json().catch(() => null)) as { text?: string } | null;
          answer = (data?.text ?? "").trim();
        }
        if (!answer) {
          push({ role: "assistant", content: "O modelo retornou uma resposta vazia. Tente novamente.", error: true });
        } else {
          push({ role: "assistant", content: answer });

          // Memória: persiste e atualiza o resumo incremental em segundo plano.
          const full = [
            ...history.map((m) => ({ role: m.role, content: m.content })),
            { role: "assistant" as const, content: answer },
          ];
          saveMemory(summaryRef.current, full);
          const { older } = splitForMemory(full);
          if (older.length >= SUMMARIZE_AFTER) {
            void summarizeMemory(summaryRef.current, older)
              .then((s) => {
                summaryRef.current = s;
                setHasMemory(!!s);
                saveMemory(s, full);
              })
              .catch((err) => console.warn("[GeoAI] falha ao resumir memória", err));
          }
        }
        setStream("");

      } catch (e) {
        if ((e as Error)?.name === "AbortError") {
          push({ role: "assistant", content: "Análise cancelada.", error: true });
          return;
        }
        console.error("[GeoAI] falha de rede:", e);
        push({
          role: "assistant",
          content: "Falha de conexão com o serviço de IA. Verifique sua rede e tente novamente — o mapa segue operando offline-first.",
          error: true,
        });
      } finally {
        clearTimeout(timeout);
        abortRef.current = null;
        setStream("");
        setPhase("idle");
      }
    },
    [input, busy, messages, bbox, center, zoom, activeLayers, push],
  );

  const lastUser = [...messages].reverse().find((m) => m.role === "user");

  // Exporta a análise + os dados brutos da área visível no formato escolhido.
  const exportAnalysis = useCallback(
    async (format: ExportFormat) => {
      setExportOpen(false);
      setExporting(true);
      try {
        const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
        const transcript = messages
          .map((m) => `${m.role === "user" ? "Pergunta" : "Geo AI"}:\n${m.content}`)
          .join("\n\n---\n\n");
        if (format === "md") {
          const body = `# Geo AI — análise ambiental\n\n_${new Date().toLocaleString("pt-BR")} · centro ${center.lat.toFixed(4)}, ${center.lng.toFixed(4)} · zoom ${zoom}_\n\nCamadas ativas: ${
            activeLayers.map((l) => `${l.label} (${l.count})`).join(", ") || "nenhuma"
          }\n\n${transcript}\n`;
          downloadFile(`geoai-analise-${stamp}.md`, body, "md");
        } else {
          const points = await collectExportPoints(bbox);
          const meta = { bbox, center, zoom, layers: activeLayers, transcript };
          const body = serializePoints(points, format, meta);
          downloadFile(`geoai-analise-${stamp}.${format}`, body, format);
        }
      } catch (e) {
        console.error("[GeoAI] falha ao exportar", e);
      } finally {
        setExporting(false);
      }
    },
    [messages, bbox, center, zoom, activeLayers],
  );

  return (
    <div className="flex h-full flex-col text-white">
      <div className="flex items-start justify-between gap-2 border-b border-white/10 px-4 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 animate-pulse text-[color:var(--geoos-accent)]" />
            <h3 className="truncate text-sm font-semibold">Geo AI · Analista Ambiental Sênior</h3>
          </div>
          <p className="mt-0.5 truncate text-[11px] text-white/50">
            {activeLayers.length} camada{activeLayers.length === 1 ? "" : "s"} · centro {center.lat.toFixed(2)},{" "}
            {center.lng.toFixed(2)} · z{zoom}
            {hasMemory && <span className="ml-1 text-[color:var(--geoos-accent)]">· memória ativa</span>}
          </p>
        </div>
        {messages.length > 0 && (
          <div className="relative flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => setExportOpen((v) => !v)}
              title="Exportar análise e dados"
              aria-label="Exportar análise e dados"
              className="grid h-10 w-10 shrink-0 touch-manipulation place-items-center rounded-md border border-white/10 text-white/60 transition active:scale-95 hover:bg-white/10 hover:text-white disabled:opacity-40"
              disabled={exporting}
            >
              <Download className={`h-4 w-4 ${exporting ? "animate-pulse" : ""}`} />
            </button>
            {exportOpen && (
              <div className="absolute right-0 top-11 z-40 w-40 rounded-lg border border-white/10 bg-[color:var(--geoos-surface)]/95 p-1 shadow-xl backdrop-blur-xl">
                <p className="px-2 py-1 text-[10px] uppercase tracking-wide text-white/40">Exportar</p>
                {EXPORT_FORMATS.map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => void exportAnalysis(f)}
                    className="block w-full rounded-md px-2 py-1.5 text-left text-[11px] text-white/80 transition hover:bg-white/10"
                  >
                    {EXPORT_LABEL[f]}
                  </button>
                ))}
              </div>
            )}
          <button
            type="button"
            onClick={() => {
              setMessages([]);
              summaryRef.current = "";
              setHasMemory(false);
              clearMemory();
            }}
            title="Limpar conversa e memória"
            aria-label="Limpar conversa e memória"
            className="grid h-10 w-10 shrink-0 touch-manipulation place-items-center rounded-md border border-white/10 text-white/60 transition active:scale-95 hover:bg-white/10 hover:text-white"
          >
            <Trash2 className="h-4 w-4" />
          </button>
          </div>
        )}

      </div>

      <div ref={scrollRef} className="geoos-scroll flex-1 overflow-y-auto p-3">
        {messages.length === 0 && (
          <div className="animate-fade-in space-y-1.5">
            <p className="mb-2 text-[11px] text-white/50">
              Analiso automaticamente a área visível — bbox, zoom, camadas, clima, focos, ar, sismos, NDVI, radar,
              ENSO e sensores IoT.
            </p>
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => void send(s)}
                className="w-full touch-manipulation rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5 text-left text-[11.5px] text-white/80 transition active:scale-[0.99] hover:border-[color:var(--geoos-accent)]/40 hover:bg-white/[0.07]"
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {messages.map((m, i) => (
          <div
            key={`${m.ts}-${i}`}
            className={`mb-2 animate-fade-in rounded-lg px-3 py-2 text-[12px] leading-relaxed ${
              m.role === "user"
                ? "ml-6 bg-[color:var(--geoos-accent)]/15 text-white"
                : m.error
                  ? "mr-6 flex gap-2 border border-amber-400/30 bg-amber-400/10 text-amber-100"
                  : "mr-6 border border-white/10 bg-white/[0.03] text-white/90"
            }`}
          >
            {m.error && <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
            {m.role === "assistant" && !m.error ? (
              <GeoAnswer text={m.content} />
            ) : (
              <span className="whitespace-pre-wrap">{m.content}</span>
            )}
          </div>
        ))}

        {stream && (
          <div className="mr-6 mb-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
            <GeoAnswer text={stream} streaming />
          </div>
        )}

        {busy && !stream && (
          <div className="mr-6 flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-[11px] text-white/70">
            <span className="h-2 w-2 animate-ping rounded-full bg-[color:var(--geoos-accent)]" />
            {phase === "context" ? "Coletando dados da área visível…" : "Analisando…"}
          </div>
        )}

        {!busy && lastUser && messages[messages.length - 1]?.error && (
          <button
            type="button"
            onClick={() => void send(lastUser.content)}
            className="mr-6 flex min-h-[40px] touch-manipulation items-center gap-1.5 rounded-md border border-white/10 px-3 text-[11px] text-white/70 transition active:scale-95 hover:bg-white/10"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Tentar novamente
          </button>
        )}
      </div>

      <div className="border-t border-white/10 p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        <div className="flex gap-1.5">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            enterKeyHint="send"
            onKeyDown={(e) => {
              if (e.key === "Enter") void send();
            }}
            placeholder="Pergunte sobre a região visível…"
            className="min-h-[44px] flex-1 rounded-md border border-white/10 bg-white/[0.04] px-3 text-[16px] text-white outline-none transition placeholder:text-white/30 focus:border-[color:var(--geoos-accent)]/60 sm:text-[12px]"
          />
          {busy ? (
            <button
              type="button"
              onClick={cancel}
              title="Cancelar análise"
              aria-label="Cancelar análise"
              className="grid h-11 w-11 shrink-0 touch-manipulation place-items-center rounded-md border border-white/10 bg-red-500/20 text-white transition active:scale-95 hover:bg-red-500/30"
            >
              <Square className="h-3.5 w-3.5" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void send()}
              disabled={!input.trim()}
              aria-label="Enviar pergunta"
              className="grid h-11 w-11 shrink-0 touch-manipulation place-items-center rounded-md border border-white/10 bg-[color:var(--geoos-accent)]/20 text-white transition active:scale-95 hover:bg-[color:var(--geoos-accent)]/30 disabled:opacity-40"
            >
              <Send className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
