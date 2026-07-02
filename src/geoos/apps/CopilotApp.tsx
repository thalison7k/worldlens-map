import { useState } from "react";
import { Bot, Send, Sparkles } from "lucide-react";
import { bus } from "@/geoos/core/bus";

const SUGGESTIONS = [
  "Mostrar queimadas",
  "Ir para São Paulo",
  "Esconder sensores",
  "Analisar esta região",
  "Criar relatório",
];

type Msg = { role: "user" | "ai"; text: string };

export default function CopilotApp() {
  const [messages, setMessages] = useState<Msg[]>([
    { role: "ai", text: "Olá, sou o Geo AI Copilot. Posso controlar o GeoOS por comandos em linguagem natural. Diga por exemplo: “ir para Manaus e mostrar queimadas”." },
  ]);
  const [text, setText] = useState("");

  function send(t: string) {
    if (!t.trim()) return;
    setMessages((m) => [...m, { role: "user", text: t }]);
    setText("");

    // Intent parsing local — a IA real entra na Fase 4.3.
    const lower = t.toLowerCase();
    let reply = "Entendido. (A execução real via IA entra na Fase 4.3.)";
    if (lower.includes("são paulo") || lower.includes("sao paulo")) {
      bus.emit("map.flyTo", { lat: -23.5505, lng: -46.6333, zoom: 11 });
      reply = "Voando para São Paulo.";
    } else if (lower.includes("manaus")) {
      bus.emit("map.flyTo", { lat: -3.119, lng: -60.0217, zoom: 10 });
      reply = "Voando para Manaus.";
    } else if (lower.includes("queimada") || lower.includes("fogo")) {
      bus.emit("map.toggleLayer", { layerId: "fires", visible: true });
      reply = "Camada de queimadas ativada.";
    } else if (lower.includes("relatório") || lower.includes("relatorio")) {
      bus.emit("app.open", { appId: "geo-story" });
      reply = "Abrindo o Geo Story para gerar o relatório.";
    } else if (lower.includes("analisar")) {
      bus.emit("app.open", { appId: "analysis" });
      reply = "Abrindo o Analysis Engine.";
    }

    setTimeout(() => setMessages((m) => [...m, { role: "ai", text: reply }]), 200);
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-white/10 px-5 py-3">
        <Bot className="h-4 w-4 text-[color:var(--geoos-accent)]" />
        <h3 className="text-sm font-semibold">Geo AI Copilot</h3>
        <span className="ml-auto rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-white/50">preview</span>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.map((m, i) => (
          <div
            key={i}
            className={
              m.role === "ai"
                ? "max-w-[85%] rounded-2xl rounded-tl-sm border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/85"
                : "ml-auto max-w-[85%] rounded-2xl rounded-tr-sm bg-[color:var(--geoos-accent)]/20 px-3 py-2 text-xs text-white/95"
            }
          >
            {m.text}
          </div>
        ))}
      </div>

      <div className="border-t border-white/10 p-3">
        <div className="mb-2 flex flex-wrap gap-1">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              onClick={() => send(s)}
              className="flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[10px] text-white/70 hover:bg-white/10"
            >
              <Sparkles className="h-2.5 w-2.5" />
              {s}
            </button>
          ))}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(text);
          }}
          className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2"
        >
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Pergunte ao GeoOS…"
            className="flex-1 bg-transparent text-xs text-white outline-none placeholder:text-white/40"
          />
          <button className="rounded-md bg-[color:var(--geoos-accent)] p-1.5 text-black">
            <Send className="h-3 w-3" />
          </button>
        </form>
      </div>
    </div>
  );
}
