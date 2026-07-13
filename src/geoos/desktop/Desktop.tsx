import { useEffect } from "react";
import { useGeoOS } from "@/geoos/core/store";
import { MapKernel } from "./MapKernel";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { Dock } from "./Dock";
import { WindowLayer } from "./WindowLayer";
import { CommandPalette } from "./CommandPalette";
import { ActivityCenter } from "./ActivityCenter";
import { bus } from "@/geoos/core/bus";
import { startThemeEngine } from "@/geoos/core/theme";

export function Desktop() {
  const theme = useGeoOS((s) => s.theme);
  const openApp = useGeoOS((s) => s.openApp);
  const addNotification = useGeoOS((s) => s.addNotification);

  useEffect(() => {
    startThemeEngine();
  }, []);

  useEffect(() => {
    bus.emit("theme.change", { theme });
  }, [theme]);

  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
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
      <WindowLayer />
      <Dock />
      <ActivityCenter />
      <CommandPalette />
    </div>
  );
}
