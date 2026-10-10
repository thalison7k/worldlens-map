import { useEffect, useState } from "react";

type BIPEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export type InstallPlatform = "ios" | "android" | "desktop";

function detectPlatform(): InstallPlatform {
  if (typeof navigator === "undefined") return "desktop";
  const ua = navigator.userAgent || "";
  const isIOS =
    /iPad|iPhone|iPod/.test(ua) ||
    // iPadOS 13+ reports itself as Mac with touch support
    (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  if (isIOS) return "ios";
  if (/Android/.test(ua)) return "android";
  return "desktop";
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)")?.matches ||
    window.matchMedia?.("(display-mode: minimal-ui)")?.matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

/**
 * Install availability for the PWA.
 *
 * `canInstall` is true whenever the app is not already installed — the button
 * must ALWAYS be visible. `native` tells whether the browser fired
 * `beforeinstallprompt` (one-tap install); otherwise the UI shows manual
 * instructions (iOS Safari never fires that event, and desktop Chrome only
 * fires it once per page load).
 */
export function usePWAInstall() {
  const [deferred, setDeferred] = useState<BIPEvent | null>(null);
  const [installed, setInstalled] = useState(() => isStandalone());
  const [platform, setPlatform] = useState<InstallPlatform>(() => detectPlatform());

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BIPEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
    };
    const onDisplayChange = (e: MediaQueryListEvent) => {
      if (e.matches) setInstalled(true);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    window.matchMedia?.("(display-mode: standalone)").addEventListener?.("change", onDisplayChange);
    if (isStandalone()) setInstalled(true);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
      window.matchMedia?.("(display-mode: standalone)").removeEventListener?.("change", onDisplayChange);
    };
  }, []);

  return {
    // Always offer install while not in standalone mode.
    canInstall: !installed,
    native: !!deferred,
    installed,
    platform,
    async install(): Promise<"accepted" | "dismissed" | "manual"> {
      if (installed) return "dismissed";
      if (!deferred) return "manual";
      await deferred.prompt();
      const { outcome } = await deferred.userChoice;
      setDeferred(null);
      return outcome;
    },
  };
}
