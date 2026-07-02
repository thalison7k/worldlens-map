import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-[color:var(--gis-bg)] px-6 text-center text-[color:var(--gis-text)]">
      <div className="gis-chip">World GIS · Fase 1</div>
      <h1 className="max-w-2xl text-4xl font-semibold tracking-tight md:text-5xl">
        Mapa Global navegável de todo o planeta
      </h1>
      <p className="max-w-xl text-sm text-[color:var(--gis-muted)] md:text-base">
        Explore qualquer país, estado, cidade ou bairro com camadas ambientais,
        ocorrências, timeline e Índice de Saúde Ambiental (ISA).
      </p>
      <Link
        to="/map"
        className="gis-btn"
        style={{ padding: "12px 20px", fontSize: 14 }}
        data-active="true"
      >
        Abrir mapa mundial →
      </Link>
    </div>
  );
}
