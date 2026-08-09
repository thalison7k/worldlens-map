import { useGeoOS } from "@/geoos/core/store";
import { APPS_BY_ID, APPS } from "@/geoos/apps/registry";

export function Dock() {
  const openApp = useGeoOS((s) => s.openApp);
  const windows = useGeoOS((s) => s.windows);
  const focusApp = useGeoOS((s) => s.focusApp);
  const minimizeApp = useGeoOS((s) => s.minimizeApp);
  const activeAppId = useGeoOS((s) => s.activeAppId);

  const items = APPS.map((a) => APPS_BY_ID[a.id]).filter(Boolean);

  return (
    <div className="pointer-events-none fixed bottom-3 left-1/2 z-40 -translate-x-1/2">
      <div data-geoos-obstacle className="pointer-events-auto flex items-end gap-1.5 rounded-2xl border border-white/10 bg-[color:var(--geoos-surface)]/70 px-2 py-1.5 shadow-2xl backdrop-blur-xl">
        {items.map((app) => {
          const win = windows[app.id];
          const running = !!win;
          const minimized = !!win?.minimized;
          const isActive = running && !minimized && activeAppId === app.id;
          return (
            <button
              key={app.id}
              onClick={() => {
                if (!running) return openApp(app.id, app.defaultSize);
                if (isActive) return minimizeApp(app.id);
                focusApp(app.id);
              }}
              title={
                !running
                  ? `Abrir ${app.name}`
                  : isActive
                    ? `Minimizar ${app.name}`
                    : `Restaurar ${app.name}`
              }
              className="group relative flex h-11 touch-manipulation items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.05] px-2.5 transition active:scale-95 hover:bg-white/10"
            >
              <app.icon
                className="h-4 w-4"
                style={{ color: `hsl(${app.color})`, opacity: minimized ? 0.5 : 1 }}
              />
              <span className="hidden text-[11px] font-medium text-white/90 sm:inline">{app.name}</span>
              {running && (
                <span
                  className={`absolute -bottom-1 left-1/2 h-1 -translate-x-1/2 rounded-full ${
                    minimized ? "w-3 bg-white/35" : "w-1 bg-white/80"
                  }`}
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

