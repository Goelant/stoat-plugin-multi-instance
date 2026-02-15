# Stoat Multi-Instance Plugin

A plugin for [Stoat](https://github.com/stoatchat/for-web) that enables connecting to multiple Stoat/Revolt instances simultaneously from a single client.

## Features

### Multi-instance connection
- Connect to multiple Stoat/Revolt instances at once from the "Add Instance" modal
- Per-instance session management with persistent login (stored via localForage)
- Auto-reconnect on connection loss

### Unified sidebar
- Servers from all connected instances appear in the sidebar alongside native servers
- Servers already present on the primary instance are deduplicated
- Pinned DMs: when you open a DM with someone from an external instance, it appears in the sidebar with a close button (x) to dismiss it

### Transparent client context switching
- Clicking a server or channel from another instance automatically switches the client context
- The `MultiInstanceBridge` overrides `getCurrentClient()` reactively via a Proxy, so all downstream components (channel list, message view, etc.) use the correct client
- The bridge is scoped to the content area only; the primary sidebar server list always uses the main client

### Cross-instance DMs
- Send direct messages to users on external instances via their profile or context menu
- Navigation uses relative paths (`channel.path`) so the SPA router handles it correctly
- The bridge resolves the correct client for the DM channel

### Channel decorators
- DM headers display a tag with the hostname of the external instance (e.g. `termotalk.intermotools.net`)
- Registered via the host app's `registerChannelDecorator` API

## How it works

The plugin uses several mechanisms from Stoat's plugin system:

1. **Interface Wrapper** (`api.registerInterfaceWrapper`) — A `MultiInstanceBridge` component wraps the content area and overrides `clientContext` when navigating to a server or channel owned by a secondary instance. It uses a stable `Proxy` whose `getCurrentClient()` resolves reactively at call time (reading route params), not at Provider creation time (SolidJS Context Provider values are not reactive).

2. **Sidebar Entries** (`window.__STOAT_PLUGIN_STATE__.setState("sidebarEntries", ...)`) — A `PluginSidebarEntries` component renders:
   - Extra servers from connected instances (filtered to exclude servers already on the primary client)
   - Pinned DMs from external instances, with a close button to unpin them

3. **Sidebar Action** (`api.registerSidebarAction`) — An "Add an instance" button in the sidebar that opens the login modal.

4. **Channel Decorator** (`api.registerChannelDecorator`) — Shows the instance hostname as a tag in DM channel headers for external-instance conversations.

## Architecture

```
                    PluginProvider (host)
                          |
                   PluginInterfaceWrappers
                          |
                   MultiInstanceBridge (plugin)
                     overrides clientContext
                          |
              +-----------+-----------+
              |                       |
        Server sidebar          Content area
        (also wrapped)     (messages, channel list)
```

The bridge reads `params.server` / `params.channel` from the router. When a route param matches an entity owned by a secondary instance, `getCurrentClient()` returns that instance's client. Otherwise, it falls through to the primary client.

### Auto-pinning DMs

When the user navigates to a DM channel that belongs to an external instance, a `createEffect` in the bridge automatically adds its channel ID to the `pinnedDMs` signal. The sidebar component reactively renders these pinned DMs. The user can dismiss them with the close button.

## Project structure

```
src/
├── index.tsx              # Plugin entry point (setup, bridge, sidebar entries, decorators)
├── plugin-types.ts        # Local type definitions mirroring the host plugin API
├── deps.ts                # Dependency shims from window.__STOAT__
├── ClientManager.ts       # Manages multiple Client connections
├── AddInstanceModal.tsx   # Modal UI for adding a new instance
├── stores/
│   ├── InstancesStore.ts  # Known instances (localForage)
│   └── MultiAuth.ts       # Per-instance session tokens (localForage)
└── utils/
    └── instanceUrl.ts     # URL normalization utilities
```

## Building

Prerequisites: the plugin depends on shared dependencies exposed by the host app at runtime via `window.__STOAT__`. It must **not** bundle its own Solid.js.

```bash
# Install dependencies
pnpm install

# Build the plugin
pnpm build

# Output: dist/multi-instance.js
```

## Installing

1. Copy `dist/multi-instance.js` to `packages/client/public/plugins/` in the Stoat app.
2. The Vite `pluginsManifest` plugin auto-generates `plugins.json`, or add it manually:
   ```json
   ["multi-instance.js"]
   ```
3. Start the app — the plugin loads automatically.

## Shared dependencies

The plugin reads from `window.__STOAT__` at runtime (rewritten by the `windowExternals` Vite plugin at build time):

| Module | Used exports |
|---|---|
| `solid-js` | `createSignal`, `createEffect`, `createMemo`, `createContext`, `useContext`, `onMount`, `onCleanup`, `For`, `Show`, `Match`, `Switch` |
| `solid-js/store` | `createStore` |
| `stoat.js` | `Client`, `ConnectionState`, `Server`, `Channel`, ... |
| `@revolt/client` | `useClient`, `clientContext` |
| `@revolt/routing` | `useSmartParams`, `useParams`, `useNavigate`, `useLocation` |
| `@revolt/app/sidebar` | `entryContainer` |
| `@revolt/ui` | `Avatar`, `Tooltip` (accessed via `window.__STOAT__["@revolt/ui"]`) |

## License

Same license as the parent [Stoat](https://github.com/stoatchat/for-web) project.
