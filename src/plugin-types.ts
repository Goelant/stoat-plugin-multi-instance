/**
 * Minimal type definitions for the plugin API.
 * These mirror the types from the base app's plugin system.
 */
import type { Client } from "stoat.js";

export interface SidebarAction {
  icon: () => unknown;
  tooltip: string;
  onClick: () => void;
}

export interface PluginStorage {
  get<T>(key: string): T | undefined;
  set<T>(key: string, value: T): void;
  remove(key: string): void;
}

export interface ContentPage {
  /** Unique route id (used in /ext/:pageId) */
  id: string;
  /** Component rendered in the main content area */
  component: () => unknown;
}

export interface PluginAPI {
  registerInterfaceWrapper(wrapper: (props: { children: unknown }) => unknown): void;
  registerSidebarAction(action: SidebarAction): void;
  registerContentPage(page: ContentPage): void;
  storage: PluginStorage;
  getClient(): Client;
}

export interface StoatPlugin {
  name: string;
  version?: string;
  setup(api: PluginAPI): void | Promise<void>;
}
