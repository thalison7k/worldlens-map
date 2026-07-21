import { useGeoOS } from "@/geoos/core/store";
import { APPS_BY_ID } from "@/geoos/apps/registry";

/**
 * Minimal dock — the platform now exposes a single functional module
 * (Layers / Monitoramento Ambiental). All other legacy apps are hidden.
 */
const DOCK_APPS = ["layers"];

export function Dock() {
  const openApp = useGeoOS((s) => s.openApp);
  const windows = useGeoOS((s) => s.windows);
  const focusApp = useGeoOS((s) => s.focusApp);

  const items = DOCK_APPS.map((id) => APPS_BY_ID[id]).filter(Boolean);

  return (
    <div className="pointer-events-none fixed bottom-3 left-1/2 z-40 -translate-x-1/2">
      <div className="pointer-events-auto flex items-end gap-2 rounded-2xl border border-white/10 bg-[color:var(--geoos-surface)]/70 px-3 py-2 shadow-2xl backdrop-blur-xl">
        {items.map((app) => {
          const running = !!windows[app.id];
          return (
            <button
              key={app.id}
              onClick={() => (running ? focusApp(app.id) : openApp(app.id, app.defaultSize))}
              title={app.name}
              className="group relative flex h-11 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.05] px-3 transition hover:bg-white/10"
            >
              <app.icon className="h-5 w-5" style={{ color: `hsl(${app.color})` }} />
              <span className="text-xs font-medium text-white/90">Camadas</span>
              {running && <span className="absolute -bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-white/80" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
