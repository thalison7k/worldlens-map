import { createFileRoute } from "@tanstack/react-router";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateText } from "ai";

type ChatMsg = { role: "system" | "user" | "assistant"; content: string };

const MODEL = "google/gemini-3.6-flash";
/** Teto de tempo do lado do servidor — evita requisição pendurada. */
const TIMEOUT_MS = 45_000;

/**
 * Endpoint de chat (não-streaming) sobre o Lovable AI Gateway.
 *
 * IMPORTANTE: o AI SDK rejeita mensagens com `role: "system"` dentro de
 * `messages` ("System messages are not allowed in the prompt or messages
 * fields"). Elas precisam ir na opção `system` — era essa a causa raiz do
 * erro 500 do Geo AI Assistant.
 */
export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const started = Date.now();
        const key = process.env['LOVABLE_API_KEY'];
        if (!key) {
          console.error("[api/chat] LOVABLE_API_KEY ausente no ambiente do servidor");
          return json({ error: "IA não configurada neste ambiente (LOVABLE_API_KEY ausente)." }, 503);
        }

        const body = (await request.json().catch(() => null)) as
          | { messages?: ChatMsg[]; system?: string }
          | null;
        if (!body) return json({ error: "Corpo da requisição inválido (JSON malformado)." }, 400);

        const raw = Array.isArray(body.messages) ? body.messages : [];
        // Separa system (opção dedicada) das mensagens de conversa.
        const systemParts = [
          ...(typeof body.system === "string" && body.system.trim() ? [body.system.trim()] : []),
          ...raw.filter((m) => m?.role === "system" && typeof m.content === "string").map((m) => m.content),
        ];
        const messages = raw
          .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
          .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

        if (messages.length === 0) return json({ error: "Nenhuma mensagem de usuário enviada." }, 400);

        const gateway = createOpenAICompatible({
          name: "lovable",
          baseURL: "https://ai.gateway.lovable.dev/v1",
          headers: {
            "Lovable-API-Key": key,
            "X-Lovable-AIG-SDK": "vercel-ai-sdk",
          },
        });

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
        try {
          const { text } = await generateText({
            model: gateway(MODEL),
            ...(systemParts.length ? { system: systemParts.join("\n\n") } : {}),
            messages,
            abortSignal: controller.signal,
          });
          const answer = (text ?? "").trim();
          console.log(`[api/chat] ok em ${Date.now() - started}ms · ${answer.length} chars`);
          if (!answer) return json({ error: "O modelo retornou uma resposta vazia." }, 502);
          return json({ text: answer, model: MODEL, elapsedMs: Date.now() - started });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          const aborted = /abort/i.test(msg);
          const status = aborted
            ? 504
            : /429|rate limit/i.test(msg)
              ? 429
              : /402|credit|payment/i.test(msg)
                ? 402
                : 502;
          console.error(`[api/chat] falha (${status}) após ${Date.now() - started}ms:`, msg);
          return json({ error: aborted ? "Tempo limite excedido ao consultar o modelo." : msg }, status);
        } finally {
          clearTimeout(timer);
        }
      },
    },
  },
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
