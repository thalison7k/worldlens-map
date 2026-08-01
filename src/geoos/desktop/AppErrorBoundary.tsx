import { Component, type ReactNode } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

type Props = { appName: string; children: ReactNode };
type State = { error: Error | null };

/**
 * Isola cada janela de app: um erro de runtime dentro de um módulo nunca
 * derruba o desktop nem o mapa — vira um cartão de erro recuperável.
 */
export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: unknown) {
    console.error(`[GeoOS] erro no app "${this.props.appName}":`, error, info);
  }

  override render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <AlertTriangle className="h-7 w-7 text-amber-400" />
        <div>
          <p className="text-sm font-semibold text-white">O módulo {this.props.appName} falhou</p>
          <p className="mt-1 text-[11px] text-white/60">{this.state.error.message}</p>
          <p className="mt-1 text-[11px] text-white/40">O mapa e os demais módulos continuam funcionando.</p>
        </div>
        <button
          onClick={() => this.setState({ error: null })}
          className="flex items-center gap-1.5 rounded-md border border-white/15 px-3 py-1.5 text-[11px] text-white/80 transition hover:bg-white/10"
        >
          <RotateCcw className="h-3 w-3" /> Recarregar módulo
        </button>
      </div>
    );
  }
}
