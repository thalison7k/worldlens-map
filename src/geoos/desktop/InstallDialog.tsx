import { Download, Share, MoreVertical, Monitor, Smartphone, X } from "lucide-react";
import type { InstallPlatform } from "@/hooks/use-pwa-install";

const STEPS: Record<InstallPlatform, { icon: typeof Share; text: string }[]> = {
  ios: [
    { icon: Share, text: "Toque no botão Compartilhar (quadrado com seta) na barra do Safari" },
    { icon: Download, text: 'Role a lista e toque em "Adicionar à Tela de Início"' },
    { icon: Download, text: 'Confirme tocando em "Adicionar" no topo da tela' },
  ],
  android: [
    { icon: MoreVertical, text: "Toque no menu ⋮ no canto superior direito do Chrome" },
    { icon: Download, text: 'Toque em "Instalar aplicativo" ou "Adicionar à tela inicial"' },
    { icon: Download, text: 'Confirme tocando em "Instalar"' },
  ],
  desktop: [
    { icon: Monitor, text: "No Chrome ou Edge, clique no ícone de instalação na barra de endereço" },
    { icon: Monitor, text: 'Se não aparecer, abra o menu ⋮ e clique em "Instalar GeoOS…"' },
    { icon: Download, text: "O app abre em janela própria, como um programa" },
  ],
};

export function InstallDialog({
  platform,
  native,
  onClose,
}: {
  platform: InstallPlatform;
  native: boolean;
  onClose: () => void;
}) {
  const steps = STEPS[platform];
  const platformLabel =
    platform === "ios" ? "iPhone / iPad" : platform === "android" ? "Android" : "Computador";

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 p-4 backdrop-blur-sm sm:items-center"
      onClick={onClose}
      data-geoos-obstacle
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm overflow-hidden rounded-2xl border border-white/10 bg-[color:var(--geoos-surface)]/95 shadow-2xl backdrop-blur-xl animate-in fade-in slide-in-from-bottom-4 duration-200"
        role="dialog"
        aria-label="Instalar o GeoOS"
      >
        <div className="flex items-center gap-3 border-b border-white/5 px-4 py-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-[color:var(--geoos-accent)]/40 bg-[color:var(--geoos-accent)]/15">
            <Download className="h-4.5 w-4.5 text-[color:var(--geoos-accent)]" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-white/90">Instalar o GeoOS</p>
            <p className="truncate text-[11px] text-white/45">App na tela de início, em tela cheia</p>
          </div>
          <button
            onClick={onClose}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-white/50 hover:bg-white/10 hover:text-white"
            aria-label="Fechar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-4 py-3">
          {native ? (
            <p className="mb-3 rounded-lg border border-[color:var(--geoos-accent)]/30 bg-[color:var(--geoos-accent)]/10 px-3 py-2 text-[11px] leading-relaxed text-white/70">
              O aviso de instalação do navegador foi aberto. Se preferir fazer manualmente, siga os
              passos abaixo.
            </p>
          ) : (
            <p className="mb-3 text-[11px] leading-relaxed text-white/50">
              Instalação manual no seu {platformLabel} — leva menos de um minuto:
            </p>
          )}
          <ol className="space-y-2.5">
            {steps.map(({ icon: Icon, text }, i) => (
              <li key={i} className="flex items-start gap-2.5">
                <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md border border-white/10 bg-white/[0.05] font-mono text-[10px] text-white/60">
                  {i + 1}
                </span>
                <Icon className="mt-1 h-4 w-4 shrink-0 text-[color:var(--geoos-accent)]" />
                <span className="text-[12px] leading-relaxed text-white/75">{text}</span>
              </li>
            ))}
          </ol>
          <p className="mt-3 flex items-center gap-1.5 rounded-lg bg-white/[0.03] px-3 py-2 text-[10px] text-white/40">
            <Smartphone className="h-3.5 w-3.5 shrink-0" />
            Funciona offline nas telas já visitadas e abre como app nativo.
          </p>
        </div>
      </div>
    </div>
  );
}
