import { randomUUID } from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import { homedir } from "node:os";
import path from "node:path";
import { r as callGatewayRuntime } from "file:///opt/homebrew/lib/node_modules/openclaw/dist/call-BjnDacVz.js";
import { extractSessionKey } from "./src/lib/openclaw.js";

const port = process.env.PORT || 3000;
const distDir = path.resolve(process.cwd(), "dist");
const distIndexPath = path.join(distDir, "index.html");

const explicitGatewayBaseUrl = process.env.OPENCLAW_BASE_URL || "";
const explicitGatewayWsUrl = process.env.OPENCLAW_GATEWAY_WS_URL || "";
const explicitGatewayToken = process.env.OPENCLAW_GATEWAY_TOKEN || "";
const explicitGatewayPassword = process.env.OPENCLAW_GATEWAY_PASSWORD || "";
const explicitSessionKey = process.env.OPENCLAW_SESSION_KEY || "";
const explicitAgentId = process.env.OPENCLAW_AGENT_ID || "";
const openClawConfigPath =
  process.env.OPENCLAW_CONFIG_PATH || path.join(homedir(), ".openclaw", "openclaw.json");

const probeTimeoutMs = 3500;
const gatewayCallTimeoutMs = Number(process.env.OPENCLAW_GATEWAY_CALL_TIMEOUT_MS || 120000);
const maxActivityLogs = 200;

const activityLogs = [];
const runtimeState = {
  lastSessionsCount: 0,
  lastSessionKey: explicitSessionKey || "main",
  lastHistorySessionKey: "",
  lastChatAt: "",
};

function sendJson(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  });
  res.end(JSON.stringify(payload));
}

function sendStatic(res, status, content, contentType, extraHeaders = {}) {
  res.writeHead(status, {
    "Content-Type": contentType,
    ...extraHeaders,
  });
  res.end(content);
}

function createActivityLog(entry) {
  activityLogs.unshift({
    id: randomUUID(),
    time: new Date().toISOString(),
    ...entry,
  });
  if (activityLogs.length > maxActivityLogs) {
    activityLogs.length = maxActivityLogs;
  }
}

function shorten(value, maxLength = 180) {
  if (typeof value !== "string") return "";
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength)}…`;
}

function stringifyPreview(value, maxLength = 180) {
  try {
    return shorten(JSON.stringify(value), maxLength);
  } catch {
    return "";
  }
}

function parseLimit(urlString, fallback = 60) {
  try {
    const url = new URL(urlString, "http://localhost");
    const value = Number(url.searchParams.get("limit"));
    if (Number.isFinite(value) && value > 0) {
      return Math.min(Math.floor(value), maxActivityLogs);
    }
  } catch {}
  return fallback;
}

function parseActivityLogFilters(urlString) {
  try {
    const url = new URL(urlString, "http://localhost");
    return {
      limit: parseLimit(urlString, 80),
      status: (url.searchParams.get("status") || "").trim(),
      source: (url.searchParams.get("source") || "").trim(),
      action: (url.searchParams.get("action") || "").trim(),
      sessionKey: (url.searchParams.get("sessionKey") || "").trim(),
      q: (url.searchParams.get("q") || "").trim(),
    };
  } catch {
    return {
      limit: parseLimit(urlString, 80),
      status: "",
      source: "",
      action: "",
      sessionKey: "",
      q: "",
    };
  }
}

function buildActivityLogFacets() {
  return {
    statuses: [...new Set(activityLogs.map((item) => item.status).filter(Boolean))],
    sources: [...new Set(activityLogs.map((item) => item.source).filter(Boolean))],
    actions: [...new Set(activityLogs.map((item) => item.action).filter(Boolean))].slice(0, 24),
  };
}

function filterActivityLogs(filters) {
  const keyword = filters.q.toLowerCase();

  return activityLogs
    .filter((item) => {
      if (filters.status && item.status !== filters.status) return false;
      if (filters.source && item.source !== filters.source) return false;
      if (filters.action && item.action !== filters.action) return false;
      if (filters.sessionKey && item.meta?.sessionKey !== filters.sessionKey) return false;
      if (!keyword) return true;

      const haystack = [
        item.source,
        item.action,
        item.status,
        item.detail,
        item.meta?.sessionKey,
        item.meta?.agentId,
        item.meta?.request,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(keyword);
    })
    .slice(0, filters.limit);
}

function loadLocalOpenClawConfig() {
  try {
    if (!fs.existsSync(openClawConfigPath)) return null;
    return JSON.parse(fs.readFileSync(openClawConfigPath, "utf8"));
  } catch {
    return null;
  }
}

function staticContentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();

  switch (ext) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".js":
      return "application/javascript; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    case ".svg":
      return "image/svg+xml";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".ico":
      return "image/x-icon";
    case ".woff":
      return "font/woff";
    case ".woff2":
      return "font/woff2";
    default:
      return "application/octet-stream";
  }
}

function safeDistPath(urlPath) {
  const decodedPath = decodeURIComponent(urlPath || "/");
  const normalizedUrlPath = decodedPath === "/" ? "/index.html" : decodedPath;
  const filePath = path.resolve(distDir, `.${normalizedUrlPath}`);
  const distRoot = `${distDir}${path.sep}`;

  if (filePath === distDir || filePath.startsWith(distRoot)) {
    return filePath;
  }

  return "";
}

function serveStaticApp(req, res) {
  if (!fs.existsSync(distIndexPath)) {
    return false;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);
  const requestedPath = safeDistPath(url.pathname);

  if (requestedPath) {
    try {
      const stat = fs.statSync(requestedPath);
      if (stat.isFile()) {
        sendStatic(
          res,
          200,
          fs.readFileSync(requestedPath),
          staticContentType(requestedPath),
          requestedPath.includes(`${path.sep}assets${path.sep}`)
            ? { "Cache-Control": "public, max-age=31536000, immutable" }
            : { "Cache-Control": "no-cache" }
        );
        return true;
      }
    } catch {}
  }

  if (!path.extname(url.pathname)) {
    sendStatic(
      res,
      200,
      fs.readFileSync(distIndexPath),
      "text/html; charset=utf-8",
      { "Cache-Control": "no-cache" }
    );
    return true;
  }

  return false;
}

function resolveDefaultAgentId(config) {
  if (explicitAgentId) return explicitAgentId;
  const fromList = config?.agents?.list?.find((agent) => agent?.default)?.id;
  return fromList || config?.agents?.defaults?.agentId || "main";
}

function resolveGatewaySettings() {
  const config = loadLocalOpenClawConfig();
  const gatewayPort = Number(config?.gateway?.port) || 18789;
  const gatewayHost = config?.gateway?.bind === "loopback" ? "127.0.0.1" : "127.0.0.1";
  const gatewayBaseUrl = explicitGatewayBaseUrl || `http://${gatewayHost}:${gatewayPort}`;
  const gatewayWsUrl =
    explicitGatewayWsUrl ||
    gatewayBaseUrl.replace(/^http:/, "ws:").replace(/^https:/, "wss:");
  const token = explicitGatewayToken || config?.gateway?.auth?.token || "";
  const password = explicitGatewayPassword || config?.gateway?.auth?.password || "";
  const targetAgentId = resolveDefaultAgentId(config);
  const targetSessionKey = explicitSessionKey || "main";

  return {
    gatewayBaseUrl,
    gatewayWsUrl,
    token,
    password,
    targetAgentId,
    targetSessionKey,
    configSource: explicitGatewayBaseUrl || explicitGatewayWsUrl ? "env" : config ? "local-config" : "defaults",
    configPath: config ? openClawConfigPath : "",
    hasGatewayAuth: Boolean(token || password),
  };
}

function sanitizeGatewayText(text, settings) {
  let next = String(text || "");
  if (settings?.token) next = next.split(settings.token).join("***");
  if (settings?.password) next = next.split(settings.password).join("***");
  return next;
}

function gatewayErrorMessage(error, settings) {
  const raw = error?.stderr || error?.stdout || error?.message || String(error);
  if (error?.killed || error?.signal === "SIGTERM") {
    return `OpenClaw Gateway 调用超时：${sanitizeGatewayText(raw, settings) || "timeout"}`;
  }
  return sanitizeGatewayText(raw, settings).trim() || "OpenClaw Gateway 调用失败";
}

async function callOpenClawRpc(method, params = {}, options = {}) {
  const settings = resolveGatewaySettings();
  const startedAt = Date.now();
  const timeout = options.timeoutMs || gatewayCallTimeoutMs;

  if (!settings.hasGatewayAuth) {
    throw new Error(`缺少 OpenClaw Gateway token/password，未能从 ${openClawConfigPath} 或环境变量读取。`);
  }

  try {
    const data = await callGatewayRuntime({
      url: settings.gatewayWsUrl,
      token: settings.token || undefined,
      password: !settings.token ? settings.password || undefined : undefined,
      method,
      params,
      timeoutMs: timeout,
      expectFinal: Boolean(options.expectFinal),
    });

    if (options.log !== false) {
      createActivityLog({
        source: "gateway",
        action: method,
        status: "ok",
        detail: `${method} 调用成功`,
        durationMs: Date.now() - startedAt,
        meta: {
          request: stringifyPreview(params),
          transport: "openclaw-gateway-runtime",
        },
      });
    }

    return data;
  } catch (error) {
    const message = gatewayErrorMessage(error, settings);
    if (options.log !== false) {
      createActivityLog({
        source: "gateway",
        action: method,
        status: "error",
        detail: shorten(message, 240),
        durationMs: Date.now() - startedAt,
        meta: {
          request: stringifyPreview(params),
          transport: "openclaw-gateway-runtime",
        },
      });
    }
    throw new Error(message);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(body || "{}"));
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

async function probeGateway() {
  const settings = resolveGatewaySettings();

  if (!settings.gatewayBaseUrl) {
    return {
      reachable: false,
      latencyMs: null,
      statusCode: null,
      detail: "未配置 OpenClaw Gateway",
      settings,
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), probeTimeoutMs);
  const startedAt = Date.now();

  try {
    const response = await fetch(`${settings.gatewayBaseUrl}/health`, {
      method: "GET",
      signal: controller.signal,
    });

    return {
      reachable: response.ok,
      latencyMs: Date.now() - startedAt,
      statusCode: response.status,
      detail: `${settings.gatewayBaseUrl} 可访问`,
      settings,
    };
  } catch (error) {
    return {
      reachable: false,
      latencyMs: null,
      statusCode: null,
      detail: error.name === "AbortError" ? "探测超时" : error.message,
      settings,
    };
  } finally {
    clearTimeout(timer);
  }
}

function buildChecks(probe, operational = {}) {
  const settings = probe.settings || resolveGatewaySettings();
  const sessions = operational.sessions || [];
  const nodes = operational.nodes || [];
  const pairedDevices = operational.pairedDevices || [];
  const pendingDevices = operational.pendingDevices || [];
  const sessionError = operational.sessionError || "";
  const nodeError = operational.nodeError || "";
  const deviceError = operational.deviceError || "";

  return [
    {
      id: "clawlink-api",
      label: "ClawLink API",
      status: "online",
      detail: `本地代理运行在 http://localhost:${port}`,
      kind: "service",
    },
    {
      id: "openclaw-gateway",
      label: "OpenClaw Gateway",
      status: probe.reachable ? "online" : settings.gatewayBaseUrl ? "offline" : "warn",
      detail: probe.reachable
        ? `${settings.gatewayBaseUrl} · ${probe.latencyMs}ms · ${settings.configSource}`
        : settings.gatewayBaseUrl
          ? `无法连接 ${settings.gatewayBaseUrl}：${probe.detail}`
          : "未配置 OpenClaw Gateway",
      kind: "service",
    },
    {
      id: "gateway-auth",
      label: "Gateway 鉴权",
      status: settings.hasGatewayAuth ? "online" : "warn",
      detail: settings.hasGatewayAuth
        ? `已从 ${settings.configSource === "local-config" ? settings.configPath : settings.configSource} 读取鉴权`
        : "缺少 token/password，无法正式调用 Gateway RPC",
      kind: "config",
    },
    {
      id: "agent-routing",
      label: "默认 Agent",
      status: settings.targetAgentId ? "online" : "warn",
      detail: settings.targetAgentId ? `已配置 ${settings.targetAgentId}` : "缺少默认 Agent",
      kind: "config",
    },
    {
      id: "session-routing",
      label: "默认会话",
      status: sessionError ? "warn" : "online",
      detail: sessionError
        ? `会话索引读取失败：${shorten(sessionError, 120)}`
        : `已同步 ${sessions.length} 个会话，默认 ${settings.targetSessionKey}`,
      kind: "service",
    },
    {
      id: "node-runtime",
      label: "节点运行态",
      status: nodeError ? "warn" : "online",
      detail: nodeError ? `节点读取失败：${shorten(nodeError, 120)}` : `在线节点 ${nodes.length} 个`,
      kind: "service",
    },
    {
      id: "device-pairing",
      label: "设备配对",
      status: deviceError ? "warn" : pairedDevices.length ? "online" : "planned",
      detail: deviceError
        ? `设备读取失败：${shorten(deviceError, 120)}`
        : `已配对 ${pairedDevices.length} 台，待确认 ${pendingDevices.length} 台`,
      kind: "service",
    },
    {
      id: "clawlink-chat",
      label: "ClawLink 聊天",
      status: sessionError ? "warn" : "online",
      detail: "已切到官方 Gateway RPC：sessions.list / chat.history / chat.send",
      kind: "module",
    },
    {
      id: "openclaw-nodes",
      label: "节点设备接口",
      status: nodeError || deviceError ? "warn" : "online",
      detail: "已接入 node.list 与 device.pair.list",
      kind: "module",
    },
    {
      id: "browser-control",
      label: "浏览器控制",
      status: "planned",
      detail: "页面结构已就绪，真实接口待接入",
      kind: "module",
    },
    {
      id: "task-scheduler",
      label: "任务调度",
      status: "planned",
      detail: "页面结构已就绪，真实接口待接入",
      kind: "module",
    },
  ];
}

async function buildSystemOverview() {
  const probe = await probeGateway();
  const [sessionsResult, nodesResult, devicesResult] = await Promise.allSettled([
    callOpenClawRpc("sessions.list", { limit: 20, includeLastMessage: false }, { log: false, timeoutMs: 20000 }),
    callOpenClawRpc("node.list", {}, { log: false, timeoutMs: 20000 }),
    callOpenClawRpc("device.pair.list", {}, { log: false, timeoutMs: 20000 }),
  ]);
  const sessions = sessionsResult.status === "fulfilled" ? normalizeSessionList(sessionsResult.value) : [];
  const nodes = nodesResult.status === "fulfilled" && Array.isArray(nodesResult.value?.nodes) ? nodesResult.value.nodes : [];
  const pairedDevices =
    devicesResult.status === "fulfilled" && Array.isArray(devicesResult.value?.paired)
      ? devicesResult.value.paired
      : [];
  const pendingDevices =
    devicesResult.status === "fulfilled" && Array.isArray(devicesResult.value?.pending)
      ? devicesResult.value.pending
      : [];
  const checks = buildChecks(probe, {
    sessions,
    nodes,
    pairedDevices,
    pendingDevices,
    sessionError: sessionsResult.status === "rejected" ? sessionsResult.reason?.message : "",
    nodeError: nodesResult.status === "rejected" ? nodesResult.reason?.message : "",
    deviceError: devicesResult.status === "rejected" ? devicesResult.reason?.message : "",
  });
  const summary = checks.reduce(
    (accumulator, item) => {
      const key = `${item.status}Count`;
      accumulator[key] = (accumulator[key] || 0) + 1;
      return accumulator;
    },
    {
      onlineCount: 0,
      warnCount: 0,
      offlineCount: 0,
      plannedCount: 0,
    }
  );

  return {
    ok: true,
    timestamp: new Date().toISOString(),
    checks,
    summary: {
      ...summary,
      lastSessionsCount: sessions.length || runtimeState.lastSessionsCount,
      recentErrorCount: activityLogs.filter((item) => item.status === "error").length,
      nodeCount: nodes.length,
      pairedDeviceCount: pairedDevices.length,
      pendingDeviceCount: pendingDevices.length,
    },
    runtime: {
      lastSessionKey: runtimeState.lastSessionKey,
      lastHistorySessionKey: runtimeState.lastHistorySessionKey,
      lastChatAt: runtimeState.lastChatAt,
    },
    config: {
      gatewayBaseUrl: probe.settings.gatewayBaseUrl,
      gatewayWsUrl: probe.settings.gatewayWsUrl,
      configSource: probe.settings.configSource,
      configPath: probe.settings.configPath,
      hasGatewayToken: Boolean(probe.settings.token),
      hasGatewayPassword: Boolean(probe.settings.password),
      hasAgentId: Boolean(probe.settings.targetAgentId),
      hasSessionKey: Boolean(probe.settings.targetSessionKey),
    },
    recentLogs: activityLogs.slice(0, 8),
  };
}

function normalizeAssistantReply(result) {
  if (!result) return "";
  if (typeof result.reply === "string") return result.reply;
  if (typeof result.output === "string") return result.output;
  if (typeof result.text === "string") return result.text;
  if (typeof result.message === "string") return result.message;
  if (Array.isArray(result.messages)) {
    const lastAssistant = [...result.messages].reverse().find((item) => item.role === "assistant" && item.content);
    if (lastAssistant) return lastAssistant.content;
  }
  if (result.result && typeof result.result === "object") {
    return normalizeAssistantReply(result.result);
  }
  return JSON.stringify(result, null, 2);
}

function formatOpenClawTimestamp(value) {
  if (!value) return "";
  const date = typeof value === "number" ? new Date(value) : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("zh-CN", { hour12: false });
}

function summarizeToolCall(part) {
  if (!part || typeof part !== "object") return "工具调用";

  const name = part.name || part.id || "tool";
  const args =
    part.arguments && typeof part.arguments === "object"
      ? part.arguments
      : part.input && typeof part.input === "object"
        ? part.input
        : {};

  if (typeof args.command === "string" && args.command.trim()) {
    return `${name} · ${shorten(args.command.trim(), 120)}`;
  }

  if (typeof args.path === "string" && args.path.trim()) {
    return `${name} · ${shorten(args.path.trim(), 120)}`;
  }

  if (typeof args.action === "string" && args.action.trim()) {
    const detail = [args.action, args.sessionId].filter(Boolean).join(" · ");
    return `${name} · ${detail}`;
  }

  const preview = stringifyPreview(args, 120);
  return preview ? `${name} · ${preview}` : name;
}

function normalizeMessageParts(message) {
  if (!message) return [];

  const sourceParts = Array.isArray(message.content)
    ? message.content
    : typeof message.content === "string"
      ? [{ type: "text", text: message.content }]
      : typeof message.text === "string"
        ? [{ type: "text", text: message.text }]
        : typeof message.message === "string"
          ? [{ type: "text", text: message.message }]
          : [];

  return sourceParts
    .map((part, index) => {
      if (!part) return null;
      if (typeof part === "string") {
        return {
          id: `text-${index}`,
          type: "text",
          text: part,
        };
      }

      if (typeof part.text === "string") {
        return {
          id: part.id || `text-${index}`,
          type: "text",
          text: part.text,
        };
      }

      if (part.type === "toolCall") {
        return {
          id: part.id || `tool-${index}`,
          type: "toolCall",
          name: part.name || part.id || "tool",
          summary: summarizeToolCall(part),
          arguments:
            part.arguments && typeof part.arguments === "object"
              ? part.arguments
              : part.input && typeof part.input === "object"
                ? part.input
                : null,
        };
      }

      if (part.type === "image") {
        return {
          id: part.id || `image-${index}`,
          type: "image",
          text: "[image]",
        };
      }

      return null;
    })
    .filter(Boolean);
}

function extractMessageText(message) {
  const parts = normalizeMessageParts(message);
  return parts
    .map((part) => {
      if (part.type === "text") return part.text || "";
      if (part.type === "toolCall") return part.summary || part.name || "tool";
      if (part.type === "image") return part.text || "[image]";
      return "";
    })
    .filter(Boolean)
    .join("\n");
}

function messageIdentity(message, index = 0) {
  return (
    message?.__openclaw?.id ||
    message?.__openclaw?.seq ||
    message?.id ||
    `${message?.role || "message"}-${message?.timestamp || message?.time || index}`
  );
}

function normalizeSessionList(result) {
  const list = result.sessions || result.items || result.result?.sessions || result.result?.items || [];
  if (!Array.isArray(list)) return [];

  return list.map((item) => {
    const sessionKey = item.sessionKey || item.key || item.id || "";
    const updatedAtRaw = item.updatedAt || item.lastActivityAt || item.timestamp || item.endedAt || item.startedAt;

    return {
      sessionKey,
      label: item.displayName || item.label || item.title || item.derivedTitle || sessionKey || "未命名会话",
      kind: item.kind || item.type || item.chatType || "unknown",
      agentId: parseAgentIdFromSessionKey(sessionKey),
      channelKind: parseChannelKindFromSessionKey(sessionKey),
      status: item.status || "",
      model: item.model || item.modelProvider || "",
      provider: item.origin?.provider || item.provider || "",
      lastMessage:
        extractMessageText(item.lastMessage) ||
        item.lastMessagePreview ||
        item.preview ||
        [item.status, item.model || item.modelProvider, item.origin?.provider].filter(Boolean).join(" · ") ||
        "暂无预览",
      updatedAt: formatOpenClawTimestamp(updatedAtRaw),
      updatedAtRaw,
    };
  });
}

function parseAgentIdFromSessionKey(sessionKey) {
  if (typeof sessionKey !== "string") return "";
  const parts = sessionKey.split(":");
  if (parts[0] === "agent" && parts[1]) return parts[1];
  return "";
}

function parseChannelKindFromSessionKey(sessionKey) {
  if (typeof sessionKey !== "string") return "";
  const parts = sessionKey.split(":");
  if (parts[0] === "agent" && parts[2]) return parts[2];
  return "";
}

function toTimestampMs(value) {
  if (!value) return 0;
  if (typeof value === "number") {
    return value < 10_000_000_000 ? value * 1000 : value;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeAgentList(result, settings) {
  const config = loadLocalOpenClawConfig();
  const sourceAgents =
    result?.agents ||
    result?.items ||
    result?.result?.agents ||
    result?.result?.items ||
    config?.agents?.list ||
    [];
  const defaultId = result?.defaultId || config?.agents?.defaults?.agentId || settings.targetAgentId || "main";

  if (!Array.isArray(sourceAgents)) return [];

  return sourceAgents
    .map((item) => {
      if (!item) return null;
      const id = typeof item === "string" ? item : item.id || item.agentId || item.key || "";
      if (!id) return null;

      return {
        id,
        name: typeof item === "string" ? id : item.name || item.label || id,
        workspace: typeof item === "string" ? "" : item.workspace || item.cwd || "",
        modelPrimary:
          typeof item === "string"
            ? ""
            : item.model?.primary || item.modelPrimary || item.model || item.providerModel || "",
        modelFallbacks: typeof item === "string" ? [] : item.model?.fallbacks || item.fallbacks || [],
        description: typeof item === "string" ? "" : item.description || "",
        isDefault: id === defaultId || Boolean(item?.default),
      };
    })
    .filter(Boolean);
}

function deriveAgentStatus(agentSessions) {
  const now = Date.now();
  const sortedSessions = [...agentSessions].sort(
    (left, right) => toTimestampMs(right.updatedAtRaw) - toTimestampMs(left.updatedAtRaw)
  );
  const latestSession = sortedSessions[0];
  const latestStatus = String(latestSession?.status || "").toLowerCase();
  const errorSessions = sortedSessions.filter((session) =>
    ["error", "failed", "aborted", "cancelled"].includes(String(session.status || "").toLowerCase())
  );
  const latestErrorTimestamp = Math.max(...errorSessions.map((session) => toTimestampMs(session.updatedAtRaw)), 0);
  const runningCount = agentSessions.filter((session) =>
    ["running", "active", "working", "in_progress", "queued", "pending"].includes(
      String(session.status || "").toLowerCase()
    )
  ).length;
  const lastTimestamp = Math.max(...agentSessions.map((session) => toTimestampMs(session.updatedAtRaw)), 0);
  const recentWithin15Minutes = lastTimestamp > 0 && now - lastTimestamp <= 15 * 60 * 1000;
  const recentWithin1Hour = lastTimestamp > 0 && now - lastTimestamp <= 60 * 60 * 1000;
  const recentErrorWithin1Hour =
    latestErrorTimestamp > 0 &&
    now - latestErrorTimestamp <= 60 * 60 * 1000 &&
    latestErrorTimestamp >= lastTimestamp - 1000;

  if (["running", "active", "working", "in_progress", "queued", "pending"].includes(latestStatus) || runningCount > 0) {
    return { status: "working", statusLabel: `${runningCount || 1} 个任务运行中`, runningCount };
  }
  if (["error", "failed", "aborted", "cancelled"].includes(latestStatus) || recentErrorWithin1Hour) {
    return { status: "error", statusLabel: "需要关注", runningCount };
  }
  if (recentWithin15Minutes) return { status: "thinking", statusLabel: "刚刚活跃", runningCount };
  if (recentWithin1Hour) return { status: "thinking", statusLabel: "近期活跃", runningCount };
  if (agentSessions.length) return { status: "idle", statusLabel: "待命", runningCount };
  return { status: "idle", statusLabel: "未见会话", runningCount };
}

function enrichAgentsWithSessions(agents, sessions, settings) {
  const agentsById = new Map(agents.map((agent) => [agent.id, agent]));
  const sessionsByAgent = new Map();
  const now = Date.now();

  sessions.forEach((session) => {
    const agentId = session.agentId || parseAgentIdFromSessionKey(session.sessionKey) || settings.targetAgentId || "main";
    if (!sessionsByAgent.has(agentId)) sessionsByAgent.set(agentId, []);
    sessionsByAgent.get(agentId).push({ ...session, agentId });

    if (!agentsById.has(agentId)) {
      const inferredAgent = {
        id: agentId,
        name: agentId,
        workspace: "",
        modelPrimary: session.model || "",
        modelFallbacks: [],
        description: "从 sessionKey 推断出的 Agent",
        isDefault: agentId === settings.targetAgentId,
      };
      agentsById.set(agentId, inferredAgent);
      agents.push(inferredAgent);
    }
  });

  return agents.map((agent) => {
    const agentSessions = (sessionsByAgent.get(agent.id) || []).sort(
      (left, right) => toTimestampMs(right.updatedAtRaw) - toTimestampMs(left.updatedAtRaw)
    );
    const recentSessionCount = agentSessions.filter((session) => {
      const timestamp = toTimestampMs(session.updatedAtRaw);
      return timestamp > 0 && now - timestamp <= 60 * 60 * 1000;
    }).length;
    const channelKinds = [...new Set(agentSessions.map((session) => session.channelKind).filter(Boolean))];
    const latestSession = agentSessions[0] || null;
    const status = deriveAgentStatus(agentSessions);

    return {
      ...agent,
      status: status.status,
      statusLabel: status.statusLabel,
      runningSessionCount: status.runningCount,
      sessionCount: agentSessions.length,
      recentSessionCount,
      lastActivityAt: latestSession?.updatedAt || "",
      lastActivityAtRaw: latestSession?.updatedAtRaw || "",
      recentSessionKey: latestSession?.sessionKey || "",
      recentSessionLabel: latestSession?.label || "",
      recentSessionPreview: latestSession?.lastMessage || "",
      channelKinds,
      toolSummary: channelKinds.length ? channelKinds.join(" / ") : "暂无通道",
      sessions: agentSessions.slice(0, 8),
    };
  });
}

function normalizeHistory(result) {
  const list = result.messages || result.items || result.result?.messages || result.result?.items || [];
  if (!Array.isArray(list)) return [];

  return list
    .map((item, index) => {
      const parts = normalizeMessageParts(item);
      const content = extractMessageText(item);

      return {
        id: messageIdentity(item, index),
        role: item.role || item.author || "assistant",
        content,
        parts,
        time: formatOpenClawTimestamp(item.time || item.createdAt || item.timestamp),
        provider: item.provider || item.origin?.provider || "",
        model: item.model || item.modelProvider || "",
        api: item.api || "",
      };
    })
    .filter((item) => item.parts.length && ["user", "assistant", "system"].includes(item.role));
}

async function waitForAssistantReply(sessionKey, beforeIds, startedAt, timeoutMs = 45000) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    await sleep(1500);

    const result = await callOpenClawRpc(
      "chat.history",
      {
        sessionKey,
        limit: 40,
        maxChars: 12000,
      },
      { log: false, timeoutMs: 20000 }
    ).catch(() => null);

    if (!result || !Array.isArray(result.messages)) continue;

    for (let index = result.messages.length - 1; index >= 0; index -= 1) {
      const message = result.messages[index];
      const id = messageIdentity(message, index);
      const timestamp = typeof message.timestamp === "number" ? message.timestamp : Date.parse(message.time || "");
      const isFresh = !beforeIds.has(id) && (!Number.isFinite(timestamp) || timestamp >= startedAt - 2000);
      const content = extractMessageText(message);

      if (isFresh && message.role === "assistant" && content.trim()) {
        return {
          id,
          role: "assistant",
          content,
          time: formatOpenClawTimestamp(message.timestamp || message.time),
        };
      }
    }
  }

  return null;
}

async function handleHealth(_req, res) {
  const probe = await probeGateway();
  const checks = buildChecks(probe);
  const settings = probe.settings || resolveGatewaySettings();

  sendJson(res, 200, {
    ok: true,
    gatewayBaseUrl: settings.gatewayBaseUrl,
    gatewayWsUrl: settings.gatewayWsUrl,
    configSource: settings.configSource,
    configPath: settings.configPath,
    hasGatewayToken: Boolean(settings.token),
    hasGatewayPassword: Boolean(settings.password),
    targetSessionKey: settings.targetSessionKey,
    targetAgentId: settings.targetAgentId,
    gatewayReachable: probe.reachable,
    gatewayLatencyMs: probe.latencyMs,
    checks,
  });
}

async function handleCreateSession(req, res) {
  const body = await readJsonBody(req);
  const label = body.label || "ClawLink Console";
  const message = typeof body.message === "string" ? body.message.trim() : "";
  const settings = resolveGatewaySettings();

  if (!settings.targetAgentId) {
    sendJson(res, 400, {
      error: "缺少默认 Agent，当前无法创建真实会话。",
    });
    return;
  }

  const params = {
    agentId: body.agentId || settings.targetAgentId,
    label,
  };

  if (message) {
    params.message = message;
  }

  const result = await callOpenClawRpc("sessions.create", params);

  const nextSessionKey = extractSessionKey(result, runtimeState.lastSessionKey);

  runtimeState.lastSessionKey = nextSessionKey || runtimeState.lastSessionKey;
  createActivityLog({
    source: "route",
    action: "POST /api/session",
    status: "ok",
    detail: nextSessionKey ? `会话已创建 ${nextSessionKey}` : "创建会话接口已返回",
  });

  sendJson(res, 200, {
    ok: true,
    sessionKey: nextSessionKey || "",
    agentId: body.agentId || settings.targetAgentId,
    session: result,
  });
}

async function handleChat(req, res) {
  const body = await readJsonBody(req);
  const message = (body.message || "").trim();
  const settings = resolveGatewaySettings();
  const sessionKey = body.sessionKey || settings.targetSessionKey || "main";
  const startedAt = Date.now();

  if (!message) {
    sendJson(res, 400, { error: "message 不能为空" });
    return;
  }

  if (!sessionKey) {
    sendJson(res, 400, {
      error: "缺少 sessionKey。请先创建会话，或设置 OPENCLAW_SESSION_KEY。",
    });
    return;
  }

  const before = await callOpenClawRpc(
    "chat.history",
    {
      sessionKey,
      limit: 30,
      maxChars: 12000,
    },
    { log: false, timeoutMs: 20000 }
  ).catch(() => ({ messages: [] }));
  const beforeIds = new Set((before.messages || []).map((item, index) => messageIdentity(item, index)));
  const result = await callOpenClawRpc("chat.send", {
    sessionKey,
    message,
    deliver: false,
    idempotencyKey: body.idempotencyKey || randomUUID(),
  });
  const reply = await waitForAssistantReply(sessionKey, beforeIds, startedAt);

  runtimeState.lastSessionKey = sessionKey;
  runtimeState.lastChatAt = new Date().toISOString();
  createActivityLog({
    source: "route",
    action: "POST /api/chat",
    status: "ok",
    detail: shorten(message, 120),
    meta: {
      sessionKey,
      agentId: body.agentId || settings.targetAgentId,
    },
  });

  sendJson(res, 200, {
    ok: true,
    reply: reply?.content || "消息已提交到 OpenClaw，当前仍在处理中；稍后点“加载历史”可查看最新回复。",
    pending: !reply,
    sessionKey,
    runId: result?.runId,
    raw: result,
  });
}

async function handleSessions(_req, res) {
  const result = await callOpenClawRpc("sessions.list", {
    activeMinutes: 10080,
    includeLastMessage: true,
    includeDerivedTitles: true,
    limit: 50,
  });

  const sessions = normalizeSessionList(result);
  runtimeState.lastSessionsCount = sessions.length;
  if (sessions[0]?.sessionKey) {
    runtimeState.lastSessionKey = runtimeState.lastSessionKey || sessions[0].sessionKey;
  }

  createActivityLog({
    source: "route",
    action: "GET /api/sessions",
    status: "ok",
    detail: `同步 ${sessions.length} 个会话`,
  });

  sendJson(res, 200, {
    ok: true,
    sessions,
    raw: result,
  });
}

async function handleAgents(_req, res) {
  const settings = resolveGatewaySettings();
  const [agentsResult, sessionsResult] = await Promise.allSettled([
    callOpenClawRpc("agents.list", {}, { log: false, timeoutMs: 20000 }),
    callOpenClawRpc(
      "sessions.list",
      {
        activeMinutes: 10080,
        includeLastMessage: true,
        includeDerivedTitles: true,
        limit: 120,
      },
      { log: false, timeoutMs: 20000 }
    ),
  ]);
  const agentSource = agentsResult.status === "fulfilled" ? agentsResult.value : null;
  const sessionSource = sessionsResult.status === "fulfilled" ? sessionsResult.value : { sessions: [] };
  const sessions = normalizeSessionList(sessionSource);
  const agents = normalizeAgentList(agentSource, settings);

  if (!agents.length && settings.targetAgentId) {
    agents.push({
      id: settings.targetAgentId,
      name: settings.targetAgentId,
      workspace: "",
      modelPrimary: "",
      modelFallbacks: [],
      description: "从默认配置推断出的 Agent",
      isDefault: true,
    });
  }

  const enrichedAgents = enrichAgentsWithSessions(agents, sessions, settings).sort((left, right) => {
    if (left.isDefault !== right.isDefault) return left.isDefault ? -1 : 1;
    if (right.runningSessionCount !== left.runningSessionCount) {
      return right.runningSessionCount - left.runningSessionCount;
    }
    return toTimestampMs(right.lastActivityAtRaw) - toTimestampMs(left.lastActivityAtRaw);
  });
  const workingCount = enrichedAgents.filter((agent) => agent.status === "working").length;
  const activeCount = enrichedAgents.filter((agent) => agent.status === "working" || agent.status === "thinking").length;
  const recentCount = enrichedAgents.filter((agent) => agent.recentSessionCount > 0).length;

  createActivityLog({
    source: "route",
    action: "GET /api/agents",
    status: agentsResult.status === "rejected" || sessionsResult.status === "rejected" ? "warn" : "ok",
    detail: `同步 ${enrichedAgents.length} 个 Agent，聚合 ${sessions.length} 个会话`,
    meta: {
      agentError: agentsResult.status === "rejected" ? shorten(agentsResult.reason?.message || "", 160) : "",
      sessionError: sessionsResult.status === "rejected" ? shorten(sessionsResult.reason?.message || "", 160) : "",
    },
  });

  sendJson(res, 200, {
    ok: true,
    timestamp: new Date().toISOString(),
    source: agentSource ? "openclaw-gateway" : "local-config",
    defaultId: agentSource?.defaultId || settings.targetAgentId || "",
    mainKey: agentSource?.mainKey || "",
    scope: agentSource?.scope || "",
    agents: enrichedAgents,
    summary: {
      total: enrichedAgents.length,
      activeCount,
      workingCount,
      recentCount,
      idleCount: enrichedAgents.filter((agent) => agent.status === "idle").length,
      errorCount: enrichedAgents.filter((agent) => agent.status === "error").length,
      sessionCount: sessions.length,
      defaultAgentId: agentSource?.defaultId || settings.targetAgentId || "",
    },
    errors: {
      agents: agentsResult.status === "rejected" ? agentsResult.reason?.message || "agents.list 失败" : "",
      sessions: sessionsResult.status === "rejected" ? sessionsResult.reason?.message || "sessions.list 失败" : "",
    },
  });
}

async function handleDispatchAgent(req, res) {
  const body = await readJsonBody(req);
  const settings = resolveGatewaySettings();
  const agentId = (body.agentId || settings.targetAgentId || "").trim();
  const label = (body.label || `ClawLink Dispatch ${new Date().toLocaleString("zh-CN", { hour12: false })}`).trim();
  const message = typeof body.message === "string" ? body.message.trim() : "";

  if (!agentId) {
    sendJson(res, 400, { error: "缺少 agentId，无法派发任务。" });
    return;
  }

  const sessionResult = await callOpenClawRpc("sessions.create", {
    agentId,
    label,
  });
  const sessionKey = extractSessionKey(sessionResult, runtimeState.lastSessionKey);

  if (!sessionKey) {
    sendJson(res, 502, {
      error: "OpenClaw 已返回创建结果，但未解析到 sessionKey。",
      session: sessionResult,
    });
    return;
  }

  let sendResult = null;
  if (message) {
    sendResult = await callOpenClawRpc("chat.send", {
      sessionKey,
      message,
      deliver: false,
      idempotencyKey: body.idempotencyKey || randomUUID(),
    });
  }

  runtimeState.lastSessionKey = sessionKey;
  if (message) {
    runtimeState.lastChatAt = new Date().toISOString();
  }
  createActivityLog({
    source: "route",
    action: "POST /api/agents/dispatch",
    status: "ok",
    detail: message ? `${agentId} · ${shorten(message, 120)}` : `${agentId} · 创建会话`,
    meta: {
      agentId,
      sessionKey,
    },
  });

  sendJson(res, 200, {
    ok: true,
    agentId,
    sessionKey,
    label,
    pending: Boolean(message),
    reply: message ? "任务已派发到 OpenClaw，稍后在聊天页查看实时历史。" : "会话已创建。",
    session: sessionResult,
    raw: sendResult,
  });
}

async function handleHistory(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const sessionKey = url.searchParams.get("sessionKey") || resolveGatewaySettings().targetSessionKey || "main";

  if (!sessionKey) {
    sendJson(res, 400, { error: "缺少 sessionKey" });
    return;
  }

  const result = await callOpenClawRpc("chat.history", {
    sessionKey,
    limit: 100,
    maxChars: 12000,
  });

  const messages = normalizeHistory(result);
  runtimeState.lastHistorySessionKey = sessionKey;
  runtimeState.lastSessionKey = sessionKey;
  createActivityLog({
    source: "route",
    action: "GET /api/history",
    status: "ok",
    detail: `${sessionKey} · ${messages.length} 条消息`,
  });

  sendJson(res, 200, {
    ok: true,
    messages,
    raw: result,
  });
}

async function handleActivityLogs(req, res) {
  const filters = parseActivityLogFilters(req.url);
  const logs = filterActivityLogs(filters);

  sendJson(res, 200, {
    ok: true,
    logs,
    total: activityLogs.length,
    matched: logs.length,
    filters,
    facets: buildActivityLogFacets(),
  });
}

async function handleSystemOverview(_req, res) {
  const overview = await buildSystemOverview();
  sendJson(res, 200, overview);
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "OPTIONS") {
      sendJson(res, 204, {});
      return;
    }

    if (req.method === "GET" && req.url === "/api/health") {
      await handleHealth(req, res);
      return;
    }

    if (req.method === "GET" && req.url.startsWith("/api/activity-logs")) {
      await handleActivityLogs(req, res);
      return;
    }

    if (req.method === "GET" && req.url === "/api/system/overview") {
      await handleSystemOverview(req, res);
      return;
    }

    if (req.method === "GET" && req.url === "/api/sessions") {
      await handleSessions(req, res);
      return;
    }

    if (req.method === "GET" && req.url === "/api/agents") {
      await handleAgents(req, res);
      return;
    }

    if (req.method === "GET" && req.url.startsWith("/api/history")) {
      await handleHistory(req, res);
      return;
    }

    if (req.method === "POST" && req.url === "/api/session") {
      await handleCreateSession(req, res);
      return;
    }

    if (req.method === "POST" && req.url === "/api/agents/dispatch") {
      await handleDispatchAgent(req, res);
      return;
    }

    if (req.method === "POST" && req.url === "/api/chat") {
      await handleChat(req, res);
      return;
    }

    if (req.method === "GET" && serveStaticApp(req, res)) {
      return;
    }

    sendJson(res, 404, { error: "Not found" });
  } catch (error) {
    createActivityLog({
      source: "route",
      action: `${req.method} ${req.url}`,
      status: "error",
      detail: error.name === "AbortError" ? "请求 OpenClaw 超时" : error.message,
    });

    sendJson(res, 500, {
      error: error.name === "AbortError" ? "请求 OpenClaw 超时" : error.message,
    });
  }
});

createActivityLog({
  source: "system",
  action: "server.start",
  status: "ok",
  detail: `ClawLink console server listening on http://localhost:${port}`,
});

server.listen(port, () => {
  console.log(`ClawLink console server listening on http://localhost:${port}`);
});
