import { useEffect } from "react";
import { useGeoOS } from "@/geoos/core/store";
import { X, AlertTriangle, Info, CheckCircle2, AlertCircle } from "lucide-react";

const ICONS = { info: Info, warn: AlertTriangle, error: AlertCircle, success: CheckCircle2 };
const COLORS = { info: "hsl(200 60% 60%)", warn: "hsl(45 90% 60%)", error: "hsl(0 70% 60%)", success: "hsl(155 60% 55%)" };

export function ActivityCenter() {
  const open = useGeoOS((s) => s.activityOpen);
  const setOpen = useGeoOS((s) => s.setActivity);
  const notifs = useGeoOS((s) => s.notifications);
  const add = useGeoOS((s) => s.addNotification);
  const markAll = useGeoOS((s) => s.markAllRead);

  // seed demo notifications once
  useEffect(() => {
    if (useGeoOS.getState().notifications.length > 0) return;
    add({ level: "success", title: "GeoOS inicializado", message: "Todos os módulos operacionais." });
    add({ level: "warn", title: "Chuva forte prevista", message: "Grande São Paulo · próximas 3h." });
    add({ level: "error", title: "Foco de incêndio detectado", message: "Amazonas — coordenadas -4.9, -63.1" });
    add({ level: "info", title: "Sensor IoT 8821 reativado", message: "Osasco · qualidade do ar." });
  }, [add]);

  return (
    <aside
      className={`pointer-events-auto fixed right-0 top-0 z-40 h-full w-80 border-l border-white/10 bg-[color:var(--geoos-surface)]/85 backdrop-blur-2xl transition-transform ${
        open ? "translate-x-0" : "translate-x-full"
      }`}
    >
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div>
          <h3 className="text-sm font-semibold text-white">Central de Atividades</h3>
          <p className="text-[10px] text-white/50">{notifs.length} eventos</p>
        </div>
        <button onClick={() => setOpen(false)} className="grid h-7 w-7 place-items-center rounded-md text-white/60 hover:bg-white/10">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="flex items-center justify-between px-4 py-2">
        <span className="text-[10px] uppercase tracking-widest text-white/40">Notificações</span>
        <button onClick={markAll} className="text-[10px] text-white/50 hover:text-white/80">
          Marcar tudo como lido
        </button>
      </div>
      <div className="space-y-2 overflow-y-auto px-3 pb-4" style={{ maxHeight: "calc(100vh - 100px)" }}>
        {notifs.map((n) => {
          const Icon = ICONS[n.level];
          return (
            <div key={n.id} className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
              <div className="flex items-start gap-2">
                <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: COLORS[n.level] }} />
                <div className="flex-1">
                  <div className="text-xs font-medium text-white/90">{n.title}</div>
                  {n.message && <div className="mt-0.5 text-[11px] text-white/60">{n.message}</div>}
                  <div className="mt-1 text-[10px] text-white/40">{new Date(n.ts).toLocaleTimeString()}</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </aside>
  );
}
