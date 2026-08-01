import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Send, Sparkles, Square, Trash2, AlertTriangle, RefreshCw } from "lucide-react";
import { useBus } from "@/geoos/core/useBus";
import { buildGeoContext } from "@/lib/gis/geo-context";
import { REAL_LAYER_DEFS } from "@/lib/gis/real-layers";
import type { BBox } from "@/lib/gis/simulated";

type Msg = { role: "user" | "assistant"; content: string; error?: boolean; ts: number };

const SUGGESTIONS = [
  "Resuma o cenário ambiental da área visível",
  "Explique as ocorrências mais críticas agora",
  "Detecte riscos ambientais nesta região",
  "Correlacione clima, queimadas, vento e qualidade do ar",
  "Gere recomendações técnicas de mitigação",
  "Produza um relatório em tópicos",
];

const SYSTEM_PROMPT = `Você é o Geo AI Assistant do GeoOS Environmental, um assistente geoespacial de monitoramento ambiental.

REGRAS OBRIGATÓRIAS:
1. Responda EXCLUSIVAMENTE com base no DOSSIÊ DE DADOS fornecido (dados reais carregados no mapa neste momento). Nunca invente números, locais ou eventos.
2. Se um dado necessário não estiver no dossiê, diga claramente que a camada correspondente está inativa ou sem cobertura na área visível e sugira ativá-la.
3. Escreva em português do Brasil, tom técnico e objetivo, usando tópicos curtos quando ajudar.
4. Sempre cite os valores numéricos e as fontes (USGS, INPE/NASA FIRMS, Open-Meteo, CAMS, NOAA, RainViewer, NASA GIBS, sensores IoT) que sustentam cada afirmação.
5. Quando fizer sentido, correlacione variáveis (vento × queimadas × PM2.5, chuva × risco de foco, temperatura × UV) e classifique riscos como Baixo / Moderado / Alto / Crítico.
6. Termine análises com recomendações técnicas acionáveis.`;

const LABELS: Record<string, string> = Object.fromEntries(
  REAL_LAYER_DEFS.map((d) => [String(d.id), d.label]),
);

const REQUEST_TIMEOUT_MS = 60_000;

/**
 * Geo AI Assistant — chat contextual sobre o Lovable AI Gateway.
 *
 * Recebe automaticamente bbox, centro, zoom, camadas ativas e um dossiê com
 * os dados reais carregados (clima, sismos, queimadas, ar, IoT, NDVI, radar)
 * e responde apenas com base neles. Nenhuma exceção derruba a interface:
 * toda falha vira uma mensagem amigável no próprio chat.
 */
export default function AIAssistantApp() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [phase, setPhase] = useState<"idle" | "context" | "thinking">("idle");
  const [bbox, setBbox] = useState<BBox>([-180, -60, 180, 75]);
  const [center, setCenter] = useState({ lat: 0, lng: 0 });
  const [zoom, setZoom] = useState(3);
  const [layers, setLayers] = useState<Record<string, number>>({});
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const busy = phase !== "idle";

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
  }, [messages, phase]);

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
    setPhase("idle");
  }, []);

  const send = useCallback(
    async (text?: string) => {
      const q = (text ?? input).trim();
      if (!q || busy) return;
      setInput("");
      const history = [...messages.filter((m) => !m.error), { role: "user" as const, content: q, ts: Date.now() }];
      setMessages(history);

      const controller = new AbortController();
      abortRef.current = controller;
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      try {
        setPhase("context");
        let dossier = "";
        try {
          dossier = await buildGeoContext({ bbox, center, zoom, activeLayers });
          console.info("[GeoAI] contexto montado", { zoom, bbox, camadas: activeLayers.length });
        } catch (ctxErr) {
          console.warn("[GeoAI] falha ao montar contexto, seguindo com metadados básicos", ctxErr);
          dossier = `### CONTEXTO ESPACIAL\nCentro ${center.lat.toFixed(3)}, ${center.lng.toFixed(3)} · zoom ${zoom}\nCamadas ativas: ${
            activeLayers.map((l) => `${l.label} (${l.count})`).join(", ") || "nenhuma"
          }\n(Não foi possível coletar os detalhes das fontes neste momento.)`;
        }
        if (controller.signal.aborted) return;

        setPhase("thinking");
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            system: `${SYSTEM_PROMPT}\n\n=== DOSSIÊ DE DADOS (fonte única de verdade) ===\n${dossier}`,
            messages: history.map((m) => ({ role: m.role, content: m.content })),
          }),
        });

        const payload = (await res.json().catch(() => null)) as
          | { text?: string; error?: string }
          | null;

        if (!res.ok || !payload?.text) {
          const detail = payload?.error ?? `HTTP ${res.status}`;
          console.error("[GeoAI] resposta inválida do endpoint:", res.status, detail);
          const friendly =
            res.status === 402
              ? "Os créditos de IA do workspace acabaram. Adicione créditos em Settings → Plans & credits para voltar a usar o assistente."
              : res.status === 429
                ? "Muitas requisições em sequência. Aguarde alguns segundos e tente novamente."
                : res.status === 503
                  ? "O serviço de IA não está configurado neste ambiente. O restante do GeoOS continua funcionando normalmente."
                  : res.status === 504
                    ? "A IA demorou demais para responder. Tente uma pergunta mais específica ou reduza a área visível."
                    : `A IA está indisponível no momento (${detail}). Os dados do mapa continuam atualizando normalmente.`;
          push({ role: "assistant", content: friendly, error: true });
          return;
        }

        push({ role: "assistant", content: payload.text });
      } catch (e) {
        if ((e as Error)?.name === "AbortError") {
          console.info("[GeoAI] requisição cancelada pelo usuário ou por timeout");
          push({ role: "assistant", content: "Solicitação cancelada.", error: true });
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
        setPhase("idle");
      }
    },
    [input, busy, messages, bbox, center, zoom, activeLayers, push],
  );

  const lastUser = [...messages].reverse().find((m) => m.role === "user");

  return (
    <div className="flex h-full flex-col text-white">
      <div className="flex items-start justify-between gap-2 border-b border-white/10 px-4 py-3">
        <div>
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 animate-pulse text-[color:var(--geoos-accent)]" />
            <h3 className="text-sm font-semibold">Geo AI Assistant</h3>
          </div>
          <p className="mt-0.5 text-[11px] text-white/50">
            {activeLayers.length} camada{activeLayers.length === 1 ? "" : "s"} ativa
            {activeLayers.length === 1 ? "" : "s"} · centro {center.lat.toFixed(2)}, {center.lng.toFixed(2)} · z{zoom}
          </p>
        </div>
        {messages.length > 0 && (
          <button
            onClick={() => setMessages([])}
            title="Limpar conversa"
            className="grid h-7 w-7 shrink-0 place-items-center rounded-md border border-white/10 text-white/60 transition hover:bg-white/10 hover:text-white"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3">
        {messages.length === 0 && (
          <div className="space-y-1.5 animate-fade-in">
            <p className="mb-2 text-[11px] text-white/50">
              Pergunte sobre a área visível — respondo apenas com os dados reais carregados agora.
            </p>
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => void send(s)}
                className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-left text-[11px] text-white/80 transition hover:border-[color:var(--geoos-accent)]/40 hover:bg-white/[0.07]"
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
                  : "mr-6 whitespace-pre-wrap border border-white/10 bg-white/[0.03] text-white/90"
            }`}
          >
            {m.error && <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
            <span className="whitespace-pre-wrap">{m.content}</span>
          </div>
        ))}

        {busy && (
          <div className="mr-6 flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-[11px] text-white/70">
            <span className="h-2 w-2 animate-ping rounded-full bg-[color:var(--geoos-accent)]" />
            {phase === "context" ? "Coletando dados da área visível…" : "Analisando…"}
          </div>
        )}

        {!busy && lastUser && messages[messages.length - 1]?.error && (
          <button
            onClick={() => void send(lastUser.content)}
            className="mr-6 flex items-center gap-1.5 rounded-md border border-white/10 px-2.5 py-1 text-[11px] text-white/70 transition hover:bg-white/10"
          >
            <RefreshCw className="h-3 w-3" /> Tentar novamente
          </button>
        )}
      </div>

      <div className="border-t border-white/10 p-2">
        <div className="flex gap-1.5">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void send();
            }}
            placeholder="Pergunte sobre a região visível…"
            className="flex-1 rounded-md border border-white/10 bg-white/[0.04] px-2 py-1.5 text-[12px] text-white outline-none transition placeholder:text-white/30 focus:border-[color:var(--geoos-accent)]/60"
          />
          {busy ? (
            <button
              onClick={cancel}
              title="Cancelar"
              className="grid h-8 w-8 place-items-center rounded-md border border-white/10 bg-red-500/20 text-white transition hover:bg-red-500/30"
            >
              <Square className="h-3 w-3" />
            </button>
          ) : (
            <button
              onClick={() => void send()}
              disabled={!input.trim()}
              className="grid h-8 w-8 place-items-center rounded-md border border-white/10 bg-[color:var(--geoos-accent)]/20 text-white transition hover:bg-[color:var(--geoos-accent)]/30 disabled:opacity-40"
            >
              <Send className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
