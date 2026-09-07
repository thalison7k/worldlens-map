import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Bell, BellOff, Building2, MapPin, Plus, Search, Trash2 } from "lucide-react";
import {
  FONTES_REAIS,
  getMonitoredSlug,
  loadPrefeituras,
  savePrefeituras,
  setMonitored,
  slugify,
  type Prefeitura,
} from "@/lib/prefeituras";
import { searchAddress } from "@/lib/gis/geocoding";


export const Route = createFileRoute("/prefeituras/")({
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
  const [monitored, setMonitoredSlug] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setList(loadPrefeituras());
    setMonitoredSlug(getMonitoredSlug());
  }, []);

  const update = (next: Prefeitura[]) => {
    setList(next);
    savePrefeituras(next);
  };

  const monitor = (slug: string | null) => {
    setList(setMonitored(slug));
    setMonitoredSlug(slug);
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
      update([
        ...list,
        { slug, name, uf, lat: hit.lat, lng: hit.lng, radiusKm: 40, alertsEnabled: false },
      ]);

      setQuery("");
    } catch {
      setError("Falha ao consultar o serviço de endereços.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="geoos-shell min-h-screen bg-[color:var(--geoos-bg,#0a0f1a)] px-4 py-10 text-white">
      <div className="mx-auto w-full max-w-5xl">
        <Link to="/" className="text-xs text-white/50 hover:text-white">
          ← Voltar ao GeoOS
        </Link>

        <header className="mt-4 flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-xl border border-white/10 bg-[color:var(--geoos-accent)]/15 text-[color:var(--geoos-accent)]">
            <Building2 className="size-6" />
          </span>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Prefeituras</h1>
            <p className="text-sm text-white/55">
              Cada município com painel próprio de alertas, dados ambientais e relatórios em Excel e
              Word.
            </p>
          </div>
        </header>

        <form onSubmit={add} className="mt-6 flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-white/40" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Adicionar prefeitura (ex.: Mogi das Cruzes, SP ou CEP)"
              className="w-full rounded-lg border border-white/10 bg-white/[0.04] py-2.5 pl-9 pr-3 text-sm text-white outline-none backdrop-blur-xl placeholder:text-white/35 focus:border-[color:var(--geoos-accent)]/60"
            />
          </div>
          <button
            type="submit"
            disabled={busy}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-[color:var(--geoos-accent)]/40 bg-[color:var(--geoos-accent)]/20 px-4 py-2.5 text-sm font-medium text-white hover:bg-[color:var(--geoos-accent)]/30 disabled:opacity-60"
          >
            <Plus className="size-4" />
            {busy ? "Buscando…" : "Adicionar"}
          </button>
        </form>
        {error && <p className="mt-2 text-xs text-red-300">{error}</p>}

        <p className="mt-4 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-[11px] text-white/55">
          Apenas <strong className="text-white/85">uma prefeitura</strong> fica monitorada por vez —
          isso evita conflito de dados e notificações repetidas.
        </p>

        <section className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((p) => {
            const on = monitored === p.slug;
            return (
              <article
                key={p.slug}
                className={`group relative rounded-xl border p-4 backdrop-blur-xl transition-colors ${
                  on
                    ? "border-[color:var(--geoos-accent)]/60 bg-[color:var(--geoos-accent)]/10"
                    : "border-white/10 bg-white/[0.04] hover:border-[color:var(--geoos-accent)]/50"
                }`}
              >
                <Link to="/prefeituras/$slug" params={{ slug: p.slug }} className="block">
                  <h2 className="pr-8 text-base font-semibold">
                    {p.name}
                    {p.uf ? <span className="text-white/45"> · {p.uf}</span> : null}
                  </h2>
                  <p className="mt-1 flex items-center gap-1 text-xs text-white/50">
                    <MapPin className="size-3.5" />
                    {p.lat.toFixed(3)}, {p.lng.toFixed(3)} · raio {p.radiusKm} km
                  </p>
                  <p className="mt-3 text-xs text-[color:var(--geoos-accent)]">
                    Abrir painel municipal →
                  </p>
                </Link>

                <div className="mt-3 flex items-center justify-between border-t border-white/10 pt-3">
                  <span className="text-[11px] text-white/50">Monitorar este município</span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={on}
                    aria-label={`${on ? "Parar de monitorar" : "Monitorar"} ${p.name}`}
                    onClick={() => monitor(on ? null : p.slug)}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[10px] font-medium transition-colors ${
                      on
                        ? "border-emerald-400/40 bg-emerald-400/15 text-emerald-200"
                        : "border-white/10 bg-white/[0.04] text-white/45"
                    }`}
                  >
                    {on ? <Bell className="size-3" /> : <BellOff className="size-3" />}
                    {on ? "Monitorada" : "Desativada"}
                  </button>
                </div>

                <button
                  type="button"
                  aria-label={`Remover ${p.name}`}
                  onClick={() => {
                    if (on) monitor(null);
                    update(list.filter((x) => x.slug !== p.slug));
                  }}
                  className="absolute right-3 top-3 rounded-md p-1.5 text-white/40 opacity-0 transition hover:bg-red-500/15 hover:text-red-300 group-hover:opacity-100"
                >
                  <Trash2 className="size-4" />
                </button>
              </article>
            );
          })}
        </section>

        <section className="mt-8 rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-white/60">
            Fontes reais dos painéis
          </h2>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {FONTES_REAIS.map((f) => (
              <li key={f.id} className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                <p className="text-xs font-medium text-white/85">{f.label}</p>
                <p className="mt-0.5 text-[11px] text-white/45">{f.detail}</p>
              </li>
            ))}
          </ul>
        </section>

        <p className="mt-10 text-[11px] text-white/35">
          Projeto Integrador VI — Univesp · by GamaTec IA
        </p>

      </div>
    </main>
  );
}
