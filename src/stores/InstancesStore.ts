import { createSignal, createStore } from "../deps";
import type { SetStoreFunction } from "solid-js/store";
import localforage from "localforage";

import { normalizeInstanceUrl } from "../utils/instanceUrl";

/**
 * Information about a known Stoat/Revolt instance
 */
export interface InstanceInfo {
  /** Normalized API base URL (primary key) */
  url: string;
  /** Human-readable display name */
  name: string;
  /** Built-in instance (cannot be removed) */
  builtin: boolean;
}

const STORAGE_KEY = "multi-instance:instances";

const DEFAULT_INSTANCES: Record<string, InstanceInfo> = {
  "https://stoat.chat/api": {
    url: "https://stoat.chat/api",
    name: "Stoat",
    builtin: true,
  },
};

/**
 * Persistent store for known instances.
 * Stored in localforage independently from the app's main State system.
 */
export class InstancesStore {
  private store: Record<string, InstanceInfo>;
  private setStore: SetStoreFunction<Record<string, InstanceInfo>>;

  private _ready: () => boolean;
  private setReady: (v: boolean) => void;

  constructor() {
    const [store, setStore] = createStore<Record<string, InstanceInfo>>({
      ...DEFAULT_INSTANCES,
    });
    this.store = store;
    this.setStore = setStore;

    const [ready, setReady] = createSignal(false);
    this._ready = ready;
    this.setReady = setReady;
  }

  /** Whether the store has been hydrated from disk */
  get ready() {
    return this._ready();
  }

  /** Hydrate from localforage */
  async hydrate(): Promise<void> {
    const data = await localforage.getItem<Record<string, InstanceInfo>>(
      STORAGE_KEY,
    );

    if (data && typeof data === "object") {
      // Merge with defaults (builtins can't be removed)
      const merged = { ...DEFAULT_INSTANCES };
      for (const [url, info] of Object.entries(data)) {
        if (typeof info === "object" && typeof info.url === "string") {
          merged[url] = info;
        }
      }
      this.setStore(merged);
    }

    this.setReady(true);
  }

  /** Persist to localforage */
  private async persist(): Promise<void> {
    await localforage.setItem(
      STORAGE_KEY,
      JSON.parse(JSON.stringify(this.store)),
    );
  }

  /** Get all known instances */
  getInstances(): InstanceInfo[] {
    return Object.values(this.store);
  }

  /** Get a specific instance by URL */
  getInstance(url: string): InstanceInfo | undefined {
    return this.store[normalizeInstanceUrl(url)];
  }

  /** Add a new instance */
  async addInstance(url: string, name: string): Promise<InstanceInfo> {
    const normalized = normalizeInstanceUrl(url);
    const info: InstanceInfo = {
      url: normalized,
      name,
      builtin: false,
    };

    this.setStore(normalized, info);
    await this.persist();
    return info;
  }

  /** Remove an instance (builtins cannot be removed) */
  async removeInstance(url: string): Promise<boolean> {
    const normalized = normalizeInstanceUrl(url);
    const instance = this.store[normalized];

    if (!instance || instance.builtin) {
      return false;
    }

    this.setStore(normalized, undefined!);
    await this.persist();
    return true;
  }

  /** Update an instance's display name */
  async updateName(url: string, name: string): Promise<void> {
    const normalized = normalizeInstanceUrl(url);
    if (this.store[normalized]) {
      this.setStore(normalized, "name", name);
      await this.persist();
    }
  }
}
