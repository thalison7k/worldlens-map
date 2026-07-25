import { createFileRoute } from "@tanstack/react-router";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateText } from "ai";

type ChatMsg = { role: "system" | "user" | "assistant"; content: string };

/**
 * Non-streaming chat endpoint backed by Lovable AI Gateway. Kept simple
 * (JSON in, JSON out) so the AIAssistantApp can render responses without
 * a UI stream transport dependency.
 */
export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const key = process.env.LOVABLE_API_KEY;
        if (!key) return json({ error: "Missing LOVABLE_API_KEY" }, 500);
        const body = (await request.json().catch(() => ({}))) as { messages?: ChatMsg[] };
        const messages = Array.isArray(body.messages) ? body.messages : [];
        if (messages.length === 0) return json({ error: "no messages" }, 400);

        const gateway = createOpenAICompatible({
          name: "lovable",
          baseURL: "https://ai.gateway.lovable.dev/v1",
          headers: {
            "Lovable-API-Key": key,
            "X-Lovable-AIG-SDK": "vercel-ai-sdk",
          },
        });

        try {
          const { text } = await generateText({
            model: gateway("google/gemini-3.6-flash"),
            messages,
          });
          return json({ text });
        } catch (e) {
          const msg = (e as Error).message ?? String(e);
          const status = /429|rate/i.test(msg) ? 429 : /402|credit/i.test(msg) ? 402 : 500;
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
