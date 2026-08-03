/**
 * Memória de conversa do Geo AI.
 *
 * Mantém um resumo incremental das trocas antigas para que o agente lembre do
 * que já foi perguntado/respondido sem reenviar todo o histórico (e sem repetir
 * análises). As últimas trocas seguem íntegras; o restante vira um briefing.
 */

export type MemoryMsg = { role: "user" | "assistant"; content: string };

/** Quantas mensagens recentes seguem na íntegra para o modelo. */
export const RECENT_WINDOW = 8;
/** A partir de quantas mensagens antigas vale a pena resumir. */
export const SUMMARIZE_AFTER = 4;

const SUMMARIZER_SYSTEM = `Você mantém a MEMÓRIA de uma consultoria ambiental em andamento.
Receberá o resumo anterior (se houver) e novas trocas. Devolva um briefing atualizado em português, no máximo 180 palavras, em tópicos curtos, contendo apenas:
- perguntas já feitas pelo usuário (para não serem repetidas);
- conclusões técnicas já entregues (com números-chave);
- áreas/coordenadas já analisadas;
- pendências ou próximos passos combinados.
Não invente dados. Sem saudações, sem cabeçalhos além dos tópicos.`;

/** Gera/atualiza o resumo incremental chamando o mesmo endpoint de chat. */
export async function summarizeMemory(
  previousSummary: string,
  olderMessages: MemoryMsg[],
  signal?: AbortSignal,
): Promise<string> {
  if (!olderMessages.length) return previousSummary;

  const transcript = olderMessages
    .map((m) => `${m.role === "user" ? "USUÁRIO" : "GEO AI"}: ${m.content}`)
    .join("\n\n")
    .slice(0, 12_000);

  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    signal,
    body: JSON.stringify({
      system: SUMMARIZER_SYSTEM,
      messages: [
        {
          role: "user",
          content: `RESUMO ANTERIOR:\n${previousSummary || "(nenhum)"}\n\nNOVAS TROCAS:\n${transcript}`,
        },
      ],
    }),
  });

  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let acc = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    acc += value;
  }
  return acc.trim() || previousSummary;
}

/** Divide o histórico entre o que precisa ser resumido e o que vai íntegro. */
export function splitForMemory(messages: MemoryMsg[]) {
  if (messages.length <= RECENT_WINDOW) return { older: [] as MemoryMsg[], recent: messages };
  return {
    older: messages.slice(0, messages.length - RECENT_WINDOW),
    recent: messages.slice(messages.length - RECENT_WINDOW),
  };
}

/** Bloco de memória injetado no system prompt. */
export function memoryBlock(summary: string) {
  if (!summary.trim()) return "";
  return `\n\n=== MEMÓRIA DA CONVERSA (contexto recuperado; não repita o que já foi entregue) ===\n${summary.trim()}`;
}

const STORAGE_KEY = "geoos.geoai.memory.v1";

export function loadMemory(): { summary: string; messages: MemoryMsg[] } {
  if (typeof window === "undefined") return { summary: "", messages: [] };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { summary: "", messages: [] };
    const parsed = JSON.parse(raw) as { summary?: string; messages?: MemoryMsg[] };
    return { summary: parsed.summary ?? "", messages: parsed.messages ?? [] };
  } catch {
    return { summary: "", messages: [] };
  }
}

export function saveMemory(summary: string, messages: MemoryMsg[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ summary, messages: messages.slice(-20) }),
    );
  } catch {
    /* quota — memória é best-effort */
  }
}

export function clearMemory() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* noop */
  }
}
