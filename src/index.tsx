import type { StoatPlugin, PluginAPI } from "./plugin-types";
import { createSignal, createEffect, useContext, useParams, For, Show, onCleanup } from "./deps";
import { clientContext, useClient, entryContainer, useNavigate } from "./deps";

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
 * Context menu state: which server, where to show it
 */
interface ContextMenuState {
  server: import("stoat.js").Server;
  x: number;
  y: number;
}

const menuStyles = {
  overlay: {
    position: "fixed",
    top: "0",
    left: "0",
    width: "100vw",
    height: "100vh",
    "z-index": "999",
  } as Record<string, string>,
  menu: {
    position: "fixed",
    "z-index": "1000",
    display: "flex",
    "flex-direction": "column",
    padding: "8px 0",
    "min-width": "200px",
    "border-radius": "8px",
    background: "var(--md-sys-color-surface-container)",
    color: "var(--md-sys-color-on-surface)",
    fill: "var(--md-sys-color-on-surface)",
    "box-shadow": "0 0 3px var(--md-sys-color-shadow)",
    "user-select": "none",
  } as Record<string, string>,
  item: {
    display: "flex",
    gap: "12px",
    "align-items": "center",
    padding: "8px 16px",
    cursor: "pointer",
    border: "none",
    background: "none",
    color: "inherit",
    fill: "inherit",
    "font-size": "14px",
    "text-transform": "capitalize",
    "text-align": "left",
    width: "100%",
  } as Record<string, string>,
  itemDestructive: {
    color: "var(--md-sys-color-error)",
    fill: "var(--md-sys-color-error)",
  } as Record<string, string>,
  divider: {
    height: "1px",
    margin: "4px 0",
    background: "var(--md-sys-color-outline-variant)",
  } as Record<string, string>,
};

/** Inline SVG icons for context menu items (Material Design Outlined, 16px) */
function IconMarkRead() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
      <path d="M12 18.5c-3.6 0-6.6-2.5-7.7-6 .4-1.2 1.1-2.4 2-3.3L4.9 7.8C3.5 9.1 2.4 10.9 2 13c1.2 4.5 5.3 7.5 10 7.5 1.3 0 2.5-.2 3.6-.7l-1.5-1.5c-.7.1-1.4.2-2.1.2zm9.7 1.8L3.3 1.8 2 3.1l3.2 3.2C3.6 8 2.6 10.3 2 13c1.2 4.5 5.3 7.5 10 7.5 1.7 0 3.4-.4 4.8-1.1l2.5 2.5 1.4-1.6z" />
      <path d="M17 7l-1.4 1.4L18.2 11H10v2h8.2l-2.6 2.6L17 17l5-5z" />
    </svg>
  );
}

function IconPersonAdd() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
      <path d="M15 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm-9-2V7H4v3H1v2h3v3h2v-3h3v-2H6zm9 4c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
    </svg>
  );
}

function IconFace() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
      <path d="M9 11.75c-.69 0-1.25.56-1.25 1.25s.56 1.25 1.25 1.25 1.25-.56 1.25-1.25-.56-1.25-1.25-1.25zm6 0c-.69 0-1.25.56-1.25 1.25s.56 1.25 1.25 1.25 1.25-.56 1.25-1.25-.56-1.25-1.25-1.25zM12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8 0-.29.02-.58.05-.86 2.36-1.05 4.23-2.98 5.21-5.37C11.07 8.33 14.05 10 17.42 10c.78 0 1.53-.09 2.25-.26.21.71.33 1.47.33 2.26 0 4.41-3.59 8-8 8z" />
    </svg>
  );
}

function IconSettings() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
      <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.07.62-.07.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z" />
    </svg>
  );
}

function IconLogout() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
      <path d="M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z" />
    </svg>
  );
}

function IconBadge() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
      <path d="M20 7h-5V4c0-1.1-.9-2-2-2h-2c-1.1 0-2 .9-2 2v3H4c-1.1 0-2 .9-2 2v11c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V9c0-1.1-.9-2-2-2zm-9-3h2v5h-2V4zm9 16H4V9h5c0 1.1.9 2 2 2h2c1.1 0 2-.9 2-2h5v11zM9 14.5h6v-1H9v1zm0 2h4v-1H9v1z" />
    </svg>
  );
}

/**
 * Server context menu for external instance servers
 */
function PluginServerContextMenu(props: {
  state: Accessor<ContextMenuState | null>;
  close: () => void;
}) {
  const navigate = useNavigate();

  const handleMouseDown = () => props.close();

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") props.close();
  };

  // Close on Escape
  if (typeof document !== "undefined") {
    document.addEventListener("keydown", handleKeyDown);
    onCleanup(() => document.removeEventListener("keydown", handleKeyDown));
  }

  return (
    <Show when={props.state()}>
      {(ctx) => {
        const server = () => ctx().server;

        const permissionInvite = () =>
          server().channels.find((ch) => ch.havePermission("InviteOthers"));

        const permissionIdentity = () =>
          server().havePermission("ChangeNickname") || server().havePermission("ChangeAvatar");

        const permissionSettings = () =>
          server().owner?.self ||
          server().havePermission("ManageServer") ||
          server().havePermission("ManageChannel") ||
          server().havePermission("ManagePermissions");

        function action(fn: () => void) {
          fn();
          props.close();
        }

        return (
          <div style={menuStyles.overlay} onMouseDown={handleMouseDown}>
            <div
              style={{ ...menuStyles.menu, top: `${ctx().y}px`, left: `${ctx().x}px` }}
              onMouseDown={(e: MouseEvent) => e.stopPropagation()}
            >
              <Show when={server().unread}>
                <button
                  style={menuStyles.item}
                  onMouseOver={(e) => { (e.currentTarget as HTMLElement).style.background = "color-mix(in srgb, var(--md-sys-color-on-surface) 8%, transparent)"; }}
                  onMouseOut={(e) => { (e.currentTarget as HTMLElement).style.background = "none"; }}
                  onClick={() => action(() => server().ack())}
                >
                  <IconMarkRead /> <span>Mark as read</span>
                </button>
                <div style={menuStyles.divider} />
              </Show>

              <Show when={permissionInvite()}>
                <button
                  style={menuStyles.item}
                  onMouseOver={(e) => { (e.currentTarget as HTMLElement).style.background = "color-mix(in srgb, var(--md-sys-color-on-surface) 8%, transparent)"; }}
                  onMouseOut={(e) => { (e.currentTarget as HTMLElement).style.background = "none"; }}
                  onClick={() => action(async () => {
                    const channel = server().orderedChannels
                      .find((cat) => cat.channels.find((ch) => ch.havePermission("InviteOthers")))
                      ?.channels.find((ch) => ch.havePermission("InviteOthers"));
                    if (channel) {
                      try {
                        const invite = await channel.createInvite();
                        navigator.clipboard.writeText(invite._id);
                      } catch (e) {
                        console.error("[multi-instance] Failed to create invite:", e);
                      }
                    }
                  })}
                >
                  <IconPersonAdd /> <span>Create invite</span>
                </button>
              </Show>

              <Show when={permissionIdentity()}>
                <button
                  style={menuStyles.item}
                  onMouseOver={(e) => { (e.currentTarget as HTMLElement).style.background = "color-mix(in srgb, var(--md-sys-color-on-surface) 8%, transparent)"; }}
                  onMouseOut={(e) => { (e.currentTarget as HTMLElement).style.background = "none"; }}
                  onClick={() => action(() => {
                    navigate(`/server/${server().id}/settings/identity`);
                  })}
                >
                  <IconFace /> <span>Edit your identity</span>
                </button>
              </Show>

              <Show when={permissionSettings()}>
                <button
                  style={menuStyles.item}
                  onMouseOver={(e) => { (e.currentTarget as HTMLElement).style.background = "color-mix(in srgb, var(--md-sys-color-on-surface) 8%, transparent)"; }}
                  onMouseOut={(e) => { (e.currentTarget as HTMLElement).style.background = "none"; }}
                  onClick={() => action(() => {
                    navigate(`/server/${server().id}/settings`);
                  })}
                >
                  <IconSettings /> <span>Open server settings</span>
                </button>
              </Show>

              <Show when={permissionInvite() || permissionIdentity() || permissionSettings()}>
                <div style={menuStyles.divider} />
              </Show>

              <Show when={!server().owner?.self}>
                <button
                  style={{ ...menuStyles.item, ...menuStyles.itemDestructive }}
                  onMouseOver={(e) => { (e.currentTarget as HTMLElement).style.background = "color-mix(in srgb, var(--md-sys-color-on-surface) 8%, transparent)"; }}
                  onMouseOut={(e) => { (e.currentTarget as HTMLElement).style.background = "none"; }}
                  onClick={() => action(() => {
                    if (confirm(`Leave ${server().name}?`)) {
                      server().delete();
                      navigate("/app");
                    }
                  })}
                >
                  <IconLogout /> <span>Leave server</span>
                </button>
              </Show>

              <div style={menuStyles.divider} />

              <button
                style={menuStyles.item}
                onMouseOver={(e) => { (e.currentTarget as HTMLElement).style.background = "color-mix(in srgb, var(--md-sys-color-on-surface) 8%, transparent)"; }}
                onMouseOut={(e) => { (e.currentTarget as HTMLElement).style.background = "none"; }}
                onClick={() => action(() => navigator.clipboard.writeText(server().id))}
              >
                <IconBadge /> <span>Copy server ID</span>
              </button>
            </div>
          </div>
        );
      }}
    </Show>
  );
}

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
  const [ctxMenu, setCtxMenu] = createSignal<ContextMenuState | null>(null);

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
      <>
      <PluginServerContextMenu state={ctxMenu} close={() => setCtxMenu(null)} />
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
                    onContextMenu={(e: MouseEvent) => {
                      e.preventDefault();
                      setCtxMenu({ server, x: e.clientX, y: e.clientY });
                    }}
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
      </>
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
