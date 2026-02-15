import type { StoatPlugin, PluginAPI } from "./plugin-types";
import { createSignal, useContext, useParams, For } from "./deps";
import { clientContext, useClient, entryContainer } from "./deps";

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
function createMultiInstanceBridge(manager: ClientManager) {
  return function MultiInstanceBridge(props: { children: unknown }) {
    const params = useParams<{ server?: string; channel?: string }>();
    const primaryController = useContext(clientContext);

    const resolvedController = () => {
      const entityId = params.server || params.channel;
      if (entityId) {
        const serverUrl = manager.resolveServerInstance(entityId);
        const channelUrl = !serverUrl ? manager.resolveChannelInstance(entityId) : undefined;
        const instanceUrl = serverUrl || channelUrl;
        if (instanceUrl) {
          const resolvedClient = manager.getClient(instanceUrl);
          if (resolvedClient) {
            return new Proxy(primaryController as object, {
              get(target, prop) {
                if (prop === "getCurrentClient") {
                  return () => resolvedClient;
                }
                return (target as Record<string | symbol, unknown>)[prop];
              },
            });
          }
        }
      }
      return primaryController;
    };

    // Access clientContext.Provider via the context object
    const Provider = (clientContext as unknown as { Provider: (props: { value: unknown; children: unknown }) => unknown }).Provider;

    return (
      <Provider value={resolvedController()}>
        {props.children}
      </Provider>
    );
  };
}

/**
 * Sidebar component that renders extra servers from plugin instances.
 */
function createPluginServers(manager: ClientManager, primaryClient: () => import("stoat.js").Client) {
  return function PluginServers() {
    const servers = () => {
      const allServers = manager.allServers();
      const primary = primaryClient();
      if (!primary) return allServers;
      // Filter out servers that the primary client already has
      return allServers.filter((s) => !primary.servers.has(s.id));
    };

    return (
      <For each={servers()}>
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

    // 3. Register interface wrapper (overrides client context for plugin-owned entities)
    const MultiInstanceBridge = createMultiInstanceBridge(manager);
    api.registerInterfaceWrapper(MultiInstanceBridge as never);

    // 4. Register sidebar entries (extra servers from other instances)
    const PluginServers = createPluginServers(manager, () => api.getClient());
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

    console.info("[multi-instance] Plugin initialized");
  },
};

export default plugin;
