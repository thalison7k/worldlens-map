import { useEffect, useState } from "react";
import { Bell, Search, Sun, Moon, Palette, Download } from "lucide-react";
import { useGeoOS } from "@/geoos/core/store";
import { WORKSPACES } from "@/geoos/core/workspaces";
import { THEME_VARIANTS } from "@/geoos/core/theme";
import { bus } from "@/geoos/core/bus";
import { usePWAInstall } from "@/hooks/use-pwa-install";
import { GamaTecBadge } from "./GamaTecBadge";

export function Topbar() {
  const workspaceId = useGeoOS((s) => s.workspaceId);
  const ws = WORKSPACES.find((w) => w.id === workspaceId);
  const setPalette = useGeoOS((s) => s.setPalette);
  const setActivity = useGeoOS((s) => s.setActivity);
  const activityOpen = useGeoOS((s) => s.activityOpen);
  const theme = useGeoOS((s) => s.theme);
  const setTheme = useGeoOS((s) => s.setTheme);
  const notifs = useGeoOS((s) => s.notifications);
  
  const unread = notifs.filter((n) => !n.read).length;
  const [time, setTime] = useState(() => new Date());

  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  const [paletteOpen, setThemePalette] = useState(false);
  const [variant, setVariant] = useState<string>(() => getCurrentVariant());
  const { canInstall, install } = usePWAInstall();

  // fecha o seletor de temas ao clicar fora ou apertar Esc
  useEffect(() => {
    if (!paletteOpen) return;
    const close = () => setThemePalette(false);
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [paletteOpen]);




  return (
    <header data-geoos-obstacle className="pointer-events-none fixed left-0 right-0 top-0 z-40 flex h-11 items-center gap-2 border-b border-white/5 bg-[color:var(--geoos-surface)]/50 px-3 backdrop-blur-xl sm:left-12 sm:gap-3 sm:px-4">
      <div className="pointer-events-auto flex items-center gap-2 text-xs">
        <span className="rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 font-mono text-[10px] uppercase tracking-widest text-white/60">
          GeoOS · Ambiental
        </span>
        <GamaTecBadge className="sm:hidden" />
        <span className="hidden text-white/40 sm:inline">/</span>
        <span className="hidden rounded-md px-2 py-1 text-white/80 sm:inline" style={{ background: `hsl(${ws?.accent} / 0.15)`, color: `hsl(${ws?.accent})` }}>
          {ws?.name}
        </span>
      </div>

      <button
        onClick={() => setPalette(true)}
        className="pointer-events-auto ml-2 flex flex-1 max-w-md items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-left text-xs text-white/50 hover:bg-white/[0.06] sm:ml-4"
      >
        <Search className="h-3.5 w-3.5" />
        <span className="truncate">Buscar lugar ou camada…</span>
        <span className="ml-auto hidden rounded border border-white/10 px-1.5 py-0.5 font-mono text-[9px] text-white/40 sm:inline">⌘K</span>
      </button>

      <div className="pointer-events-auto ml-auto flex items-center gap-1">
        {canInstall && (
          <button
            onClick={() => void install()}
            className="flex h-8 items-center gap-1.5 rounded-lg border border-[color:var(--geoos-accent)]/40 bg-[color:var(--geoos-accent)]/15 px-2.5 text-[11px] font-medium text-white hover:bg-[color:var(--geoos-accent)]/25"
            title="Instalar como app (mobile ou desktop)"
          >
            <Download className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Instalar</span>
          </button>
        )}
        <button
          onClick={() => {
            const next = theme === "dark" ? "light" : "dark";
            setTheme(next);
            // sem este evento o Theme Engine nunca aplicava os tokens/mapa
            bus.emit("theme.change", { theme: next });
          }}
          className="grid h-8 w-8 place-items-center rounded-lg border border-white/10 bg-white/[0.03] text-white/70 transition-colors hover:bg-white/10"
          title="Alternar Light/Dark"
        >
          {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>

        <div className="relative">
          <button
            onClick={() => setThemePalette((v) => !v)}
            className="grid h-8 w-8 place-items-center rounded-lg border border-white/10 bg-white/[0.03] text-white/70 hover:bg-white/10"
            title="Variantes de tema"
          >
            <Palette className="h-4 w-4" />
          </button>
          {paletteOpen && (
            <div className="absolute right-0 top-9 z-50 w-64 overflow-hidden rounded-xl border border-white/10 bg-[color:var(--geoos-surface)]/95 p-1.5 shadow-2xl backdrop-blur-xl">
              <div className="px-2 pb-1.5 pt-1 font-mono text-[9px] uppercase tracking-[0.2em] text-white/35">
                GamaTec Themes
              </div>
              {THEME_VARIANTS.map((v) => (
                <button
                  key={v.id}
                  onClick={() => {
                    setThemePalette(false);
                    setTheme(v.mode);
                    bus.emit("theme.change", { theme: v.mode, variant: v.id });
                  }}
                  className="group flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors hover:bg-white/[0.08]"
                >
                  <span
                    className="h-7 w-7 shrink-0 rounded-md border border-white/15 transition-transform group-hover:scale-105"
                    style={{ background: `linear-gradient(135deg, ${v.tokens.accent}, ${v.tokens.accent2})` }}
                  />
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-medium text-white/90">{v.label}</span>
                    <span className="block truncate text-[10px] text-white/45">{v.hint}</span>
                  </span>
                  <span className="ml-auto rounded border border-white/10 px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-widest text-white/40">
                    {v.mode}
                  </span>
                </button>
              ))}
            </div>
          )}

        </div>
        <button
          onClick={() => setActivity(!activityOpen)}
          className="relative grid h-8 w-8 place-items-center rounded-lg border border-white/10 bg-white/[0.03] text-white/70 hover:bg-white/10"
          title="Notificações"
        >
          <Bell className="h-4 w-4" />
          {unread > 0 && (
            <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-red-400" />
          )}
        </button>
        <span className="ml-2 rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1 font-mono text-[10px] text-white/70">
          {time.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
        </span>
      </div>
    </header>
  );
}
