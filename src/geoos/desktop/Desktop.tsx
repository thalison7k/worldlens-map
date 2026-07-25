import { useEffect } from "react";
import { useGeoOS } from "@/geoos/core/store";
import { MapKernel } from "./MapKernel";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { Dock } from "./Dock";
import { WindowLayer } from "./WindowLayer";
import { CommandPalette } from "./CommandPalette";
import { ActivityCenter } from "./ActivityCenter";
import { MapToolbar } from "./MapToolbar";
import { QuickLayersBar } from "./QuickLayersBar";
import { bus } from "@/geoos/core/bus";
import { startThemeEngine } from "@/geoos/core/theme";

export function Desktop() {
  const theme = useGeoOS((s) => s.theme);
  const openApp = useGeoOS((s) => s.openApp);
  const addNotification = useGeoOS((s) => s.addNotification);

  useEffect(() => {
    startThemeEngine();
    // Auto-open the single functional module so users see it immediately.
    const isMobile = typeof window !== "undefined" && window.innerWidth < 640;
    openApp("layers", isMobile
      ? { x: 0, y: 44, width: window.innerWidth, height: window.innerHeight - 44 - 72, maximized: false }
      : { x: window.innerWidth - 400, y: 60, width: 380, height: 620 });
  }, [openApp]);

  useEffect(() => {
    bus.emit("theme.change", { theme });
  }, [theme]);

  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    // Never register the SW in Lovable preview/dev — it can serve stale HTML.
    const h = window.location.hostname;
    const isPreview =
      !import.meta.env.PROD ||
      window.self !== window.top ||
      h.startsWith("id-preview--") ||
      h.startsWith("preview--") ||
      h.endsWith(".lovableproject.com") ||
      h.endsWith(".lovableproject-dev.com") ||
      h.endsWith(".beta.lovable.dev") ||
      new URLSearchParams(window.location.search).has("sw-off");
    if (isPreview) {
      navigator.serviceWorker.getRegistrations?.().then((rs) => rs.forEach((r) => r.unregister())).catch(() => {});
      return;
    }
    const onLoad = () => navigator.serviceWorker.register("/sw.js").catch(() => {});
    window.addEventListener("load", onLoad);
    return () => window.removeEventListener("load", onLoad);
  }, []);

  // Bus → store bridge (apps request opens/notifications via bus, not directly)
  useEffect(() => {
    const onOpen = ({ appId }: { appId: string }) => openApp(appId);
    const onNotify = (p: { title: string; message?: string; level?: "info" | "warn" | "error" | "success" }) =>
      addNotification({ title: p.title, message: p.message, level: p.level ?? "info" });
    bus.on("app.open", onOpen);
    bus.on("notify", onNotify);
    return () => {
      bus.off("app.open", onOpen);
      bus.off("notify", onNotify);
    };
  }, [openApp, addNotification]);

  return (
    <div className="geoos-shell fixed inset-0 overflow-hidden bg-[color:var(--geoos-bg)] text-white">
      <MapKernel theme={theme} />
      <div className="pointer-events-none fixed inset-0 z-10 bg-gradient-to-b from-black/20 via-transparent to-black/40" />
      <Sidebar />
      <Topbar />
      <QuickLayersBar />
      <MapToolbar />
      <WindowLayer />
      <Dock />
      <ActivityCenter />
      <CommandPalette />
    </div>
  );
}
