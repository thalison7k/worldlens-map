import { cn } from "@/lib/utils";

const GAMATEC_URL = "https://gamateciadesenvolvimentowebprofissional.lovable.app/site";

/**
 * Assinatura de autoria "by GamaTec IA" — link externo para o site da GamaTec.
 * Variante `rail` é vertical (sidebar), `inline` é horizontal (topbar/dock).
 */
export function GamaTecBadge({
  variant = "inline",
  className,
}: {
  variant?: "inline" | "rail";
  className?: string;
}) {
  if (variant === "rail") {
    return (
      <a
        href={GAMATEC_URL}
        target="_blank"
        rel="noopener noreferrer"
        title="Desenvolvido por GamaTec IA"
        className={cn(
          "group flex flex-col items-center gap-1 rounded-md px-1 py-2 text-[9px] uppercase tracking-[0.25em] text-white/35 transition-colors hover:text-[color:var(--geoos-accent)]",
          className,
        )}
      >
        <span className="[writing-mode:vertical-rl]">by GamaTec IA</span>
        <span className="h-6 w-px bg-gradient-to-b from-[color:var(--geoos-accent)]/60 to-transparent transition-all group-hover:from-[color:var(--geoos-accent)]" />
      </a>
    );
  }

  return (
    <a
      href={GAMATEC_URL}
      target="_blank"
      rel="noopener noreferrer"
      title="Desenvolvido por GamaTec IA"
      className={cn(
        "group inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.03] px-2 py-1 font-mono text-[9px] uppercase tracking-[0.18em] text-white/45 transition-colors hover:border-[color:var(--geoos-accent)]/40 hover:bg-[color:var(--geoos-accent)]/10 hover:text-white/90",
        className,
      )}
    >
      <span
        className="h-1.5 w-1.5 rounded-full bg-[color:var(--geoos-accent)] shadow-[0_0_8px_currentColor] text-[color:var(--geoos-accent)]"
        aria-hidden
      />
      by <span className="font-semibold text-white/70 group-hover:text-[color:var(--geoos-accent)]">GamaTec IA</span>
    </a>
  );
}
