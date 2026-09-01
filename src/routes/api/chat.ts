import { createFileRoute } from "@tanstack/react-router";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateText, streamText } from "ai";

type ChatMsg = { role: "system" | "user" | "assistant"; content: string };

const MODEL = "google/gemini-3.6-flash";

/**
 * Endpoint de chat do Geo AI Assistant sobre o Lovable AI Gateway.
 *
 * Responde em STREAMING (text/plain chunked) para reduzir drasticamente o
 * tempo até o primeiro token. Erros que acontecem antes do stream voltam como
 * JSON com status apropriado (402 créditos, 429 rate limit, 503 sem chave).
 *
 * IMPORTANTE: o AI SDK rejeita mensagens com `role: "system"` dentro de
 * `messages`; o system prompt vai na opção dedicada `system`.
 */
export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const key = process.env["LOVABLE_API_KEY"];
        if (!key) {
          console.error("[api/chat] LOVABLE_API_KEY ausente no ambiente do servidor");
          return json({ error: "IA não configurada neste ambiente (LOVABLE_API_KEY ausente)." }, 503);
        }

        const body = (await request.json().catch(() => null)) as
          | { messages?: ChatMsg[]; system?: string; stream?: boolean }
          | null;
        if (!body) return json({ error: "Corpo da requisição inválido (JSON malformado)." }, 400);

        const raw = Array.isArray(body.messages) ? body.messages : [];
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

        try {
          const system = systemParts.length ? { system: systemParts.join("\n\n") } : {};

          // Fallback sem streaming: usado pelo cliente quando o stream chega
          // vazio (proxies/navegadores que bufferizam a resposta).
          if (body.stream === false) {
            const out = await generateText({ model: gateway(MODEL), ...system, messages });
            return json({ text: out.text });
          }

          const result = streamText({
            model: gateway(MODEL),
            ...system,
            messages,
            abortSignal: request.signal,
            onError: ({ error }) => console.error("[api/chat] erro no stream:", error),
          });

          return new Response(result.textStream.pipeThrough(new TextEncoderStream()), {
            headers: {
              "content-type": "text/plain; charset=utf-8",
              "cache-control": "no-store",
              "x-accel-buffering": "no",
            },
          });

        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          const status = /429|rate limit/i.test(msg)
            ? 429
            : /402|credit|payment/i.test(msg)
              ? 402
              : 502;
          console.error(`[api/chat] falha (${status}):`, msg);
          return json({ error: msg }, status);
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
