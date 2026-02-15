# Stoat Multi-Instance Plugin

A plugin for [Stoat](https://github.com/stoatchat/for-web) that enables connecting to multiple Stoat/Revolt instances simultaneously from a single client.

## Features

- Connect to multiple Stoat/Revolt instances at once
- Servers from all instances appear in the sidebar
- Clicking a server from another instance automatically switches the client context
- Per-instance session management with persistent login
- "Add Instance" modal for connecting to new instances

## How it works

The plugin uses two core mechanisms from Stoat's generic plugin system:

1. **Interface Wrapper** (`registerInterfaceWrapper`) — A `MultiInstanceBridge` component wraps the app layout and overrides the `clientContext` when navigating to a server or channel owned by a secondary instance.

2. **Sidebar Entries** (`window.__STOAT_PLUGIN_STATE__.setState("sidebarEntries", ...)`) — A `PluginServers` component renders extra servers from connected instances directly in the server list, using the host app's `entryContainer` CVA for consistent styling.

## Project structure

```
src/
├── index.tsx              # Plugin entry point (setup, bridge, sidebar entries)
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
pnpm exec vite build
# or
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
| `solid-js` | `createSignal`, `createMemo`, `createContext`, `useContext`, `onMount`, `onCleanup`, `For`, `Show`, ... |
| `solid-js/store` | `createStore` |
| `stoat.js` | `Client`, `ConnectionState`, `Server`, `Channel`, ... |
| `@revolt/client` | `useClient`, `clientContext` |
| `@revolt/routing` | `useSmartParams`, `useParams`, `useNavigate`, `useLocation` |
| `@revolt/app/sidebar` | `entryContainer` |
| `@revolt/ui` | `Avatar`, `Tooltip` (accessed via `window.__STOAT__["@revolt/ui"]`) |

## License

Same license as the parent [Stoat](https://github.com/stoatchat/for-web) project.
