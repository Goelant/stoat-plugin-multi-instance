import type { Accessor } from "solid-js";
import { createSignal } from "./deps";

import { Client, ConnectionState } from "stoat.js";
import type { API } from "stoat-api";
import type { Channel, Server } from "stoat.js";

import { MultiAuth, type InstanceSession } from "./stores/MultiAuth";
import { InstancesStore } from "./stores/InstancesStore";
import { normalizeInstanceUrl } from "./utils/instanceUrl";

/**
 * Connection state for a single instance
 */
export enum InstanceState {
  Disconnected = "disconnected",
  Connecting = "connecting",
  Connected = "connected",
  Error = "error",
}

/**
 * Managed instance: a Client + its connection state
 */
interface ManagedInstance {
  client: Client;
  instanceUrl: string;
  state: Accessor<InstanceState>;
  setState: (s: InstanceState) => void;
}

/**
 * Manages multiple simultaneous Client connections to different Stoat/Revolt instances.
 */
export class ClientManager {
  private instances: Map<string, ManagedInstance> = new Map();
  private multiAuth: MultiAuth;
  private instancesStore: InstancesStore;

  /** Reactive list of connected instance URLs */
  readonly connectedInstances: Accessor<string[]>;
  private setConnectedInstances: (urls: string[]) => void;

  constructor(multiAuth: MultiAuth, instancesStore: InstancesStore) {
    this.multiAuth = multiAuth;
    this.instancesStore = instancesStore;

    const [connectedInstances, setConnectedInstances] = createSignal<string[]>(
      [],
    );
    this.connectedInstances = connectedInstances;
    this.setConnectedInstances = setConnectedInstances;
  }

  /** Update the reactive list of connected instances */
  private updateConnectedList() {
    this.setConnectedInstances(
      Array.from(this.instances.keys()).filter((url) => {
        const instance = this.instances.get(url);
        return instance && instance.state() !== InstanceState.Disconnected;
      }),
    );
  }

  /**
   * Create and connect a Client for the given instance URL.
   * Uses the session from MultiAuth if available.
   */
  connectInstance(instanceUrl: string): Client | undefined {
    const url = normalizeInstanceUrl(instanceUrl);

    // Already connected?
    if (this.instances.has(url)) {
      return this.instances.get(url)!.client;
    }

    const session = this.multiAuth.getSession(url);
    if (!session) {
      return undefined;
    }

    const client = new Client({
      baseURL: url,
      autoReconnect: true,
      syncUnreads: true,
      debug: false,
    });

    const [state, setState] = createSignal<InstanceState>(
      InstanceState.Connecting,
    );

    const managed: ManagedInstance = {
      client,
      instanceUrl: url,
      state,
      setState,
    };

    // Listen for connection state changes
    client.events.on("state", (connState: ConnectionState) => {
      switch (connState) {
        case ConnectionState.Connected:
          setState(InstanceState.Connected);
          this.multiAuth.markValid(url);
          this.updateConnectedList();
          break;
        case ConnectionState.Connecting:
          setState(InstanceState.Connecting);
          this.updateConnectedList();
          break;
        case ConnectionState.Disconnected:
          if (client.events.lastError?.type === "revolt") {
            setState(InstanceState.Error);
          } else {
            setState(InstanceState.Connecting); // Will auto-reconnect
          }
          this.updateConnectedList();
          break;
      }
    });

    this.instances.set(url, managed);

    // Set session and connect
    client.useExistingSession({
      _id: session._id,
      token: session.token,
      user_id: session.userId,
    });

    // Fetch instance configuration then connect
    this.fetchConfigAndConnect(client, url);

    this.updateConnectedList();
    return client;
  }

  /** Fetch instance configuration from API root, then connect WebSocket */
  private async fetchConfigAndConnect(
    client: Client,
    instanceUrl: string,
  ): Promise<void> {
    try {
      const config = await client.api.get("/");
      client.configuration = config;
      client.connect();
    } catch (err) {
      console.error(
        `[multi-instance] Failed to fetch config for ${instanceUrl}:`,
        err,
      );
      const managed = this.instances.get(instanceUrl);
      if (managed) {
        managed.setState(InstanceState.Error);
        this.updateConnectedList();
      }
    }
  }

  /** Disconnect from an instance */
  disconnectInstance(instanceUrl: string): void {
    const url = normalizeInstanceUrl(instanceUrl);
    const managed = this.instances.get(url);

    if (managed) {
      managed.client.events.removeAllListeners();
      managed.client.removeAllListeners();
      managed.client.events.disconnect();
      this.instances.delete(url);
      this.updateConnectedList();
    }
  }

  /** Get the Client for a specific instance */
  getClient(instanceUrl: string): Client | undefined {
    return this.instances.get(normalizeInstanceUrl(instanceUrl))?.client;
  }

  /** Get the connection state for a specific instance */
  getInstanceState(instanceUrl: string): Accessor<InstanceState> | undefined {
    return this.instances.get(normalizeInstanceUrl(instanceUrl))?.state;
  }

  /**
   * Find which instance owns a server by its ID.
   * Iterates all connected clients to find the server.
   */
  resolveServerInstance(serverId: string): string | undefined {
    for (const [url, managed] of this.instances) {
      if (managed.client.servers.has(serverId)) {
        return url;
      }
    }
    return undefined;
  }

  /**
   * Find which instance owns a channel by its ID.
   */
  resolveChannelInstance(channelId: string): string | undefined {
    for (const [url, managed] of this.instances) {
      if (managed.client.channels.has(channelId)) {
        return url;
      }
    }
    return undefined;
  }

  /** Get all servers across all connected instances */
  allServers(): Server[] {
    const servers: Server[] = [];
    for (const managed of this.instances.values()) {
      if (managed.state() === InstanceState.Connected) {
        for (const server of managed.client.servers.toList()) {
          servers.push(server);
        }
      }
    }
    return servers;
  }

  /** Get all DM/group conversations across all connected instances */
  allConversations(): Channel[] {
    const conversations: Channel[] = [];
    for (const managed of this.instances.values()) {
      if (managed.state() === InstanceState.Connected) {
        for (const channel of managed.client.channels.toList()) {
          if (
            (channel.type === "DirectMessage" && channel.active) ||
            channel.type === "Group"
          ) {
            conversations.push(channel);
          }
        }
      }
    }
    return conversations.sort((a, b) => +b.updatedAt - +a.updatedAt);
  }

  /**
   * Login to a specific instance.
   * Creates a new session and connects.
   */
  async login(
    instanceUrl: string,
    credentials: API.DataLogin,
    friendlyName: string,
  ): Promise<{ success: true } | { success: false; error: unknown }> {
    const url = normalizeInstanceUrl(instanceUrl);

    try {
      // Create a temporary API client for login
      // stoat.js re-exports stoat-api as .API on window.__STOAT__["stoat.js"]
      const stoat = (window as Record<string, unknown>).__STOAT__ as Record<string, Record<string, unknown>>;
      const APIClass = stoat["stoat.js"].API.API as unknown as new (opts: { baseURL: string }) => {
        post: (path: string, data: unknown) => Promise<Record<string, unknown>>;
      };
      const api = new APIClass({ baseURL: url });

      let session = await api.post("/auth/session/login", {
        ...credentials,
        friendly_name: friendlyName,
      });

      // Handle MFA — caller should handle this via UI
      if (session.result === "MFA") {
        return {
          success: false,
          error: { type: "mfa", data: session },
        };
      }

      if (session.result === "Disabled") {
        return { success: false, error: { type: "disabled" } };
      }

      // Store the session
      const instanceSession: InstanceSession = {
        _id: session._id,
        token: session.token,
        userId: session.user_id,
        valid: false,
      };

      await this.multiAuth.setSession(url, instanceSession);

      // Register the instance if not known
      if (!this.instancesStore.getInstance(url)) {
        const hostname = new URL(url).hostname;
        await this.instancesStore.addInstance(url, hostname);
      }

      // Connect
      this.connectInstance(url);

      return { success: true };
    } catch (error) {
      return { success: false, error };
    }
  }

  /** Logout from a specific instance */
  async logout(instanceUrl: string): Promise<void> {
    const url = normalizeInstanceUrl(instanceUrl);
    this.disconnectInstance(url);
    await this.multiAuth.removeSession(url);
  }

  /** Dispose all connections */
  disposeAll(): void {
    for (const url of this.instances.keys()) {
      this.disconnectInstance(url);
    }
  }

  /** Get the MultiAuth store */
  getMultiAuth(): MultiAuth {
    return this.multiAuth;
  }

  /** Get the InstancesStore */
  getInstancesStore(): InstancesStore {
    return this.instancesStore;
  }
}
