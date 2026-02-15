import { createSignal, createStore } from "../deps";
import type { SetStoreFunction } from "solid-js/store";
import localforage from "localforage";

import { normalizeInstanceUrl } from "../utils/instanceUrl";

/**
 * Session data for a single instance.
 * Mirrors the Session type from the app's Auth store.
 */
export interface InstanceSession {
  _id: string;
  token: string;
  userId: string;
  valid: boolean;
}

interface MultiAuthData {
  /** Sessions keyed by normalized instance URL */
  sessions: Record<string, InstanceSession>;
}

const STORAGE_KEY = "multi-instance:auth";

/**
 * Persistent store for per-instance authentication sessions.
 * Stored in localforage independently from the app's main Auth store.
 */
export class MultiAuth {
  private store: MultiAuthData;
  private setStore: SetStoreFunction<MultiAuthData>;

  private _ready: () => boolean;
  private setReady: (v: boolean) => void;

  constructor() {
    const [store, setStore] = createStore<MultiAuthData>({ sessions: {} });
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

  /** Hydrate from localforage, optionally migrating from the app's legacy single session */
  async hydrate(legacySession?: {
    session: InstanceSession;
    instanceUrl: string;
  }): Promise<void> {
    const data = await localforage.getItem<MultiAuthData>(STORAGE_KEY);

    if (data && typeof data === "object" && data.sessions) {
      // Validate loaded sessions
      const sessions: Record<string, InstanceSession> = {};
      for (const [url, session] of Object.entries(data.sessions)) {
        if (this.isValidSession(session)) {
          sessions[url] = session;
        }
      }
      this.setStore("sessions", sessions);
    }

    // Migrate legacy session if we have no sessions yet and a legacy one exists
    if (
      Object.keys(this.store.sessions).length === 0 &&
      legacySession?.session
    ) {
      const url = normalizeInstanceUrl(legacySession.instanceUrl);
      this.setStore("sessions", url, legacySession.session);
      await this.persist();
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

  private isValidSession(session: unknown): session is InstanceSession {
    if (typeof session !== "object" || session === null) return false;
    const s = session as Record<string, unknown>;
    return (
      typeof s._id === "string" &&
      typeof s.token === "string" &&
      typeof s.userId === "string" &&
      typeof s.valid === "boolean"
    );
  }

  /** Get session for a specific instance */
  getSession(instanceUrl: string): InstanceSession | undefined {
    return this.store.sessions[normalizeInstanceUrl(instanceUrl)];
  }

  /** Store a session for an instance */
  async setSession(
    instanceUrl: string,
    session: InstanceSession,
  ): Promise<void> {
    this.setStore("sessions", normalizeInstanceUrl(instanceUrl), session);
    await this.persist();
  }

  /** Remove session for an instance */
  async removeSession(instanceUrl: string): Promise<void> {
    this.setStore("sessions", normalizeInstanceUrl(instanceUrl), undefined!);
    await this.persist();
  }

  /** Mark a session as valid (after successful WebSocket connection) */
  async markValid(instanceUrl: string): Promise<void> {
    const url = normalizeInstanceUrl(instanceUrl);
    const session = this.store.sessions[url];
    if (session && !session.valid) {
      this.setStore("sessions", url, "valid", true);
      await this.persist();
    }
  }

  /** Get all active sessions (those that exist and have been validated) */
  getActiveSessions(): Array<{
    instanceUrl: string;
    session: InstanceSession;
  }> {
    return Object.entries(this.store.sessions)
      .filter(([, session]) => session && session.valid)
      .map(([instanceUrl, session]) => ({ instanceUrl, session }));
  }

  /** Get all sessions (including not-yet-validated) */
  getAllSessions(): Array<{
    instanceUrl: string;
    session: InstanceSession;
  }> {
    return Object.entries(this.store.sessions)
      .filter(([, session]) => session)
      .map(([instanceUrl, session]) => ({ instanceUrl, session }));
  }
}
