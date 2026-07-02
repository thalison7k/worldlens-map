import { useEffect } from "react";
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from "@/components/ui/command";
import { useGeoOS } from "@/geoos/core/store";
import { APPS } from "@/geoos/apps/registry";
import { WORKSPACES } from "@/geoos/core/workspaces";
import { bus } from "@/geoos/core/bus";

const PLACES = [
  { label: "São Paulo, BR", lat: -23.5505, lng: -46.6333, zoom: 11 },
  { label: "Rio de Janeiro, BR", lat: -22.9068, lng: -43.1729, zoom: 11 },
  { label: "Brasília, BR", lat: -15.7942, lng: -47.8822, zoom: 11 },
  { label: "Manaus, BR", lat: -3.119, lng: -60.0217, zoom: 10 },
  { label: "Lisboa, PT", lat: 38.7223, lng: -9.1393, zoom: 11 },
  { label: "New York, US", lat: 40.7128, lng: -74.006, zoom: 11 },
  { label: "Tokyo, JP", lat: 35.6762, lng: 139.6503, zoom: 11 },
  { label: "Amazônia (visão)", lat: -5.5, lng: -63, zoom: 6 },
];

export function CommandPalette() {
  const open = useGeoOS((s) => s.paletteOpen);
  const setOpen = useGeoOS((s) => s.setPalette);
  const openApp = useGeoOS((s) => s.openApp);
  const setWorkspace = useGeoOS((s) => s.setWorkspace);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(!useGeoOS.getState().paletteOpen);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setOpen]);

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Buscar apps, lugares, workspaces, comandos…" />
      <CommandList>
        <CommandEmpty>Nada encontrado.</CommandEmpty>
        <CommandGroup heading="Apps">
          {APPS.map((app) => (
            <CommandItem
              key={app.id}
              value={`app ${app.name} ${app.description}`}
              onSelect={() => {
                openApp(app.id, app.defaultSize);
                setOpen(false);
              }}
            >
              <app.icon className="mr-2 h-4 w-4" style={{ color: `hsl(${app.color})` }} />
              <span>{app.name}</span>
              <span className="ml-auto text-xs text-muted-foreground">{app.description}</span>
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Lugares">
          {PLACES.map((p) => (
            <CommandItem
              key={p.label}
              value={`place ${p.label}`}
              onSelect={() => {
                bus.emit("map.flyTo", { lat: p.lat, lng: p.lng, zoom: p.zoom });
                setOpen(false);
              }}
            >
              📍 {p.label}
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Workspaces">
          {WORKSPACES.map((w) => (
            <CommandItem
              key={w.id}
              value={`ws ${w.name}`}
              onSelect={() => {
                setWorkspace(w.id);
                setOpen(false);
              }}
            >
              <span className="mr-2 h-2 w-2 rounded-full" style={{ background: `hsl(${w.accent})` }} />
              {w.name} <span className="ml-auto text-xs text-muted-foreground">{w.description}</span>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
