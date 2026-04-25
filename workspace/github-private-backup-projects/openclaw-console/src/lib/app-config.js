export const STORAGE_KEY = "clawlink-console-config-v1";
export const LEGACY_STORAGE_KEY = "openclaw-console-config-v2";

export const DEFAULT_ENDPOINTS = {
  endpoint: "/api/chat",
  sessionEndpoint: "/api/session",
  healthEndpoint: "/api/health",
  sessionsEndpoint: "/api/sessions",
  historyEndpoint: "/api/history",
  agentsEndpoint: "/api/agents",
  agentDispatchEndpoint: "/api/agents/dispatch",
};

export const LEGACY_LOCAL_ENDPOINTS = {
  endpoint: "http://localhost:3000/api/chat",
  sessionEndpoint: "http://localhost:3000/api/session",
  healthEndpoint: "http://localhost:3000/api/health",
  sessionsEndpoint: "http://localhost:3000/api/sessions",
  historyEndpoint: "http://localhost:3000/api/history",
  agentsEndpoint: "http://localhost:3000/api/agents",
  agentDispatchEndpoint: "http://localhost:3000/api/agents/dispatch",
};

export const DEFAULT_CONFIG = {
  mode: "live",
  ...DEFAULT_ENDPOINTS,
  theme: "dark",
  sessionKey: "",
  agentId: "",
};

export function loadStoredConfig() {
  if (typeof window === "undefined") return DEFAULT_CONFIG;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const legacyRaw = window.localStorage.getItem(LEGACY_STORAGE_KEY);
    const saved = raw || legacyRaw;
    if (!saved) return DEFAULT_CONFIG;

    const merged = { ...DEFAULT_CONFIG, ...JSON.parse(saved) };
    const usingBundledDefaults = [
      "endpoint",
      "sessionEndpoint",
      "healthEndpoint",
      "sessionsEndpoint",
      "historyEndpoint",
      "agentsEndpoint",
      "agentDispatchEndpoint",
    ].every(
      (field) => merged[field] === DEFAULT_ENDPOINTS[field] || merged[field] === LEGACY_LOCAL_ENDPOINTS[field]
    );

    if (merged.mode === "mock" && usingBundledDefaults && !merged.sessionKey && !merged.agentId) {
      return { ...merged, mode: "live" };
    }

    return merged;
  } catch {
    return DEFAULT_CONFIG;
  }
}
