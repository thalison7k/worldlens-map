import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Building2, MapPin, Plus, Search, Trash2 } from "lucide-react";
import {
  loadPrefeituras,
  savePrefeituras,
  slugify,
  type Prefeitura,
} from "@/lib/prefeituras";
import { searchAddress } from "@/lib/gis/geocoding";

export const Route = createFileRoute("/prefeituras")({
  head: () => ({
    meta: [
      { title: "Prefeituras — Painéis ambientais municipais | GeoOS" },
      {
        name: "description",
        content:
          "Cada prefeitura com seu painel de alertas e dados ambientais em tempo real, com exportação em Excel e Word.",
      },
      { property: "og:title", content: "Prefeituras — Painéis ambientais municipais | GeoOS" },
      {
        property: "og:description",
        content:
          "Painéis municipais de alertas, clima, queimadas, sismos, ar e enchentes com relatórios em Excel e Word.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PrefeiturasPage,
});

function PrefeiturasPage() {
  const [list, setList] = useState<Prefeitura[]>([]);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setList(loadPrefeituras()), []);

  const update = (next: Prefeitura[]) => {
    setList(next);
    savePrefeituras(next);
  };

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const [hit] = await searchAddress(query.trim());
      if (!hit) {
        setError("Município não encontrado. Tente 'Cidade, UF' ou um CEP.");
        return;
      }
      const name =
        hit.address.city || hit.address.town || hit.address.village || hit.displayName.split(",")[0];
      const uf = hit.address.state;
      const slug = slugify(name, uf);
      if (list.some((p) => p.slug === slug)) {
        setError("Esta prefeitura já está cadastrada.");
        return;
      }
      update([...list, { slug, name, uf, lat: hit.lat, lng: hit.lng, radiusKm: 40 }]);
      setQuery("");
    } catch {
      setError("Falha ao consultar o serviço de endereços.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-background px-4 py-10 text-foreground">
      <div className="mx-auto w-full max-w-5xl">
        <Link to="/" className="text-xs text-muted-foreground hover:text-foreground">
          ← Voltar ao GeoOS
        </Link>

        <header className="mt-4">
          <div className="flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-xl bg-primary/15 text-primary">
              <Building2 className="size-6" />
            </span>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Prefeituras</h1>
              <p className="text-sm text-muted-foreground">
                Cada município com painel próprio de alertas e dados ambientais, com relatórios em
                Excel e Word.
              </p>
            </div>
          </div>
        </header>

        <form onSubmit={add} className="mt-6 flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Adicionar prefeitura (ex.: Mogi das Cruzes, SP ou CEP)"
              className="w-full rounded-lg border border-border bg-card py-2.5 pl-9 pr-3 text-sm outline-none focus:border-primary"
            />
          </div>
          <button
            type="submit"
            disabled={busy}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-60"
          >
            <Plus className="size-4" />
            {busy ? "Buscando…" : "Adicionar"}
          </button>
        </form>
        {error && <p className="mt-2 text-xs text-destructive">{error}</p>}

        <section className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((p) => (
            <article
              key={p.slug}
              className="group relative rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/60"
            >
              <Link to="/prefeituras/$slug" params={{ slug: p.slug }} className="block">
                <h2 className="text-base font-semibold">
                  {p.name}
                  {p.uf ? <span className="text-muted-foreground"> · {p.uf}</span> : null}
                </h2>
                <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                  <MapPin className="size-3.5" />
                  {p.lat.toFixed(3)}, {p.lng.toFixed(3)} · raio {p.radiusKm} km
                </p>
                <p className="mt-3 text-xs text-primary">Abrir painel municipal →</p>
              </Link>
              <button
                type="button"
                aria-label={`Remover ${p.name}`}
                onClick={() => update(list.filter((x) => x.slug !== p.slug))}
                className="absolute right-3 top-3 rounded-md p-1.5 text-muted-foreground opacity-0 transition hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
              >
                <Trash2 className="size-4" />
              </button>
            </article>
          ))}
        </section>
      </div>
    </main>
  );
}
