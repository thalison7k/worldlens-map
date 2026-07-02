import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useState } from "react";

const Desktop = lazy(() => import("@/geoos/desktop/Desktop").then((m) => ({ default: m.Desktop })));

function DesktopRoute() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return <div className="fixed inset-0 bg-[color:var(--geoos-bg,#0a0f1a)]" />;
  return (
    <Suspense fallback={<div className="fixed inset-0 bg-[color:var(--geoos-bg,#0a0f1a)]" />}>
      <Desktop />
    </Suspense>
  );
}

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
  component: DesktopRoute,
});
