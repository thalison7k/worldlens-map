import { useGeoOS } from "@/geoos/core/store";
import { Sparkles } from "lucide-react";

export default function PlaceholderApp() {
  const active = useGeoOS((s) => s.activeAppId);
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
      <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur">
        <Sparkles className="h-6 w-6 text-[color:var(--geoos-accent)]" />
      </div>
      <h3 className="text-lg font-semibold">Módulo em preparação</h3>
      <p className="max-w-sm text-sm text-white/60">
        O app <span className="text-white/90">{active}</span> faz parte da grade do GeoOS.
        A lógica completa é entregue nas próximas sub-fases (4.2 – 4.4). A janela, arrasto,
        redimensionamento, foco e integração com o Event Bus já estão ativos.
      </p>
    </div>
  );
}
