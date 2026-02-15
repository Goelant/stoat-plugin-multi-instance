import { defineConfig, type Plugin } from "vite";
import solidPlugin from "vite-plugin-solid";

/**
 * Rollup plugin that rewrites external bare imports into
 * window.__STOAT__ lookups so the plugin works in the browser
 * without an import map.
 */
function windowExternals(modules: string[]): Plugin {
  const moduleSet = new Set(modules);

  return {
    name: "window-externals",
    enforce: "pre",

    // Intercept resolution: redirect to virtual modules
    resolveId(source) {
      if (moduleSet.has(source)) {
        return `\0virtual:${source}`;
      }
    },

    // Provide virtual module content that reads from window.__STOAT__
    load(id) {
      if (!id.startsWith("\0virtual:")) return;
      const moduleName = id.slice("\0virtual:".length);

      // Re-export everything from window.__STOAT__[moduleName]
      return `const mod = window.__STOAT__["${moduleName}"];
export default mod;
// Re-export all named exports
const keys = Object.keys(mod);
for (const key of keys) {
  // Can't use static export in a loop, so we use a Proxy trick
}
// Use a single destructure that Rollup can tree-shake
export const {${getKnownExports(moduleName).join(",")}} = mod;
`;
    },
  };
}

/**
 * Known exports per module — needed because we can't do dynamic
 * export * from a virtual module in ESM.
 */
function getKnownExports(moduleName: string): string[] {
  switch (moduleName) {
    case "solid-js":
      return [
        "createSignal", "createMemo", "createEffect", "createContext",
        "useContext", "onMount", "onCleanup", "on", "batch", "untrack",
        "For", "Show", "Switch", "Match", "Index", "ErrorBoundary",
        "Suspense", "lazy", "children", "mergeProps", "splitProps",
        "createResource", "createRoot", "getOwner", "runWithOwner",
      ];
    case "solid-js/store":
      return ["createStore", "produce", "reconcile", "unwrap"];
    case "solid-js/web":
      return [
        "render", "Portal", "Dynamic", "template", "delegateEvents",
        "insert", "spread", "effect", "memo", "style",
        "classList", "className", "use", "createComponent", "setAttribute",
        "addEventListener", "innerHTML",
      ];
    case "stoat.js":
      return [
        "Client", "ConnectionState", "Channel", "Server", "User",
        "Message", "Collection",
      ];
    case "stoat-api":
      return ["API"];
    case "@revolt/routing":
      return ["useSmartParams", "useParams", "useNavigate", "useLocation"];
    case "@revolt/client":
      return ["useClient", "clientContext"];
    case "@revolt/app/sidebar":
      return ["entryContainer"];
    default:
      return [];
  }
}

export default defineConfig({
  plugins: [
    windowExternals([
      "solid-js",
      "solid-js/store",
      "solid-js/web",
      "stoat.js",
      "@revolt/routing",
      "@revolt/client",
      "@revolt/app/sidebar",
    ]),
    solidPlugin(),
  ],
  build: {
    lib: {
      entry: "src/index.tsx",
      formats: ["es"],
      fileName: "multi-instance",
    },
    target: "esnext",
    minify: false,
    outDir: "dist",
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
  },
});
