import type { StoatPlugin, PluginAPI } from "./plugin-types";
import { createSignal, createEffect, useContext, useParams, For, Show } from "./deps";
import { clientContext, useClient, entryContainer } from "./deps";

import type { Accessor, Setter } from "solid-js";

import { ClientManager } from "./ClientManager";
import { InstancesStore } from "./stores/InstancesStore";
import { MultiAuth } from "./stores/MultiAuth";
import { mountAddInstanceModal } from "./AddInstanceModal";

/**
 * MdDns icon SVG (Material Design "dns" icon)
 */
function DnsIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
      <path d="M20 13H4c-.55 0-1 .45-1 1v6c0 .55.45 1 1 1h16c.55 0 1-.45 1-1v-6c0-.55-.45-1-1-1zM7 19c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zM20 3H4c-.55 0-1 .45-1 1v6c0 .55.45 1 1 1h16c.55 0 1-.45 1-1V4c0-.55-.45-1-1-1zM7 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z" />
    </svg>
  );
}

// Pull UI components from the host app
const UI = (window as Record<string, unknown>).__STOAT__ as Record<string, Record<string, unknown>>;
const Avatar = UI["@revolt/ui"].Avatar as (props: Record<string, unknown>) => unknown;
const Tooltip = UI["@revolt/ui"].Tooltip as (props: Record<string, unknown>) => unknown;

/**
 * Interface wrapper that overrides the client context when a plugin-owned
 * server or channel is being viewed.
 */
function createMultiInstanceBridge(manager: ClientManager, setPinnedDMs: Setter<string[]>) {
  return function MultiInstanceBridge(props: { children: unknown }) {
    const params = useParams<{ server?: string; channel?: string }>();
    const primaryController = useContext(clientContext);

    // Auto-pin DMs from external instances when navigated to
    createEffect(() => {
      const channelId = params.channel;
      if (!channelId) return;
      const instanceUrl = manager.resolveChannelInstance(channelId);
      if (!instanceUrl) return;
      const client = manager.getClient(instanceUrl);
      if (!client) return;
      const channel = client.channels.get(channelId);
      if (channel && (channel.type === "DirectMessage" || channel.type === "Group")) {
        setPinnedDMs((prev) => prev.includes(channelId) ? prev : [...prev, channelId]);
      }
    });

    // Build a stable Proxy whose getCurrentClient() resolves reactively
    // at *call time* (when SolidJS evaluates it in JSX / createMemo),
    // not at Provider creation time.  This matters because SolidJS
    // Context Provider values are NOT reactive — they're read once.
    const reactiveController = new Proxy(primaryController as object, {
      get(target, prop) {
        if (prop === "getCurrentClient") {
          return () => {
            const entityId = params.server || params.channel;
            if (entityId) {
              const serverUrl = manager.resolveServerInstance(entityId);
              const channelUrl = !serverUrl ? manager.resolveChannelInstance(entityId) : undefined;
              const instanceUrl = serverUrl || channelUrl;
              if (instanceUrl) {
                const resolvedClient = manager.getClient(instanceUrl);
                if (resolvedClient) return resolvedClient;
              }
            }
            return ((target as Record<string | symbol, unknown>).getCurrentClient as () => unknown)();
          };
        }
        return (target as Record<string | symbol, unknown>)[prop];
      },
    });

    // Access clientContext.Provider via the context object
    const Provider = (clientContext as unknown as { Provider: (props: { value: unknown; children: unknown }) => unknown }).Provider;

    return (
      <Provider value={reactiveController}>
        {props.children}
      </Provider>
    );
  };
}

/**
 * Sidebar component that renders servers + pinned DMs grouped per instance.
 * Each instance group is wrapped in a visual container.
 */
function createPluginSidebarEntries(
  manager: ClientManager,
  primaryClient: () => import("stoat.js").Client,
  pinnedDMs: Accessor<string[]>,
  setPinnedDMs: Setter<string[]>,
) {
  return function PluginSidebarEntries() {
    /** Build per-instance groups: { instanceUrl, servers[], dms[] } */
    const instanceGroups = () => {
      const primary = primaryClient();
      const pinned = pinnedDMs();
      const groups: {
        instanceUrl: string;
        servers: import("stoat.js").Server[];
        dms: import("stoat.js").Channel[];
      }[] = [];

      for (const instanceUrl of manager.connectedInstances()) {
        const client = manager.getClient(instanceUrl);
        if (!client) continue;

        const servers = client.servers
          .toList()
          .filter((s) => !primary || !primary.servers.has(s.id));

        const dms = pinned
          .filter((id) => manager.resolveChannelInstance(id) === instanceUrl)
          .map((id) => client.channels.get(id))
          .filter((ch): ch is import("stoat.js").Channel => !!ch);

        if (servers.length > 0 || dms.length > 0) {
          groups.push({ instanceUrl, servers, dms });
        }
      }
      return groups;
    };

    return (
      <For each={instanceGroups()}>
        {(group) => (
          <div style={{
            background: "var(--md-sys-color-surface-container)",
            "border-radius": "28px",
            padding: "4px 0",
            margin: "0",
            display: "flex",
            "flex-direction": "column",
            "align-items": "center",
            gap: "2px",
          }}>
            <For each={group.servers}>
              {(server) => (
                <Tooltip placement="right" content={server.name} aria={server.name}>
                  <a
                    class={entryContainer()}
                    href={`/server/${server.id}`}
                  >
                    <Avatar
                      size={42}
                      src={server.iconURL}
                      fallback={server.name}
                      interactive
                    />
                  </a>
                </Tooltip>
              )}
            </For>
            <For each={group.dms}>
              {(channel) => (
                <div style={{ position: "relative" }}>
                  <Tooltip
                    placement="right"
                    content={channel.recipient?.username ?? channel.name ?? "DM"}
                    aria={channel.recipient?.username ?? channel.name ?? "DM"}
                  >
                    <a
                      class={entryContainer()}
                      href={`/channel/${channel.id}`}
                    >
                      <Avatar
                        size={42}
                        src={channel.recipient?.avatarURL ?? channel.iconURL}
                        fallback={channel.recipient?.username ?? channel.name}
                        interactive
                      />
                    </a>
                  </Tooltip>
                  <button
                    onClick={(e: MouseEvent) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setPinnedDMs((prev) => prev.filter((id) => id !== channel.id));
                    }}
                    style={{
                      position: "absolute",
                      top: "2px",
                      right: "2px",
                      width: "16px",
                      height: "16px",
                      "border-radius": "50%",
                      border: "none",
                      background: "var(--md-sys-color-surface-container-highest)",
                      color: "var(--md-sys-color-on-surface)",
                      "font-size": "10px",
                      "line-height": "1",
                      cursor: "pointer",
                      display: "flex",
                      "align-items": "center",
                      "justify-content": "center",
                      padding: "0",
                    }}
                  >
                    ✕
                  </button>
                </div>
              )}
            </For>
          </div>
        )}
      </For>
    );
  };
}

const plugin: StoatPlugin = {
  name: "multi-instance",
  version: "0.2.0",

  async setup(api: PluginAPI) {
    // 1. Initialize stores & manager
    const instancesStore = new InstancesStore();
    const multiAuth = new MultiAuth();
    const manager = new ClientManager(multiAuth, instancesStore);

    await instancesStore.hydrate();
    await multiAuth.hydrate();

    // 2. Connect all saved instances
    for (const { instanceUrl } of multiAuth.getActiveSessions()) {
      manager.connectInstance(instanceUrl);
    }
    for (const { instanceUrl } of multiAuth.getAllSessions()) {
      if (!manager.getClient(instanceUrl)) {
        manager.connectInstance(instanceUrl);
      }
    }

    // 3. Pinned DMs state (DMs the user explicitly opened from external instances)
    const [pinnedDMs, setPinnedDMs] = createSignal<string[]>([]);

    // 4. Register interface wrapper (overrides client context for plugin-owned entities)
    const MultiInstanceBridge = createMultiInstanceBridge(manager, setPinnedDMs);
    api.registerInterfaceWrapper(MultiInstanceBridge as never);

    // 5. Register sidebar entries (extra servers + pinned DMs from other instances)
    const PluginServers = createPluginSidebarEntries(manager, () => api.getClient(), pinnedDMs, setPinnedDMs);
    const { setState } = (window as unknown as Record<string, { state: unknown; setState: Function }>).__STOAT_PLUGIN_STATE__;
    setState("sidebarEntries", (prev: unknown[]) => [...prev, PluginServers]);

    // 5. Mount the modal (plugin manages its own overlay)
    const [showModal, setShowModal] = createSignal(false);
    mountAddInstanceModal(manager, showModal, () => setShowModal(false));

    // 6. Register sidebar action — opens the plugin's own modal
    api.registerSidebarAction({
      icon: () => DnsIcon(),
      tooltip: "Add an instance",
      onClick: () => setShowModal(true),
    });

    // 7. Register channel decorator — show instance tag in DM headers
    api.registerChannelDecorator((channelId: string) => {
      const instanceUrl = manager.resolveChannelInstance(channelId);
      if (!instanceUrl) return null;
      const hostname = new URL(instanceUrl).hostname;
      return (
        <span style={{
          "margin-left": "8px",
          padding: "2px 6px",
          "border-radius": "4px",
          "font-size": "11px",
          background: "var(--md-sys-color-surface-container-high)",
          color: "var(--md-sys-color-on-surface-variant)",
        }}>
          {hostname}
        </span>
      );
    });

    console.info("[multi-instance] Plugin initialized");
  },
};

export default plugin;
