import { useEffect, useMemo, useState } from "react";
import { useGeoOS } from "@/geoos/core/store";
import {
  X,
  AlertTriangle,
  Info,
  CheckCircle2,
  AlertCircle,
  Star,
  Trash2,
  CheckCheck,
  Eraser,
} from "lucide-react";

const ICONS = { info: Info, warn: AlertTriangle, error: AlertCircle, success: CheckCircle2 };
const COLORS = {
  info: "hsl(200 60% 60%)",
  warn: "hsl(45 90% 60%)",
  error: "hsl(0 70% 60%)",
  success: "hsl(155 60% 55%)",
};

type Filter = "all" | "unread" | "saved";

export function ActivityCenter() {
  const open = useGeoOS((s) => s.activityOpen);
  const setOpen = useGeoOS((s) => s.setActivity);
  const notifs = useGeoOS((s) => s.notifications);
  const hydrate = useGeoOS((s) => s.hydrateNotifications);
  const markAll = useGeoOS((s) => s.markAllRead);
  const markRead = useGeoOS((s) => s.markRead);
  const remove = useGeoOS((s) => s.removeNotification);
  const toggleSaved = useGeoOS((s) => s.toggleSaved);
  const clear = useGeoOS((s) => s.clearNotifications);
  const [filter, setFilter] = useState<Filter>("all");

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  const unread = notifs.filter((n) => !n.read).length;
  const savedCount = notifs.filter((n) => n.saved).length;

  const list = useMemo(() => {
    const base =
      filter === "unread"
        ? notifs.filter((n) => !n.read)
        : filter === "saved"
          ? notifs.filter((n) => n.saved)
          : notifs;
    // A prefeitura monitorada sempre aparece no topo da lista.
    return [...base].sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || b.ts - a.ts);
  }, [notifs, filter]);

  const monitored = useMemo(
    () => notifs.find((n) => n.pinned && n.source)?.source ?? null,
    [notifs],
  );

  const TABS: { id: Filter; label: string; count: number }[] = [
    { id: "all", label: "Todas", count: notifs.length },
    { id: "unread", label: "Não lidas", count: unread },
    { id: "saved", label: "Salvas", count: savedCount },
  ];


  return (
    <aside
      className={`pointer-events-auto fixed right-0 top-0 z-40 flex h-full w-[min(22rem,100vw)] flex-col border-l border-white/10 bg-[color:var(--geoos-surface)]/85 backdrop-blur-2xl transition-transform ${
        open ? "translate-x-0" : "translate-x-full"
      }`}
    >
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div>
          <h3 className="text-sm font-semibold text-white">Central de Atividades</h3>
          <p className="text-[10px] text-white/50">
            {notifs.length} eventos · {unread} não lidos
          </p>
        </div>
        <button
          onClick={() => setOpen(false)}
          className="grid h-7 w-7 place-items-center rounded-md text-white/60 hover:bg-white/10"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex gap-1 px-3 pt-3">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setFilter(t.id)}
            className={`flex-1 rounded-lg border px-2 py-1.5 text-[11px] transition-colors ${
              filter === t.id
                ? "border-[color:var(--geoos-accent)]/50 bg-[color:var(--geoos-accent)]/15 text-white"
                : "border-white/10 bg-white/[0.03] text-white/60 hover:bg-white/10"
            }`}
          >
            {t.label} <span className="text-white/40">{t.count}</span>
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2 px-3 py-2">
        <button
          onClick={markAll}
          className="inline-flex items-center gap-1 rounded-md border border-white/10 px-2 py-1 text-[10px] text-white/60 hover:bg-white/10"
        >
          <CheckCheck className="h-3 w-3" /> Marcar lidas
        </button>
        <button
          onClick={() => clear({ keepSaved: true })}
          className="inline-flex items-center gap-1 rounded-md border border-white/10 px-2 py-1 text-[10px] text-white/60 hover:bg-white/10"
        >
          <Eraser className="h-3 w-3" /> Limpar (manter salvas)
        </button>
        <button
          onClick={() => clear()}
          className="ml-auto inline-flex items-center gap-1 rounded-md border border-red-400/30 px-2 py-1 text-[10px] text-red-300 hover:bg-red-500/15"
        >
          <Trash2 className="h-3 w-3" /> Tudo
        </button>
      </div>

      {monitored && (
        <div className="mx-3 mb-2 rounded-lg border border-[color:var(--geoos-accent)]/35 bg-[color:var(--geoos-accent)]/10 px-3 py-2">
          <p className="text-[9px] uppercase tracking-wider text-white/50">Monitorando</p>
          <p className="text-[11px] font-medium text-white/90">{monitored}</p>
        </div>
      )}

      <div className="flex-1 space-y-2 overflow-y-auto px-3 pb-6">
        {list.length === 0 && (
          <p className="rounded-lg border border-white/10 bg-white/[0.03] p-4 text-center text-[11px] text-white/50">
            Nenhuma notificação aqui.
          </p>
        )}
        {list.map((n) => {
          const Icon = ICONS[n.level];
          return (
            <div
              key={n.id}
              onClick={() => !n.read && markRead(n.id)}
              className={`group rounded-lg border p-3 transition-colors ${
                n.pinned
                  ? "border-[color:var(--geoos-accent)]/45 bg-[color:var(--geoos-accent)]/10"
                  : n.read
                    ? "border-white/10 bg-white/[0.03]"
                    : "border-[color:var(--geoos-accent)]/30 bg-white/[0.06]"
              }`}
            >

              <div className="flex items-start gap-2">
                <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: COLORS[n.level] }} />
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium text-white/90">{n.title}</div>
                  {n.message && <div className="mt-0.5 text-[11px] text-white/60">{n.message}</div>}
                  {n.source && (
                    <div className="mt-1 inline-block rounded border border-white/10 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-white/45">
                      {n.source}
                    </div>
                  )}
                  <div className="mt-1 text-[10px] text-white/40">
                    {new Date(n.ts).toLocaleString("pt-BR", {
                      day: "2-digit",
                      month: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </div>
                </div>
                <div className="flex shrink-0 flex-col gap-1">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleSaved(n.id);
                    }}
                    title={n.saved ? "Remover dos salvos" : "Salvar"}
                    className={`grid h-6 w-6 place-items-center rounded-md hover:bg-white/10 ${
                      n.saved ? "text-amber-300" : "text-white/40"
                    }`}
                  >
                    <Star className="h-3.5 w-3.5" fill={n.saved ? "currentColor" : "none"} />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      remove(n.id);
                    }}
                    title="Apagar"
                    className="grid h-6 w-6 place-items-center rounded-md text-white/40 hover:bg-red-500/20 hover:text-red-300"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </aside>
  );
}
