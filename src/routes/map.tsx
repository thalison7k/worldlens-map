import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { ClientOnly } from "@tanstack/react-router";

const WorldMap = lazy(() => import("@/components/gis/WorldMap"));

export const Route = createFileRoute("/map")({
  head: () => ({
    meta: [
      { title: "Mapa Global — World GIS" },
      { name: "description", content: "Mapa mundial navegável com camadas ambientais, ocorrências, timeline e Índice de Saúde Ambiental (ISA)." },
      { property: "og:title", content: "Mapa Global — World GIS" },
      { property: "og:description", content: "Explore o planeta com camadas ambientais, ocorrências e ISA em tempo real." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: MapPage,
});

function MapPage() {
  return (
    <ClientOnly fallback={<MapFallback />}>
      <Suspense fallback={<MapFallback />}>
        <WorldMap />
      </Suspense>
    </ClientOnly>
  );
}

function MapFallback() {
  return (
    <div className="flex h-screen w-screen items-center justify-center bg-[color:var(--gis-bg)] text-[color:var(--gis-muted)]">
      Carregando mapa mundial…
    </div>
  );
}
