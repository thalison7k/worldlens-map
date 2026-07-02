import { useGeoOS } from "@/geoos/core/store";
import { APPS, APPS_BY_ID } from "@/geoos/apps/registry";
import { WORKSPACES } from "@/geoos/core/workspaces";

const CORE_DOCK = ["geo-maps", "layers", "analysis", "command-center", "geo-ai", "temporal", "geo-story"];

export function Dock() {
  const openApp = useGeoOS((s) => s.openApp);
  const windows = useGeoOS((s) => s.windows);
  const focusApp = useGeoOS((s) => s.focusApp);
  const workspaceId = useGeoOS((s) => s.workspaceId);
  const ws = WORKSPACES.find((w) => w.id === workspaceId);

  const ids = Array.from(new Set([...(ws?.apps ?? []), ...CORE_DOCK])).slice(0, 12);
  const items = ids.map((id) => APPS_BY_ID[id]).filter(Boolean);

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
              className="group relative grid h-12 w-12 place-items-center rounded-xl border border-white/10 bg-white/[0.05] transition hover:scale-110 hover:bg-white/10"
            >
              <app.icon className="h-5 w-5" style={{ color: `hsl(${app.color})` }} />
              {running && <span className="absolute -bottom-1 h-1 w-1 rounded-full bg-white/80" />}
              <span className="pointer-events-none absolute -top-8 whitespace-nowrap rounded-md bg-black/80 px-2 py-1 text-[10px] text-white opacity-0 transition group-hover:opacity-100">
                {app.name}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
