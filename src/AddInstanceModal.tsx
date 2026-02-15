import { createSignal, Show } from "./deps";
import type { Accessor } from "solid-js";

import type { ClientManager } from "./ClientManager";
import { validateInstanceUrl } from "./utils/instanceUrl";

// Get Solid's render from the host app
const solidWeb = (window as Record<string, unknown>).__STOAT__ as Record<
  string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  any
>;
const { render } = solidWeb["solid-js/web"] as typeof import("solid-js/web");

/**
 * Mount the AddInstance modal as a self-managed DOM portal.
 * The plugin controls visibility via the `show` signal.
 */
export function mountAddInstanceModal(
  manager: ClientManager,
  show: Accessor<boolean>,
  onClose: () => void,
): void {
  // Create a container for the modal
  const container = document.createElement("div");
  container.id = "multi-instance-modal";
  document.body.appendChild(container);

  render(
    () => <AddInstanceOverlay manager={manager} show={show} onClose={onClose} />,
    container,
  );
}

function AddInstanceOverlay(props: {
  manager: ClientManager;
  show: Accessor<boolean>;
  onClose: () => void;
}) {
  const [step, setStep] = createSignal<"url" | "login" | "done">("url");
  const [instanceUrl, setInstanceUrl] = createSignal("");
  const [resolvedApiUrl, setResolvedApiUrl] = createSignal("");
  const [instanceName, setInstanceName] = createSignal("");
  const [email, setEmail] = createSignal("");
  const [password, setPassword] = createSignal("");
  const [error, setError] = createSignal("");
  const [loading, setLoading] = createSignal(false);
  const [corsWarning, setCorsWarning] = createSignal(false);

  function close() {
    setStep("url");
    setInstanceUrl("");
    setResolvedApiUrl("");
    setInstanceName("");
    setEmail("");
    setPassword("");
    setError("");
    setLoading(false);
    setCorsWarning(false);
    props.onClose();
  }

  async function handleValidateUrl() {
    setError("");
    setLoading(true);
    setCorsWarning(false);

    try {
      const result = await validateInstanceUrl(instanceUrl());

      if (result.valid === true) {
        setResolvedApiUrl(result.apiUrl);
        setInstanceName(result.name);
        setStep("login");
      } else if (result.valid === "cors") {
        setResolvedApiUrl(result.apiUrl);
        setInstanceName(result.name);
        setCorsWarning(true);
        setStep("login");
      } else {
        setError(result.error);
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleLogin() {
    setError("");
    setLoading(true);

    try {
      const result = await props.manager.login(
        resolvedApiUrl(),
        { email: email(), password: password() },
        "Stoat Web (multi-instance)",
      );

      if (result.success) {
        setStep("done");
        setTimeout(close, 1000);
      } else {
        setError(
          typeof result.error === "object" &&
            result.error !== null &&
            "type" in (result.error as Record<string, unknown>)
            ? `Error: ${(result.error as Record<string, string>).type}`
            : String(result.error),
        );
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  const inputStyle = {
    padding: "8px 12px",
    "border-radius": "8px",
    border: "1px solid var(--md-sys-color-outline)",
    background: "var(--md-sys-color-surface-container)",
    color: "var(--md-sys-color-on-surface)",
    "font-size": "14px",
    width: "100%",
    "box-sizing": "border-box" as const,
  };

  const buttonStyle = {
    padding: "10px 20px",
    "border-radius": "8px",
    border: "none",
    background: "var(--md-sys-color-primary)",
    color: "var(--md-sys-color-on-primary)",
    "font-size": "14px",
    cursor: "pointer",
  };

  return (
    <Show when={props.show()}>
      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          "z-index": 10000,
          display: "flex",
          "align-items": "center",
          "justify-content": "center",
          background: "rgba(0,0,0,0.5)",
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget) close();
        }}
      >
        <div
          style={{
            background: "var(--md-sys-color-surface-container-high)",
            "border-radius": "16px",
            padding: "24px",
            "min-width": "380px",
            "max-width": "440px",
            color: "var(--md-sys-color-on-surface)",
          }}
        >
          <h2 style={{ margin: "0 0 16px 0", "font-size": "20px" }}>
            Add an Instance
          </h2>

          <Show when={step() === "url"}>
            <div style={{ display: "flex", "flex-direction": "column", gap: "12px" }}>
              <label>Instance URL</label>
              <input
                style={inputStyle}
                placeholder="https://example.com"
                value={instanceUrl()}
                onInput={(e) => setInstanceUrl(e.currentTarget.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleValidateUrl();
                }}
              />
              <Show when={error()}>
                <p style={{ color: "var(--md-sys-color-error)", margin: 0 }}>
                  {error()}
                </p>
              </Show>
              <div style={{ display: "flex", gap: "8px", "justify-content": "flex-end" }}>
                <button
                  style={{ ...buttonStyle, background: "transparent", color: "var(--md-sys-color-on-surface)" }}
                  onClick={close}
                >
                  Cancel
                </button>
                <button
                  style={buttonStyle}
                  onClick={handleValidateUrl}
                  disabled={loading() || !instanceUrl().trim()}
                >
                  {loading() ? "Checking..." : "Next"}
                </button>
              </div>
            </div>
          </Show>

          <Show when={step() === "login"}>
            <div style={{ display: "flex", "flex-direction": "column", gap: "12px" }}>
              <p style={{ margin: 0 }}>
                Logging into <strong>{instanceName()}</strong>
              </p>
              <Show when={corsWarning()}>
                <p style={{ color: "var(--md-sys-color-tertiary)", margin: 0, "font-size": "12px" }}>
                  Could not validate the instance (CORS). Login may still work.
                </p>
              </Show>
              <input
                style={inputStyle}
                type="email"
                placeholder="Email"
                value={email()}
                onInput={(e) => setEmail(e.currentTarget.value)}
              />
              <input
                style={inputStyle}
                type="password"
                placeholder="Password"
                value={password()}
                onInput={(e) => setPassword(e.currentTarget.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleLogin();
                }}
              />
              <Show when={error()}>
                <p style={{ color: "var(--md-sys-color-error)", margin: 0 }}>
                  {error()}
                </p>
              </Show>
              <div style={{ display: "flex", gap: "8px", "justify-content": "flex-end" }}>
                <button
                  style={{ ...buttonStyle, background: "transparent", color: "var(--md-sys-color-on-surface)" }}
                  onClick={() => { setStep("url"); setError(""); }}
                >
                  Back
                </button>
                <button
                  style={buttonStyle}
                  onClick={handleLogin}
                  disabled={loading() || !email().trim() || !password().trim()}
                >
                  {loading() ? "Logging in..." : "Login"}
                </button>
              </div>
            </div>
          </Show>

          <Show when={step() === "done"}>
            <p style={{ color: "var(--md-sys-color-primary)" }}>
              Connected successfully! Closing...
            </p>
          </Show>
        </div>
      </div>
    </Show>
  );
}
