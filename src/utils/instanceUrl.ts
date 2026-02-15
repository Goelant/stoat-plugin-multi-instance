/**
 * Normalize an instance API URL for use as a stable key.
 * - Lowercases the URL
 * - Strips trailing slashes
 * - Ensures https:// prefix
 */
export function normalizeInstanceUrl(url: string): string {
  let normalized = url.trim().toLowerCase();

  // Add https:// if no protocol
  if (!normalized.startsWith("http://") && !normalized.startsWith("https://")) {
    normalized = "https://" + normalized;
  }

  // Strip trailing slashes
  normalized = normalized.replace(/\/+$/, "");

  return normalized;
}

/**
 * Derive a short slug from an instance URL for display purposes.
 * e.g. "https://stoat.chat/api" → "stoat-chat"
 */
export function instanceSlug(url: string): string {
  try {
    const parsed = new URL(normalizeInstanceUrl(url));
    return parsed.hostname.replace(/\./g, "-");
  } catch {
    return url.replace(/[^a-z0-9]/gi, "-").toLowerCase();
  }
}

/**
 * Try to fetch the RevoltConfig from a given base URL.
 * Returns the config if valid, or null.
 */
async function tryFetchConfig(
  baseUrl: string,
): Promise<{ ws: string; [key: string]: unknown } | null> {
  try {
    const response = await fetch(baseUrl + "/", {
      headers: { "Content-Type": "application/json" },
    });
    if (!response.ok) return null;

    const config = await response.json();
    if (typeof config.ws === "string") {
      return config;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Validate that a URL looks like a valid Stoat/Revolt API endpoint.
 * Tries the URL as-is, then with common suffixes like /api.
 *
 * On success, returns the resolved API URL (which may differ from input).
 * If CORS blocks all attempts, returns a "cors" result with the best guess URL.
 */
export async function validateInstanceUrl(
  url: string,
): Promise<
  | { valid: true; name: string; apiUrl: string }
  | { valid: false; error: string }
  | { valid: "cors"; name: string; apiUrl: string }
> {
  const normalized = normalizeInstanceUrl(url);
  const hostname = new URL(normalized).hostname;

  // Try the URL as-is first, then with /api suffix
  const candidates = [normalized];
  if (!normalized.endsWith("/api")) {
    candidates.push(normalized + "/api");
  }

  for (const candidate of candidates) {
    const config = await tryFetchConfig(candidate);
    if (config) {
      return { valid: true, name: hostname, apiUrl: candidate };
    }
  }

  // All attempts failed (likely CORS or network error).
  // Return "cors" with the best guess: if the URL doesn't already end with /api,
  // suggest /api since that's the common Revolt/Stoat convention.
  const bestGuess =
    normalized.endsWith("/api") ? normalized : normalized + "/api";
  return { valid: "cors", name: hostname, apiUrl: bestGuess };
}
