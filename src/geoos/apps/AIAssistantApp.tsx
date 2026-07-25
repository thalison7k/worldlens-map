import { useEffect, useRef, useState } from "react";
import { Send, Sparkles } from "lucide-react";
import { useBus } from "@/geoos/core/useBus";
import type { BBox } from "@/lib/gis/simulated";

type Msg = { role: "user" | "assistant" | "system"; content: string };

const SUGGESTIONS = [
  "Resuma o cenário ambiental da área visível",
  "Explique as ocorrências mais críticas agora",
  "Que análises você sugere para esta região?",
  "Gere um relatório executivo em bullet points",
];

/**
 * Geo AI Assistant — chat contextual usando o Lovable AI Gateway
 * (`google/gemini-3.6-flash`). Envia bbox, camadas ativas e KPIs
 * como contexto do sistema; nada é fake.
 */
export default function AIAssistantApp() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [bbox, setBbox] = useState<BBox>([-90, -60, 90, 60]);
  const [layers, setLayers] = useState<Record<string, number>>({});
  const scrollRef = useRef<HTMLDivElement>(null);

  useBus("map.bbox", (b) => setBbox([b.west, b.south, b.east, b.north]));
  useBus("map.layerBuilt", ({ layerId, count }) => setLayers((l) => ({ ...l, [layerId]: count })));

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, busy]);

  const send = async (text?: string) => {
    const q = (text ?? input).trim();
    if (!q || busy) return;
    setInput("");
    const context = `Você é o Geo AI Assistant do GeoOS Environmental — uma plataforma SIG de monitoramento ambiental.
BBox atual: W ${bbox[0].toFixed(2)}, S ${bbox[1].toFixed(2)}, E ${bbox[2].toFixed(2)}, N ${bbox[3].toFixed(2)}.
Camadas carregadas: ${Object.entries(layers).map(([k, v]) => `${k}=${v}`).join(", ") || "nenhuma"}.
Responda em português, tom analítico e conciso, com bullets quando útil.`;
    const next: Msg[] = [...messages, { role: "user", content: q }];
    setMessages(next);
    setBusy(true);
    try {
      const r = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          messages: [{ role: "system", content: context }, ...next],
        }),
      });
      if (!r.ok) {
        const msg = r.status === 402
          ? "Créditos do Lovable AI esgotados. Adicione créditos em Settings → Workspace."
          : r.status === 429
          ? "Muitas requisições — aguarde alguns segundos."
          : `Erro ${r.status} ao consultar o modelo.`;
        setMessages((m) => [...m, { role: "assistant", content: msg }]);
        return;
      }
      const data = (await r.json()) as { text?: string };
      setMessages((m) => [...m, { role: "assistant", content: data.text ?? "(sem resposta)" }]);
    } catch (e) {
      setMessages((m) => [...m, { role: "assistant", content: `Falha de rede: ${String(e)}` }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-full flex-col text-white">
      <div className="border-b border-white/10 px-4 py-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-[color:var(--geoos-accent)]" />
          <h3 className="text-sm font-semibold">Geo AI Assistant</h3>
        </div>
        <p className="mt-0.5 text-[11px] text-white/50">
          Contexto: bbox + camadas ativas · powered by Lovable AI
        </p>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3">
        {messages.length === 0 && (
          <div className="space-y-1.5">
            <p className="mb-2 text-[11px] text-white/50">Sugestões:</p>
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => void send(s)}
                className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-left text-[11px] text-white/80 hover:bg-white/[0.06]"
              >
                {s}
              </button>
            ))}
          </div>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            className={`mb-2 rounded-lg px-3 py-2 text-[12px] leading-relaxed ${
              m.role === "user"
                ? "ml-6 bg-[color:var(--geoos-accent)]/15 text-white"
                : "mr-6 border border-white/10 bg-white/[0.03] text-white/90 whitespace-pre-wrap"
            }`}
          >
            {m.content}
          </div>
        ))}
        {busy && <div className="text-[11px] text-white/50">Pensando…</div>}
      </div>

      <div className="border-t border-white/10 p-2">
        <div className="flex gap-1.5">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void send()}
            placeholder="Pergunte sobre a região visível…"
            className="flex-1 rounded-md border border-white/10 bg-white/[0.04] px-2 py-1.5 text-[12px] text-white outline-none placeholder:text-white/30 focus:border-[color:var(--geoos-accent)]/60"
          />
          <button
            onClick={() => void send()}
            disabled={busy}
            className="grid h-8 w-8 place-items-center rounded-md border border-white/10 bg-[color:var(--geoos-accent)]/20 text-white hover:bg-[color:var(--geoos-accent)]/30 disabled:opacity-40"
          >
            <Send className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
