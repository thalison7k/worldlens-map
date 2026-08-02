import { create } from "zustand";
import type { Notification, WindowState } from "./types";

type State = {
  workspaceId: string;
  windows: Record<string, WindowState>;
  order: string[]; // z-order, last = top
  activeAppId: string | null;
  notifications: Notification[];
  activityOpen: boolean;
  paletteOpen: boolean;
  theme: "dark" | "light";
};

type Actions = {
  openApp: (appId: string, defaults?: Partial<WindowState>) => void;
  closeApp: (appId: string) => void;
  focusApp: (appId: string) => void;
  minimizeApp: (appId: string) => void;
  maximizeApp: (appId: string) => void;
  moveApp: (appId: string, x: number, y: number) => void;
  resizeApp: (appId: string, w: number, h: number) => void;
  setWorkspace: (id: string) => void;
  addNotification: (n: Omit<Notification, "id" | "ts">) => void;
  markAllRead: () => void;
  setActivity: (open: boolean) => void;
  setPalette: (open: boolean) => void;
  setTheme: (t: "dark" | "light") => void;
};

let zCounter = 10;

export const useGeoOS = create<State & Actions>((set, get) => ({
  workspaceId: "environment",
  windows: {},
  order: [],
  activeAppId: null,
  notifications: [],
  activityOpen: false,
  paletteOpen: false,
  theme: "dark",

  openApp: (appId, defaults) => {
    const existing = get().windows[appId];
    if (existing) {
      get().focusApp(appId);
      set((s) => ({ windows: { ...s.windows, [appId]: { ...existing, minimized: false } } }));
      return;
    }
    zCounter += 1;
    const vw = typeof window !== "undefined" ? window.innerWidth : 1280;
    const vh = typeof window !== "undefined" ? window.innerHeight : 800;
    const isMobile = vw < 640;
    // Em telas pequenas a janela ocupa a área útil entre a topbar e o dock.
    const width = isMobile ? vw - 12 : Math.min(defaults?.width ?? 720, vw - 24);
    const height = isMobile
      ? Math.max(260, vh - 44 - 88 - 12)
      : Math.min(defaults?.height ?? 480, vh - 120);
    const x = isMobile ? 6 : Math.max(8, Math.min(defaults?.x ?? 120 + Math.random() * 80, vw - width - 8));
    const y = isMobile ? 50 : Math.max(48, Math.min(defaults?.y ?? 100 + Math.random() * 60, vh - height - 24));
    const w: WindowState = {
      appId,
      x,
      y,
      width,
      height,
      z: zCounter,
      minimized: false,
      maximized: defaults?.maximized ?? false,
    };

    set((s) => ({
      windows: { ...s.windows, [appId]: w },
      order: [...s.order.filter((id) => id !== appId), appId],
      activeAppId: appId,
    }));
  },

  closeApp: (appId) =>
    set((s) => {
      const { [appId]: _drop, ...rest } = s.windows;
      const order = s.order.filter((id) => id !== appId);
      return { windows: rest, order, activeAppId: order[order.length - 1] ?? null };
    }),

  focusApp: (appId) => {
    zCounter += 1;
    set((s) => {
      const w = s.windows[appId];
      if (!w) return s;
      return {
        windows: { ...s.windows, [appId]: { ...w, z: zCounter, minimized: false } },
        order: [...s.order.filter((id) => id !== appId), appId],
        activeAppId: appId,
      };
    });
  },

  minimizeApp: (appId) =>
    set((s) => {
      const w = s.windows[appId];
      if (!w) return s;
      return { windows: { ...s.windows, [appId]: { ...w, minimized: true } } };
    }),

  maximizeApp: (appId) =>
    set((s) => {
      const w = s.windows[appId];
      if (!w) return s;
      return { windows: { ...s.windows, [appId]: { ...w, maximized: !w.maximized } } };
    }),

  moveApp: (appId, x, y) =>
    set((s) => {
      const w = s.windows[appId];
      if (!w) return s;
      return { windows: { ...s.windows, [appId]: { ...w, x, y } } };
    }),

  resizeApp: (appId, width, height) =>
    set((s) => {
      const w = s.windows[appId];
      if (!w) return s;
      return { windows: { ...s.windows, [appId]: { ...w, width, height } } };
    }),

  setWorkspace: (id) => set({ workspaceId: id }),

  addNotification: (n) =>
    set((s) => ({
      notifications: [
        { id: Math.random().toString(36).slice(2), ts: Date.now(), ...n },
        ...s.notifications,
      ].slice(0, 50),
    })),
  markAllRead: () => set((s) => ({ notifications: s.notifications.map((n) => ({ ...n, read: true })) })),
  setActivity: (open) => set({ activityOpen: open }),
  setPalette: (open) => set({ paletteOpen: open }),
  setTheme: (theme) => set({ theme }),
}));
