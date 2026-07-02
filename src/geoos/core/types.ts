import type { ComponentType, LazyExoticComponent } from "react";
import type { LucideIcon } from "lucide-react";

export type AppCategory = "core" | "environment" | "urban" | "infra" | "intel" | "system";

export type GeoApp = {
  id: string;
  name: string;
  description: string;
  icon: LucideIcon;
  category: AppCategory;
  color: string; // hsl/oklch accent for icon tile
  defaultSize?: { width: number; height: number };
  defaultPosition?: { x: number; y: number };
  singleton?: boolean;
  component: LazyExoticComponent<ComponentType<Record<string, never>>> | ComponentType<Record<string, never>>;
};

export type WindowState = {
  appId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  z: number;
  minimized: boolean;
  maximized: boolean;
};

export type Workspace = {
  id: string;
  name: string;
  description: string;
  accent: string;
  apps: string[]; // preferred/visible apps for this workspace
  layers: string[]; // active layer ids
};

export type Notification = {
  id: string;
  title: string;
  message?: string;
  level: "info" | "warn" | "error" | "success";
  ts: number;
  read?: boolean;
};
