import { createFileRoute } from "@tanstack/react-router";
import { Desktop } from "@/geoos/desktop/Desktop";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "GeoOS — Geospatial Operating System" },
      { name: "description", content: "Sistema Operacional Geoespacial para análise territorial, monitoramento ambiental e apoio à decisão com IA." },
      { property: "og:title", content: "GeoOS — Geospatial Operating System" },
      { property: "og:description", content: "Um SO completo para dados geoespaciais, com apps, workspaces e Copilot de IA." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => <Desktop />,
});
