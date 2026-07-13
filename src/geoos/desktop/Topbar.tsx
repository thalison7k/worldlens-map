import { useEffect, useState } from "react";
import { Bell, Search, Sun, Moon, Bot, Palette } from "lucide-react";
import { useGeoOS } from "@/geoos/core/store";
import { WORKSPACES } from "@/geoos/core/workspaces";
import { THEME_VARIANTS } from "@/geoos/core/theme";
import { bus } from "@/geoos/core/bus";

export function Topbar() {
  const workspaceId = useGeoOS((s) => s.workspaceId);
  const ws = WORKSPACES.find((w) => w.id === workspaceId);
  const setPalette = useGeoOS((s) => s.setPalette);
  const setActivity = useGeoOS((s) => s.setActivity);
  const activityOpen = useGeoOS((s) => s.activityOpen);
  const theme = useGeoOS((s) => s.theme);
  const setTheme = useGeoOS((s) => s.setTheme);
  const notifs = useGeoOS((s) => s.notifications);
  const openApp = useGeoOS((s) => s.openApp);
  const unread = notifs.filter((n) => !n.read).length;
  const [time, setTime] = useState(() => new Date());

  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  const [paletteOpen, setThemePalette] = useState(false);


  return (
    <header className="pointer-events-none fixed left-16 right-0 top-0 z-40 flex h-11 items-center gap-3 border-b border-white/5 bg-[color:var(--geoos-surface)]/50 px-4 backdrop-blur-xl">
      <div className="pointer-events-auto flex items-center gap-2 text-xs">
        <span className="rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 font-mono text-[10px] uppercase tracking-widest text-white/50">
          GeoOS
        </span>
        <span className="text-white/40">/</span>
        <span className="rounded-md px-2 py-1 text-white/80" style={{ background: `hsl(${ws?.accent} / 0.15)`, color: `hsl(${ws?.accent})` }}>
          {ws?.name}
        </span>
      </div>

      <button
        onClick={() => setPalette(true)}
        className="pointer-events-auto ml-4 flex flex-1 max-w-md items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-left text-xs text-white/50 hover:bg-white/[0.06]"
      >
        <Search className="h-3.5 w-3.5" />
        <span>Buscar apps, lugares, camadas…</span>
        <span className="ml-auto rounded border border-white/10 px-1.5 py-0.5 font-mono text-[9px] text-white/40">⌘K</span>
      </button>

      <div className="pointer-events-auto ml-auto flex items-center gap-1">
        <button
          onClick={() => openApp("geo-ai")}
          className="grid h-8 w-8 place-items-center rounded-lg border border-white/10 bg-white/[0.03] text-white/70 hover:bg-white/10"
          title="Geo AI Copilot"
        >
          <Bot className="h-4 w-4" />
        </button>
        <button
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          className="grid h-8 w-8 place-items-center rounded-lg border border-white/10 bg-white/[0.03] text-white/70 hover:bg-white/10"
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
            <div className="absolute right-0 top-9 z-50 w-48 overflow-hidden rounded-lg border border-white/10 bg-[color:var(--geoos-surface)]/95 p-1 shadow-2xl backdrop-blur-xl">
              {THEME_VARIANTS.map((v) => (
                <button
                  key={v.id}
                  onClick={() => {
                    setThemePalette(false);
                    setTheme(v.mode);
                    bus.emit("theme.change", { theme: v.mode, variant: v.id });
                  }}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-white/80 hover:bg-white/10"
                >
                  <span className="h-3 w-3 rounded-full" style={{ background: v.tokens.accent }} />
                  <span>{v.label}</span>
                  <span className="ml-auto text-[9px] uppercase tracking-widest text-white/40">{v.mode}</span>
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
