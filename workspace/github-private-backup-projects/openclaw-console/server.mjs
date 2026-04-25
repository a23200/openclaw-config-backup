import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import http from "node:http";
import { homedir } from "node:os";
import path from "node:path";
import tls from "node:tls";
import { r as callGatewayRuntime } from "file:///opt/homebrew/lib/node_modules/openclaw/dist/call-BjnDacVz.js";
import { f as GatewayClient } from "file:///opt/homebrew/lib/node_modules/openclaw/dist/method-scopes-5jCaY0oV.js";
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
const gatewayStreamTimeoutMs = Number(process.env.OPENCLAW_GATEWAY_STREAM_TIMEOUT_MS || 120000);
const gatewayStreamHeartbeatMs = Number(process.env.OPENCLAW_GATEWAY_STREAM_HEARTBEAT_MS || 15000);
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

function sendEventStreamHeaders(res) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  });
  res.flushHeaders?.();
}

function writeEventStreamComment(res, comment = "heartbeat") {
  if (res.destroyed || res.writableEnded) return false;
  res.write(`: ${comment}\n\n`);
  return true;
}

function writeEventStreamEvent(res, event, payload = {}) {
  if (res.destroyed || res.writableEnded) return false;
  const data = JSON.stringify(payload)
    .split("\n")
    .map((line) => `data: ${line}`)
    .join("\n");
  res.write(`event: ${event}\n${data}\n\n`);
  return true;
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
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(urlPath || "/");
  } catch {
    return "";
  }
  if (decodedPath.includes("\0")) return "";
  const normalizedUrlPath = decodedPath === "/" ? "/index.html" : decodedPath;
  const filePath = path.resolve(distDir, `.${normalizedUrlPath}`);
  const distRoot = `${distDir}${path.sep}`;

  if (filePath !== distDir && !filePath.startsWith(distRoot)) {
    return "";
  }

  try {
    const realPath = fs.realpathSync(filePath);
    const realDistRoot = `${fs.realpathSync(distDir)}${path.sep}`;
    if (realPath !== fs.realpathSync(distDir) && !realPath.startsWith(realDistRoot)) {
      return "";
    }
    return realPath;
  } catch {
    return filePath;
  }
}

function serveCloneArchive(req, res) {
  let decoded;
  try {
    decoded = decodeURIComponent(new URL(req.url, `http://${req.headers.host}`).pathname);
  } catch {
    return false;
  }
  if (!decoded.startsWith("/clones/") || decoded.includes("\0") || decoded.includes("..")) return false;
  const rel = decoded.replace(/^\/clones\//, "");
  const abs = path.resolve(WEBSITE_ENGINEER_CLONE_DIR, rel);
  const root = `${WEBSITE_ENGINEER_CLONE_DIR}${path.sep}`;
  if (abs !== WEBSITE_ENGINEER_CLONE_DIR && !abs.startsWith(root)) return false;
  try {
    const stat = fs.statSync(abs);
    if (!stat.isFile()) return false;
    sendStatic(res, 200, fs.readFileSync(abs), staticContentType(abs), { "Cache-Control": "no-cache" });
    return true;
  } catch {
    return false;
  }
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

function createOpenClawGatewayClient(handlers = {}) {
  const settings = resolveGatewaySettings();

  if (!settings.hasGatewayAuth) {
    throw new Error(`缺少 OpenClaw Gateway token/password，未能从 ${openClawConfigPath} 或环境变量读取。`);
  }

  const client = new GatewayClient({
    url: settings.gatewayWsUrl,
    token: settings.token || undefined,
    password: !settings.token ? settings.password || undefined : undefined,
    instanceId: randomUUID(),
    clientDisplayName: "ClawLink Console",
    role: "operator",
    onHelloOk: handlers.onHelloOk,
    onEvent: handlers.onEvent,
    onClose: handlers.onClose,
    onConnectError: handlers.onConnectError,
  });

  return { client, settings };
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

const MAX_BODY_BYTES = 1024 * 1024; // 1 MB

async function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let bytes = 0;
    let aborted = false;
    req.on("data", (chunk) => {
      if (aborted) return;
      bytes += chunk.length;
      if (bytes > MAX_BODY_BYTES) {
        aborted = true;
        req.destroy();
        const err = new Error("request body too large");
        err.code = "PAYLOAD_TOO_LARGE";
        reject(err);
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (aborted) return;
      try {
        const body = Buffer.concat(chunks).toString("utf8");
        resolve(JSON.parse(body || "{}"));
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", (err) => {
      if (aborted) return;
      reject(err);
    });
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

const PROJECT_REGISTRY = [
  {
    id: "make-ppt",
    url: "http://127.0.0.1:4321",
    launch: {
      cwd: "/Users/mac/Desktop/项目总表/make-ppt",
      command: "node",
      args: ["scripts/app-factory-preview.cjs"],
      env: { APP_FACTORY_PORT: "4321" },
    },
  },
  {
    id: "ai-app",
    url: "http://localhost:5112",
    launch: {
      cwd: "/Users/mac/Desktop/Ai-app",
      command: "npm",
      args: ["run", "dev"],
      env: { PORT: "5237" },
    },
  },
  {
    id: "jimeng-ui",
    url: "http://127.0.0.1:8000",
    launch: {
      cwd: "/Users/mac/Desktop/项目总表/jimeng-ui",
      command: "/Users/mac/Desktop/项目总表/jimeng-ui/.venv/bin/uvicorn",
      args: ["ui.jimeng_ui_app:app", "--host", "127.0.0.1", "--port", "8000"],
    },
  },
  {
    id: "website-engineer",
    url: `http://127.0.0.1:${port}/website-engineer/index.html`,
  },
  {
    id: "douyin-crawler",
    url: "http://127.0.0.1:8001",
    launch: {
      cwd: "/Users/mac/Desktop/抖音爬虫",
      command: "/Users/mac/Desktop/抖音爬虫/.venv/bin/uvicorn",
      args: ["app.main:app", "--host", "127.0.0.1", "--port", "8001"],
    },
  },
  {
    id: "xianyu",
    url: "http://127.0.0.1:18444",
    launch: {
      cwd: "/Users/mac/.openclaw/workspace/xianyu-openclaw-channel",
      command: "/Users/mac/.openclaw/workspace/xianyu-openclaw-channel/.venv/bin/python",
      args: ["Start.py"],
      env: { API_PORT: "18444", SERVER_PORT: "18444" },
    },
  },
  {
    id: "novelist",
    url: "http://127.0.0.1:8005",
    launch: {
      cwd: "/Users/mac/Desktop/PlotPilot",
      command: "/Users/mac/Desktop/PlotPilot/.venv/bin/uvicorn",
      args: ["interfaces.main:app", "--host", "127.0.0.1", "--port", "8005"],
    },
  },
];

const CLAWLINK_LOG_DIR = path.join(homedir(), ".clawlink", "logs");
const PROJECT_LAUNCH_PATH_PREFIX = "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin";

const PROJECT_PROBE_TIMEOUT_MS = 1500;
const PROJECT_AUTO_START_ENABLED = process.env.CLAWLINK_PROJECT_AUTO_START !== "0";
const PROJECT_AUTO_START_INTERVAL_MS = Number(process.env.CLAWLINK_PROJECT_AUTO_START_INTERVAL_MS || 60000);
const projectLaunchState = new Map();

async function probeProjectUrl(url) {
  if (!url) {
    return { reachable: false, latencyMs: null, statusCode: null, error: "no_url" };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROJECT_PROBE_TIMEOUT_MS);
  const startedAt = Date.now();

  try {
    const response = await fetch(url, { method: "GET", signal: controller.signal });
    return {
      reachable: response.status < 500,
      latencyMs: Date.now() - startedAt,
      statusCode: response.status,
      error: "",
    };
  } catch (error) {
    return {
      reachable: false,
      latencyMs: null,
      statusCode: null,
      error: error.name === "AbortError" ? "timeout" : error.code || error.message || "error",
    };
  } finally {
    clearTimeout(timer);
  }
}

const WEBSITE_ENGINEER_FETCH_TIMEOUT_MS = 15000;
const WEBSITE_ENGINEER_MAX_HTML_CHARS = 400000;
const WEBSITE_ENGINEER_MAX_ASSETS = 80;
const WEBSITE_ENGINEER_MAX_ASSET_BYTES = 4 * 1024 * 1024; // 单个资源上限 4MB
const WEBSITE_ENGINEER_ASSET_CONCURRENCY = 6;
const WEBSITE_ENGINEER_CLONE_DIR = path.resolve(process.cwd(), "public", "clones");
const WEBSITE_ENGINEER_AGENT_WORK_DIR = path.resolve(
  process.cwd(),
  "public",
  "clones",
  "agent-work",
);
const WEBSITE_ENGINEER_USER_AGENT =
  "ClawLink-Website-Engineer/0.2 (+local mirror; respects robots heuristics)";
const WEBSITE_ENGINEER_HEADER_ALLOWLIST = [
  "content-type",
  "content-security-policy",
  "x-frame-options",
  "x-content-type-options",
  "referrer-policy",
  "permissions-policy",
  "strict-transport-security",
  "server",
  "x-powered-by",
  "set-cookie",
  "access-control-allow-origin",
  "access-control-allow-credentials",
  "cross-origin-opener-policy",
  "cross-origin-embedder-policy",
  "cross-origin-resource-policy",
];

const WEBSITE_ENGINEER_SENSITIVE_PATHS = [
  { path: "/.git/HEAD", level: "high", title: ".git 目录疑似暴露" },
  { path: "/.env", level: "high", title: ".env 配置文件疑似暴露" },
  { path: "/.DS_Store", level: "medium", title: ".DS_Store 泄露目录结构" },
  { path: "/server-status", level: "medium", title: "Apache server-status 暴露" },
  { path: "/phpinfo.php", level: "high", title: "phpinfo 页面暴露" },
  { path: "/wp-config.php.bak", level: "high", title: "WordPress 配置备份暴露" },
  { path: "/.htaccess", level: "medium", title: ".htaccess 文件可访问" },
  { path: "/admin/", level: "low", title: "/admin/ 路径返回 200" },
];

function normalizeWebsiteEngineerUrl(rawValue) {
  const value = typeof rawValue === "string" ? rawValue.trim() : "";
  if (!value) throw new Error("请先输入目标网址。");

  const candidate = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  const url = new URL(candidate);
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("只支持 http/https 网站。");
  }
  return url.toString();
}

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeHtmlAttr(value = "") {
  return escapeHtml(value).replace(/`/g, "&#96;");
}

function stripScripts(html = "") {
  return html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gis, "");
}

function extractHtmlTitle(html = "") {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!match) return "";
  return shorten(match[1].replace(/\s+/g, " ").trim(), 120);
}

function buildPreviewHtml(html = "", finalUrl = "") {
  // 兼容旧调用: 返回一份带 <base> + 横幅、移除脚本的内嵌 HTML
  const sanitized = stripScripts(html);
  const baseTag = `<base href="${escapeHtmlAttr(finalUrl)}">`;
  const banner = `
    <style>
      .clawlink-clone-banner {
        position: sticky;
        top: 0;
        z-index: 2147483647;
        padding: 8px 12px;
        background: #0f172a;
        color: #e2e8f0;
        font: 12px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
        border-bottom: 1px solid rgba(148,163,184,.25);
      }
      .clawlink-clone-banner strong { color: #7dd3fc; }
    </style>
    <div class="clawlink-clone-banner"><strong>ClawLink 复刻预览</strong> · 已移除脚本，仅用于结构与样式对照</div>
  `;

  if (/<head[^>]*>/i.test(sanitized)) {
    return sanitized.replace(/<head([^>]*)>/i, `<head$1>${baseTag}${banner}`);
  }

  return `<!DOCTYPE html><html><head>${baseTag}${banner}</head><body>${sanitized}</body></html>`;
}

function slugifyHost(host) {
  const base = String(host || "site").toLowerCase().replace(/[^a-z0-9.-]+/g, "-").replace(/^-+|-+$/g, "");
  return base || "site";
}

function guessExtFromContentType(contentType = "") {
  const ct = String(contentType || "").toLowerCase();
  if (ct.includes("text/css")) return ".css";
  if (ct.includes("javascript")) return ".js";
  if (ct.includes("application/json")) return ".json";
  if (ct.includes("image/png")) return ".png";
  if (ct.includes("image/jpeg")) return ".jpg";
  if (ct.includes("image/webp")) return ".webp";
  if (ct.includes("image/gif")) return ".gif";
  if (ct.includes("image/svg")) return ".svg";
  if (ct.includes("image/x-icon") || ct.includes("image/vnd.microsoft.icon")) return ".ico";
  if (ct.includes("font/woff2")) return ".woff2";
  if (ct.includes("font/woff")) return ".woff";
  if (ct.includes("font/ttf") || ct.includes("application/x-font-ttf")) return ".ttf";
  if (ct.includes("font/otf")) return ".otf";
  if (ct.includes("text/html")) return ".html";
  return "";
}

function extractAssetRefs(html = "") {
  // 返回 [{kind, attr, original, raw}]
  const refs = [];
  const push = (kind, attr, original, raw) => {
    if (!original) return;
    if (/^(data:|javascript:|mailto:|tel:|#)/i.test(original)) return;
    refs.push({ kind, attr, original, raw });
  };

  // <link href>
  for (const m of html.matchAll(/<link\b[^>]*>/gi)) {
    const tag = m[0];
    const hrefMatch = tag.match(/\bhref\s*=\s*(["'])([^"']+)\1/i);
    if (!hrefMatch) continue;
    const relMatch = tag.match(/\brel\s*=\s*(["'])([^"']+)\1/i);
    const rel = relMatch ? relMatch[2].toLowerCase() : "";
    if (/(stylesheet|icon|preload|manifest)/.test(rel) || rel === "") {
      const kind = rel.includes("stylesheet") ? "css" : rel.includes("icon") ? "icon" : "link";
      push(kind, "href", hrefMatch[2], tag);
    }
  }

  // <script src>
  for (const m of html.matchAll(/<script\b[^>]*\bsrc\s*=\s*(["'])([^"']+)\1[^>]*>/gi)) {
    push("js", "src", m[2], m[0]);
  }

  // <img src>
  for (const m of html.matchAll(/<img\b[^>]*\bsrc\s*=\s*(["'])([^"']+)\1[^>]*>/gi)) {
    push("img", "src", m[2], m[0]);
  }

  // <source src> / <video src> / <audio src>
  for (const m of html.matchAll(/<(source|video|audio)\b[^>]*\bsrc\s*=\s*(["'])([^"']+)\2[^>]*>/gi)) {
    push("media", "src", m[3], m[0]);
  }

  return refs;
}

async function fetchWithLimits(url, { timeoutMs = WEBSITE_ENGINEER_FETCH_TIMEOUT_MS, headers = {}, method = "GET" } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method,
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": WEBSITE_ENGINEER_USER_AGENT,
        Accept: "*/*",
        ...headers,
      },
    });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchAssetToBuffer(url) {
  const res = await fetchWithLimits(url, { timeoutMs: WEBSITE_ENGINEER_FETCH_TIMEOUT_MS });
  const len = Number(res.headers.get("content-length") || 0);
  if (len && len > WEBSITE_ENGINEER_MAX_ASSET_BYTES) {
    throw new Error(`资源 ${len} 字节超过 ${WEBSITE_ENGINEER_MAX_ASSET_BYTES} 字节上限`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.byteLength > WEBSITE_ENGINEER_MAX_ASSET_BYTES) {
    throw new Error(`资源实际体积超过上限`);
  }
  return {
    buffer: buf,
    statusCode: res.status,
    contentType: res.headers.get("content-type") || "",
    finalUrl: res.url || url,
  };
}

async function mapWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  const runners = new Array(Math.min(limit, items.length)).fill(0).map(async () => {
    while (true) {
      const idx = cursor;
      cursor += 1;
      if (idx >= items.length) return;
      try {
        results[idx] = await worker(items[idx], idx);
      } catch (error) {
        results[idx] = { error: error.message || String(error) };
      }
    }
  });
  await Promise.all(runners);
  return results;
}

async function mirrorWebsitePage(targetUrl) {
  const mainRes = await fetchWithLimits(targetUrl, {
    headers: { Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" },
  });
  const html = await mainRes.text();
  const finalUrl = mainRes.url || targetUrl;
  const finalUrlObj = new URL(finalUrl);
  const headers = {};
  WEBSITE_ENGINEER_HEADER_ALLOWLIST.forEach((key) => {
    const value = mainRes.headers.get(key);
    if (value) headers[key] = value;
  });
  const setCookies = mainRes.headers.getSetCookie?.() || [];

  const slug = `${slugifyHost(finalUrlObj.host)}-${Date.now().toString(36)}`;
  const rootDir = path.join(WEBSITE_ENGINEER_CLONE_DIR, slug);
  const assetsDir = path.join(rootDir, "assets");
  await fsp.mkdir(assetsDir, { recursive: true });

  const refs = extractAssetRefs(html).slice(0, WEBSITE_ENGINEER_MAX_ASSETS);
  const dedup = new Map(); // absoluteUrl -> localPath
  const manifest = [];

  const resolved = refs.map((ref) => {
    try {
      const abs = new URL(ref.original, finalUrl).toString();
      return { ...ref, absoluteUrl: abs };
    } catch {
      return { ...ref, absoluteUrl: "" };
    }
  }).filter((r) => r.absoluteUrl);

  await mapWithConcurrency(resolved, WEBSITE_ENGINEER_ASSET_CONCURRENCY, async (ref) => {
    if (dedup.has(ref.absoluteUrl)) return;
    try {
      const { buffer, contentType, statusCode } = await fetchAssetToBuffer(ref.absoluteUrl);
      const hash = createHash("sha1").update(ref.absoluteUrl).digest("hex").slice(0, 10);
      let ext = path.extname(new URL(ref.absoluteUrl).pathname).split("?")[0];
      if (!ext || ext.length > 6) ext = guessExtFromContentType(contentType);
      if (!ext) ext = ref.kind === "css" ? ".css" : ref.kind === "js" ? ".js" : "";
      const fileName = `${hash}${ext}`;
      const localAbsPath = path.join(assetsDir, fileName);
      await fsp.writeFile(localAbsPath, buffer);
      const localPath = `assets/${fileName}`;
      dedup.set(ref.absoluteUrl, localPath);
      manifest.push({
        kind: ref.kind,
        url: ref.absoluteUrl,
        statusCode,
        bytes: buffer.byteLength,
        contentType,
        localPath,
      });
    } catch (error) {
      manifest.push({
        kind: ref.kind,
        url: ref.absoluteUrl,
        error: error.message || String(error),
      });
    }
  });

  // 用本地路径改写 HTML。只替换与引用完全匹配的 href/src
  let rewritten = html;
  for (const ref of resolved) {
    const local = dedup.get(ref.absoluteUrl);
    if (!local) continue;
    const pattern = new RegExp(
      `(\\b${ref.attr}\\s*=\\s*["'])${escapeRegExp(ref.original)}(["'])`,
      "g",
    );
    rewritten = rewritten.replace(pattern, `$1${local}$2`);
  }

  // 注入 <base> 指向原站点,便于未被替换的相对链接仍能定位远程;同时加横幅
  const banner = `<div class="clawlink-clone-banner" style="position:sticky;top:0;z-index:2147483647;padding:8px 12px;background:#0f172a;color:#e2e8f0;font:12px/1.4 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;border-bottom:1px solid rgba(148,163,184,.25)"><strong style="color:#7dd3fc">ClawLink 本地副本</strong> · 来源 ${escapeHtml(finalUrl)} · 仅供结构与样式对照</div>`;
  const baseTag = `<base href="${escapeHtmlAttr(finalUrl)}">`;
  if (/<head[^>]*>/i.test(rewritten)) {
    rewritten = rewritten.replace(/<head([^>]*)>/i, `<head$1>${baseTag}`);
  } else {
    rewritten = `<!DOCTYPE html><html><head>${baseTag}</head><body>${rewritten}</body></html>`;
  }
  if (/<body[^>]*>/i.test(rewritten)) {
    rewritten = rewritten.replace(/<body([^>]*)>/i, `<body$1>${banner}`);
  }

  const indexPath = path.join(rootDir, "index.html");
  await fsp.writeFile(indexPath, rewritten);
  const manifestPath = path.join(rootDir, "manifest.json");
  const totalBytes = manifest.reduce((acc, item) => acc + (item.bytes || 0), 0);
  const manifestData = {
    targetUrl,
    finalUrl,
    statusCode: mainRes.status,
    createdAt: new Date().toISOString(),
    htmlBytes: Buffer.byteLength(rewritten, "utf8"),
    assetCount: manifest.length,
    okCount: manifest.filter((m) => !m.error).length,
    totalAssetBytes: totalBytes,
    manifest,
  };
  await fsp.writeFile(manifestPath, JSON.stringify(manifestData, null, 2));

  return {
    statusCode: mainRes.status,
    finalUrl,
    title: extractHtmlTitle(html) || "",
    html,
    headers,
    setCookies,
    archive: {
      slug,
      rootPath: rootDir,
      indexPath,
      url: `/clones/${slug}/index.html`,
      downloadUrl: `/clones/${slug}/manifest.json`,
      assetCount: manifest.length,
      okCount: manifestData.okCount,
      htmlBytes: manifestData.htmlBytes,
      totalAssetBytes: totalBytes,
    },
    manifest,
  };
}

function escapeRegExp(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function probeTlsCert(hostname, port = 443, timeoutMs = 5000) {
  return await new Promise((resolve) => {
    let done = false;
    const finish = (payload) => {
      if (done) return;
      done = true;
      try { socket.end(); } catch { /* ignore */ }
      resolve(payload);
    };
    const socket = tls.connect({ host: hostname, port, servername: hostname, rejectUnauthorized: false, timeout: timeoutMs }, () => {
      const cert = socket.getPeerCertificate(true);
      const protocol = socket.getProtocol?.() || "";
      finish({
        ok: true,
        authorized: socket.authorized,
        authorizationError: socket.authorizationError?.message || String(socket.authorizationError || ""),
        protocol,
        cert: cert ? {
          subject: cert.subject,
          issuer: cert.issuer,
          valid_from: cert.valid_from,
          valid_to: cert.valid_to,
          fingerprint: cert.fingerprint,
          subjectaltname: cert.subjectaltname,
        } : null,
      });
    });
    socket.setTimeout(timeoutMs, () => finish({ ok: false, error: "TLS 连接超时" }));
    socket.on("error", (error) => finish({ ok: false, error: error.message || String(error) }));
  });
}

async function probePath(origin, relPath) {
  const url = new URL(relPath, origin).toString();
  try {
    const res = await fetchWithLimits(url, { method: "GET", timeoutMs: 5000, headers: { Accept: "*/*" } });
    const preview = res.status < 400 ? (await res.text()).slice(0, 256) : "";
    return { url, statusCode: res.status, contentType: res.headers.get("content-type") || "", preview };
  } catch (error) {
    return { url, error: error.message || String(error) };
  }
}

async function probeCors(origin, probeOrigin = "https://clawlink-probe.invalid") {
  try {
    const res = await fetchWithLimits(origin, {
      method: "GET",
      timeoutMs: 5000,
      headers: { Origin: probeOrigin },
    });
    return {
      sentOrigin: probeOrigin,
      allowOrigin: res.headers.get("access-control-allow-origin") || "",
      allowCredentials: res.headers.get("access-control-allow-credentials") || "",
      vary: res.headers.get("vary") || "",
    };
  } catch (error) {
    return { error: error.message || String(error) };
  }
}

function parseSetCookieFlags(setCookies = []) {
  return setCookies.map((raw) => {
    const head = raw.split(";")[0] || "";
    const name = head.split("=")[0]?.trim() || "";
    const lower = raw.toLowerCase();
    return {
      name,
      secure: /;\s*secure/i.test(raw),
      httpOnly: /;\s*httponly/i.test(raw),
      sameSite: /;\s*samesite\s*=\s*([a-z]+)/i.exec(raw)?.[1]?.toLowerCase() || "",
      raw: raw.length > 240 ? `${raw.slice(0, 240)}…` : raw,
      lower,
    };
  });
}

async function runActiveProbes({ finalUrl, headers, setCookies, html }) {
  const origin = new URL(finalUrl).origin;
  const urlObj = new URL(finalUrl);
  const isHttps = urlObj.protocol === "https:";

  const [tlsInfo, robots, sitemap, cors, ...pathProbes] = await Promise.all([
    isHttps ? probeTlsCert(urlObj.hostname).catch((e) => ({ ok: false, error: e.message })) : Promise.resolve(null),
    probePath(origin, "/robots.txt"),
    probePath(origin, "/sitemap.xml"),
    probeCors(origin),
    ...WEBSITE_ENGINEER_SENSITIVE_PATHS.map((entry) => probePath(origin, entry.path)),
  ]);

  const findings = [];
  const addFinding = (level, title, detail) => findings.push({ level, title, detail });

  // TLS
  if (isHttps && tlsInfo) {
    if (!tlsInfo.ok) {
      addFinding("medium", "TLS 握手异常", tlsInfo.error || "无法建立 TLS 连接");
    } else {
      if (!tlsInfo.authorized) {
        addFinding("high", "TLS 证书校验失败", tlsInfo.authorizationError || "证书未通过标准校验");
      }
      if (tlsInfo.cert?.valid_to) {
        const daysLeft = Math.round((new Date(tlsInfo.cert.valid_to).getTime() - Date.now()) / 86400000);
        if (Number.isFinite(daysLeft) && daysLeft < 14) {
          addFinding("high", "TLS 证书即将过期", `剩余 ${daysLeft} 天 (到期 ${tlsInfo.cert.valid_to})`);
        } else if (Number.isFinite(daysLeft) && daysLeft < 30) {
          addFinding("medium", "TLS 证书将于 30 天内过期", `剩余 ${daysLeft} 天 (到期 ${tlsInfo.cert.valid_to})`);
        }
      }
      if (tlsInfo.protocol && /TLSv1(\.0|\.1)?$/.test(tlsInfo.protocol)) {
        addFinding("medium", "协商到弱版本 TLS", `协商协议 ${tlsInfo.protocol}`);
      }
    }
  }

  // robots / sitemap
  if (robots.statusCode && robots.statusCode < 400 && /Disallow\s*:\s*\/[^\s]+/i.test(robots.preview || "")) {
    addFinding(
      "info",
      "robots.txt 暴露后台路径提示",
      `发现 Disallow 条目 (${robots.url}); 爬虫和渗透工具常据此枚举未公开区域。`,
    );
  }
  if (sitemap.statusCode && sitemap.statusCode < 400) {
    addFinding("info", "sitemap.xml 可公开访问", `${sitemap.url} 可读,可能用于路径枚举。`);
  }

  // 敏感路径
  WEBSITE_ENGINEER_SENSITIVE_PATHS.forEach((entry, idx) => {
    const result = pathProbes[idx];
    if (!result || result.error) return;
    if (result.statusCode && result.statusCode >= 200 && result.statusCode < 400) {
      addFinding(entry.level, entry.title, `${result.url} 返回 HTTP ${result.statusCode}`);
    }
  });

  // CORS
  if (cors.allowOrigin) {
    if (cors.allowOrigin === "*") {
      addFinding(
        cors.allowCredentials.toLowerCase() === "true" ? "high" : "low",
        "CORS 通配放行 (*)",
        `Access-Control-Allow-Origin: *; credentials: ${cors.allowCredentials || "(未声明)"}`,
      );
    } else if (cors.allowOrigin === cors.sentOrigin) {
      addFinding(
        cors.allowCredentials.toLowerCase() === "true" ? "high" : "medium",
        "CORS 反射任意 Origin",
        `探测 Origin=${cors.sentOrigin} 被直接回显为 Allow-Origin。`,
      );
    }
  }

  // Cookie flags
  const cookies = parseSetCookieFlags(setCookies);
  cookies.forEach((cookie) => {
    if (!cookie.name) return;
    const issues = [];
    if (isHttps && !cookie.secure) issues.push("缺少 Secure");
    if (!cookie.httpOnly) issues.push("缺少 HttpOnly");
    if (!cookie.sameSite) issues.push("未声明 SameSite");
    if (issues.length) {
      addFinding("medium", `Cookie "${cookie.name}" 标志位不足`, issues.join("; "));
    }
  });

  // Banner 披露
  const banner = [headers["server"], headers["x-powered-by"]].filter(Boolean);
  if (banner.length) {
    addFinding("low", "服务端 banner 披露版本信息", banner.join(" · "));
  }

  // Mixed content
  if (isHttps) {
    const mixed = Array.from((html || "").matchAll(/\b(src|href)\s*=\s*["']http:\/\/[^"']+["']/gi));
    if (mixed.length) {
      addFinding("medium", "HTTPS 页面混合加载 HTTP 资源", `发现 ${mixed.length} 处 http:// 引用,浏览器可能拦截或降级。`);
    }
  }

  return {
    findings,
    probes: {
      tls: tlsInfo,
      robots: { url: robots.url, statusCode: robots.statusCode, bytes: (robots.preview || "").length },
      sitemap: { url: sitemap.url, statusCode: sitemap.statusCode },
      cors,
      sensitivePaths: WEBSITE_ENGINEER_SENSITIVE_PATHS.map((entry, idx) => ({
        path: entry.path,
        statusCode: pathProbes[idx]?.statusCode,
        error: pathProbes[idx]?.error,
      })),
      cookies: cookies.map(({ lower, raw, ...rest }) => ({ ...rest, raw })),
    },
  };
}

function countMatches(pattern, source = "") {
  const matches = source.match(pattern);
  return matches ? matches.length : 0;
}

async function fetchWebsiteEngineerTarget(targetUrl) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WEBSITE_ENGINEER_FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(targetUrl, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": "ClawLink-Website-Engineer/0.1",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });

    const rawHtml = await response.text();
    const html =
      rawHtml.length > WEBSITE_ENGINEER_MAX_HTML_CHARS
        ? rawHtml.slice(0, WEBSITE_ENGINEER_MAX_HTML_CHARS)
        : rawHtml;
    const headers = {};
    WEBSITE_ENGINEER_HEADER_ALLOWLIST.forEach((key) => {
      const value = response.headers.get(key);
      if (value) headers[key] = value;
    });
    const setCookies = response.headers.getSetCookie?.() || [];

    return {
      statusCode: response.status,
      finalUrl: response.url || targetUrl,
      html,
      headers,
      setCookies,
    };
  } finally {
    clearTimeout(timer);
  }
}

function buildWebsiteFindings(targetUrl, finalUrl, headers, html) {
  const findings = [];
  const target = new URL(finalUrl || targetUrl);
  const htmlText = typeof html === "string" ? html : "";
  const hasHeader = (name) => Boolean(headers?.[name]);

  const addFinding = (level, title, detail) => {
    findings.push({ level, title, detail });
  };

  if (target.protocol !== "https:") {
    addFinding("high", "站点未使用 HTTPS", "目标站点仍通过 HTTP 提供内容，传输链路存在被窃听或篡改风险。");
  }

  if (!hasHeader("content-security-policy")) {
    addFinding("medium", "缺少 CSP", "未检测到 Content-Security-Policy，浏览器侧脚本注入防护较弱。");
  }

  if (!hasHeader("x-frame-options")) {
    addFinding("medium", "缺少 X-Frame-Options", "站点可能面临点击劫持风险。");
  }

  if (!hasHeader("x-content-type-options")) {
    addFinding("medium", "缺少 X-Content-Type-Options", "浏览器可能进行 MIME 嗅探，增加资源解释风险。");
  }

  if (!hasHeader("referrer-policy")) {
    addFinding("low", "缺少 Referrer-Policy", "来源页信息可能在跨站请求中泄露。");
  }

  if (!hasHeader("permissions-policy")) {
    addFinding("low", "缺少 Permissions-Policy", "未显式限制摄像头、麦克风等浏览器能力。");
  }

  if (target.protocol === "https:" && !hasHeader("strict-transport-security")) {
    addFinding("medium", "缺少 HSTS", "已使用 HTTPS，但未声明 Strict-Transport-Security。");
  }

  if (/type=["']password["']/i.test(htmlText) && target.protocol !== "https:") {
    addFinding("high", "HTTP 页面存在密码输入框", "检测到密码输入元素，但站点不是 HTTPS。");
  }

  const blankLinksWithoutRel = Array.from(
    htmlText.matchAll(/<a\b[^>]*target=["']_blank["'][^>]*>/gi),
  ).filter((match) => !/rel=["'][^"']*(noopener|noreferrer)/i.test(match[0]));
  if (blankLinksWithoutRel.length) {
    addFinding("medium", "新窗口链接缺少 rel 防护", `发现 ${blankLinksWithoutRel.length} 个 target=\"_blank\" 链接未带 noopener/noreferrer。`);
  }

  if (!findings.length) {
    addFinding("info", "未发现明显基础项问题", "本次为被动巡检，仅检查响应头与页面静态结构。");
  }

  return {
    summary: {
      total: findings.length,
      high: findings.filter((item) => item.level === "high").length,
      medium: findings.filter((item) => item.level === "medium").length,
      low: findings.filter((item) => item.level === "low").length,
      info: findings.filter((item) => item.level === "info").length,
    },
    metrics: {
      forms: countMatches(/<form\b/gi, htmlText),
      inlineScripts: countMatches(/<script\b(?![^>]*src=)/gi, htmlText),
      externalScripts: countMatches(/<script\b[^>]*src=/gi, htmlText),
      externalStylesheets: countMatches(/<link\b[^>]*rel=["']stylesheet["']/gi, htmlText),
      blankTargetLinks: blankLinksWithoutRel.length,
    },
    findings,
  };
}

async function handleWebsiteEngineerClone(req, res) {
  const body = await readJsonBody(req);
  const targetUrl = normalizeWebsiteEngineerUrl(body.url);
  const result = await mirrorWebsitePage(targetUrl);
  const previewHtml = buildPreviewHtml(result.html, result.finalUrl);

  createActivityLog({
    source: "website-engineer",
    action: "POST /api/website-engineer/clone",
    status: "ok",
    detail: `${shorten(targetUrl, 120)} · HTTP ${result.statusCode} · ${result.archive.okCount}/${result.archive.assetCount} assets`,
  });

  sendJson(res, 200, {
    ok: true,
    targetUrl,
    finalUrl: result.finalUrl,
    title: result.title || "未提取到标题",
    statusCode: result.statusCode,
    previewHtml,
    headers: result.headers,
    archive: result.archive,
    manifest: result.manifest,
    metrics: {
      forms: countMatches(/<form\b/gi, result.html),
      images: countMatches(/<img\b/gi, result.html),
      links: countMatches(/<a\b/gi, result.html),
      externalStylesheets: countMatches(/<link\b[^>]*rel=["']stylesheet["']/gi, result.html),
      savedAssets: result.archive.okCount,
      totalAssetBytes: result.archive.totalAssetBytes,
    },
  });
}

async function handleWebsiteEngineerScan(req, res) {
  const body = await readJsonBody(req);
  const targetUrl = normalizeWebsiteEngineerUrl(body.url);
  const fetched = await fetchWebsiteEngineerTarget(targetUrl);
  const passive = buildWebsiteFindings(targetUrl, fetched.finalUrl, fetched.headers, fetched.html);
  const active = await runActiveProbes({
    finalUrl: fetched.finalUrl,
    headers: fetched.headers,
    setCookies: fetched.setCookies,
    html: fetched.html,
  });

  const merged = [...passive.findings.filter((f) => f.level !== "info"), ...active.findings];
  if (!merged.length) {
    merged.push({
      level: "info",
      title: "未发现明显基础项问题",
      detail: "本次已做被动检查 + 温和主动探测 (TLS / robots / 敏感路径 / CORS / Cookie / Banner)。",
    });
  }

  const summary = {
    total: merged.length,
    high: merged.filter((item) => item.level === "high").length,
    medium: merged.filter((item) => item.level === "medium").length,
    low: merged.filter((item) => item.level === "low").length,
    info: merged.filter((item) => item.level === "info").length,
  };

  createActivityLog({
    source: "website-engineer",
    action: "POST /api/website-engineer/scan",
    status: summary.high > 0 ? "warn" : "ok",
    detail: `${shorten(targetUrl, 120)} · 高危 ${summary.high} · 中危 ${summary.medium}`,
  });

  sendJson(res, 200, {
    ok: true,
    targetUrl,
    finalUrl: fetched.finalUrl,
    title: extractHtmlTitle(fetched.html) || "未提取到标题",
    statusCode: fetched.statusCode,
    headers: fetched.headers,
    summary,
    metrics: passive.metrics,
    findings: merged,
    probes: active.probes,
  });
}

function buildRedesignPrompt({ targetUrl, workspaceAbs, workspaceUrl }) {
  return [
    `【任务】帮我仿制下面这个网页的 UI 设计风格 (不是照搬源码,不要 mirror 资源)`,
    ``,
    `目标网址: ${targetUrl}`,
    `工作目录 (请把产物写到这里): ${workspaceAbs}`,
    `面板访问地址 (ClawLink 会从这里读取产物): ${workspaceUrl}`,
    ``,
    `请按这个节奏做:`,
    `1. 用浏览器打开目标网址,观察排版、配色、组件、布局、字体节奏。`,
    `2. 提炼它的设计语言: 主色 / 辅色 / 字体层级 / 间距韵律 / 组件风格。`,
    `3. 用 HTML + 内联 CSS (可以用 Tailwind CDN) 写一个风格相近、结构干净的新版本。`,
    `   - 保存到: ${workspaceAbs}/index.html`,
    `   - 截图保存到: ${workspaceAbs}/preview.png (如果方便的话)`,
    `4. 在 ${workspaceAbs}/design-notes.md 里写下你的设计决策和观察到的关键视觉特征。`,
    ``,
    `要求: 看起来像同一位设计师的风格,不要像素级照抄;不要抓他们的图片/CSS/JS;结构、命名、可读性都你自己做主。`,
  ].join("\n");
}

async function handleWebsiteEngineerAgentTask(req, res) {
  const body = await readJsonBody(req);
  const targetUrl = normalizeWebsiteEngineerUrl(body.url);
  const host = new URL(targetUrl).host;
  const slug = `${slugifyHost(host)}-${Date.now().toString(36)}`;
  const workspaceAbs = path.join(WEBSITE_ENGINEER_AGENT_WORK_DIR, slug);
  await fsp.mkdir(workspaceAbs, { recursive: true });

  const readmePath = path.join(workspaceAbs, "README.md");
  const readmeBody = [
    `# ClawLink 网站工程师 · Agent 工作台`,
    ``,
    `- 目标网址: ${targetUrl}`,
    `- 创建时间: ${new Date().toISOString()}`,
    ``,
    `Agent 应将仿制产物写入此目录:`,
    `- \`index.html\` (主页面)`,
    `- \`design-notes.md\` (设计决策)`,
    `- \`preview.png\` (可选,截图)`,
    ``,
    `ClawLink 右侧工作面板会自动列出此目录下的文件。`,
  ].join("\n");
  await fsp.writeFile(readmePath, readmeBody);

  const workspaceUrl = `/clones/agent-work/${slug}/`;
  const prompt = buildRedesignPrompt({ targetUrl, workspaceAbs, workspaceUrl });

  createActivityLog({
    source: "website-engineer",
    action: "POST /api/website-engineer/agent-task",
    status: "ok",
    detail: `${shorten(targetUrl, 100)} → ${slug}`,
  });

  sendJson(res, 200, {
    ok: true,
    slug,
    targetUrl,
    workspaceAbs,
    workspaceUrl,
    prompt,
  });
}

async function handleWebsiteEngineerWorkspace(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const slug = (url.searchParams.get("slug") || "").trim();
  if (!slug || /[^\w.-]/.test(slug)) {
    sendJson(res, 400, { error: "需要合法的 slug 参数" });
    return;
  }
  const abs = path.join(WEBSITE_ENGINEER_AGENT_WORK_DIR, slug);
  const root = `${WEBSITE_ENGINEER_AGENT_WORK_DIR}${path.sep}`;
  if (!abs.startsWith(root)) {
    sendJson(res, 400, { error: "非法 slug" });
    return;
  }
  try {
    const stat = await fsp.stat(abs);
    if (!stat.isDirectory()) {
      sendJson(res, 404, { error: "工作目录不存在" });
      return;
    }
  } catch {
    sendJson(res, 404, { error: "工作目录不存在" });
    return;
  }

  async function walk(dir, prefix = "") {
    const entries = await fsp.readdir(dir, { withFileTypes: true });
    const out = [];
    for (const entry of entries) {
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        const children = await walk(full, rel);
        out.push({ name: entry.name, path: rel, kind: "dir", children });
      } else if (entry.isFile()) {
        const s = await fsp.stat(full);
        out.push({
          name: entry.name,
          path: rel,
          kind: "file",
          size: s.size,
          mtime: s.mtimeMs,
          url: `/clones/agent-work/${slug}/${rel}`,
        });
      }
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  }

  const tree = await walk(abs);
  const flat = [];
  (function flatten(items) {
    for (const item of items) {
      if (item.kind === "file") flat.push(item);
      else if (item.children) flatten(item.children);
    }
  })(tree);

  const hasIndex = flat.some((f) => f.path === "index.html");
  sendJson(res, 200, {
    ok: true,
    slug,
    workspaceUrl: `/clones/agent-work/${slug}/`,
    indexUrl: hasIndex ? `/clones/agent-work/${slug}/index.html` : "",
    hasIndex,
    tree,
    files: flat,
  });
}

async function handleProjectsStatus(req, res) {
  const results = await Promise.all(
    PROJECT_REGISTRY.map(async (entry) => {
      const probe = await probeProjectUrl(entry.url);
      const launchState = projectLaunchState.get(entry.id);
      return {
        id: entry.id,
        url: entry.url,
        reachable: probe.reachable,
        latencyMs: probe.latencyMs,
        statusCode: probe.statusCode,
        error: probe.error,
        launchable: Boolean(entry.launch?.command),
        launching: Boolean(launchState?.running),
        lastLaunchAt: launchState?.startedAt || "",
        lastLaunchError: launchState?.error || "",
      };
    }),
  );
  sendJson(res, 200, { projects: results });
}

function isPidAlive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === "EPERM";
  }
}

async function handleProjectStart(req, res, projectId) {
  const entry = PROJECT_REGISTRY.find((item) => item.id === projectId);
  if (!entry) {
    sendJson(res, 404, { error: "未知项目" });
    return;
  }

  const result = await startProjectProcess(entry, { reason: "manual" });
  sendJson(res, result.status, result.payload);
}

async function startProjectProcess(entry, { reason = "manual", skipProbe = false } = {}) {
  if (!entry.launch?.command) {
    return { status: 400, payload: { error: "该项目未配置启动命令" } };
  }

  const existing = projectLaunchState.get(entry.id);
  if (existing?.running && isPidAlive(existing.pid)) {
    return {
      status: 409,
      payload: {
        error: "该项目已在启动中",
        pid: existing.pid,
        logPath: existing.logPath || "",
      },
    };
  }

  if (!skipProbe) {
    const probe = await probeProjectUrl(entry.url);
    if (probe.reachable) {
      return {
        status: 200,
        payload: {
          ok: true,
          id: entry.id,
          alreadyRunning: true,
          reachable: true,
          statusCode: probe.statusCode,
          latencyMs: probe.latencyMs,
        },
      };
    }
  }

  projectLaunchState.set(entry.id, {
    running: true,
    pid: null,
    startedAt: new Date().toISOString(),
    error: "",
    logPath: existing?.logPath || "",
  });

  let logStream = null;
  try {
    const cwdExists = fs.existsSync(entry.launch.cwd);
    if (!cwdExists) {
      projectLaunchState.set(entry.id, {
        running: false,
        startedAt: new Date().toISOString(),
        error: `目录不存在: ${entry.launch.cwd}`,
      });
      createActivityLog({
        source: "project",
        action: `project.start:${entry.id}`,
        status: "error",
        detail: `目录不存在: ${entry.launch.cwd}`,
      });
      return { status: 400, payload: { error: `目录不存在: ${entry.launch.cwd}` } };
    }

    fs.mkdirSync(CLAWLINK_LOG_DIR, { recursive: true });
    const logPath = path.join(CLAWLINK_LOG_DIR, `${entry.id}.log`);
    const MAX_LOG_BYTES = 10 * 1024 * 1024;
    try {
      const stat = fs.statSync(logPath);
      if (stat.size > MAX_LOG_BYTES) {
        const rotated = `${logPath}.${Date.now()}.old`;
        fs.renameSync(logPath, rotated);
      }
    } catch {}
    logStream = fs.openSync(logPath, "a");
    fs.writeSync(
      logStream,
      `\n\n=== ${new Date().toISOString()} launching (${reason}) ${entry.launch.command} ${(entry.launch.args || []).join(" ")} in ${entry.launch.cwd} ===\n`,
    );

    const launchEnv = {
      ...process.env,
      PATH: `${PROJECT_LAUNCH_PATH_PREFIX}:${process.env.PATH || ""}`,
      ...(entry.launch.env || {}),
    };

    const child = spawn(entry.launch.command, entry.launch.args || [], {
      cwd: entry.launch.cwd,
      env: launchEnv,
      detached: true,
      stdio: ["ignore", logStream, logStream],
      shell: false,
    });

    try {
      fs.closeSync(logStream);
    } catch {}
    logStream = null;

    child.on("error", (error) => {
      projectLaunchState.set(entry.id, {
        running: false,
        startedAt: new Date().toISOString(),
        error: error.message,
        logPath,
      });
      createActivityLog({
        source: "project",
        action: `project.start:${entry.id}`,
        status: "error",
        detail: `${error.message}（详见 ${logPath}）`,
      });
    });

    child.on("exit", (code, signal) => {
      const detail = `退出码 ${code}${signal ? ` · 信号 ${signal}` : ""}（详见 ${logPath}）`;
      const current = projectLaunchState.get(entry.id);
      projectLaunchState.set(entry.id, {
        running: false,
        pid: current?.pid || null,
        startedAt: current?.startedAt || new Date().toISOString(),
        error: code === 0 ? "" : detail,
        logPath,
      });
      if (code !== 0) {
        createActivityLog({
          source: "project",
          action: `project.exit:${entry.id}`,
          status: "error",
          detail,
        });
      }
    });

    child.unref();

    projectLaunchState.set(entry.id, {
      running: true,
      pid: child.pid,
      startedAt: new Date().toISOString(),
      error: "",
      logPath,
    });

    createActivityLog({
      source: "project",
      action: `project.start:${entry.id}`,
      status: "ok",
      detail: `${entry.launch.command} ${(entry.launch.args || []).join(" ")} (cwd: ${entry.launch.cwd}, log: ${logPath}, reason: ${reason})`,
    });

    return {
      status: 200,
      payload: {
        ok: true,
        id: entry.id,
        pid: child.pid,
        command: entry.launch.command,
        args: entry.launch.args || [],
        cwd: entry.launch.cwd,
        logPath,
      },
    };
  } catch (error) {
    if (logStream !== null) {
      try {
        fs.closeSync(logStream);
      } catch {}
    }
    projectLaunchState.set(entry.id, {
      running: false,
      startedAt: new Date().toISOString(),
      error: error.message,
    });
    createActivityLog({
      source: "project",
      action: `project.start:${entry.id}`,
      status: "error",
      detail: error.message,
    });
    return { status: 500, payload: { error: error.message } };
  }
}

async function ensureManagedProjects(reason = "startup") {
  if (!PROJECT_AUTO_START_ENABLED) return;

  for (const entry of PROJECT_REGISTRY) {
    if (!entry.launch?.command || entry.autoStart === false) continue;

    try {
      const probe = await probeProjectUrl(entry.url);
      if (probe.reachable) continue;

      await startProjectProcess(entry, { reason, skipProbe: true });
    } catch (error) {
      createActivityLog({
        source: "project",
        action: `project.ensure:${entry.id}`,
        status: "error",
        detail: error.message,
      });
    }
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

function normalizeSessionEventMessage(payload) {
  if (!payload?.message || typeof payload.message !== "object") return null;

  const message = {
    ...payload.message,
    __openclaw: {
      ...(payload.message.__openclaw || {}),
      ...(typeof payload.messageId === "string" ? { id: payload.messageId } : {}),
      ...(typeof payload.messageSeq === "number" ? { seq: payload.messageSeq } : {}),
    },
  };

  return normalizeHistory({ messages: [message] })[0] || null;
}

function writeSessionEventMessage(res, payload, options = {}) {
  const message = normalizeSessionEventMessage(payload);
  if (!message) return;

  if (
    options.skipUserEcho &&
    message.role === "user" &&
    message.content.trim() === options.skipUserEcho.trim()
  ) {
    return;
  }

  writeEventStreamEvent(res, "message", {
    sessionKey: payload.sessionKey || options.sessionKey || "",
    message,
    messageId: payload.messageId || "",
    messageSeq: typeof payload.messageSeq === "number" ? payload.messageSeq : null,
  });
}

async function writeHistorySnapshotEvent(client, res, sessionKey) {
  const result = await client.request(
    "chat.history",
    {
      sessionKey,
      limit: 100,
      maxChars: 12000,
    },
    { timeoutMs: 20000 }
  );

  writeEventStreamEvent(res, "history", {
    sessionKey,
    messages: normalizeHistory(result),
  });
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

async function handleSessionEvents(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const sessionKey = url.searchParams.get("sessionKey") || resolveGatewaySettings().targetSessionKey || "main";

  if (!sessionKey) {
    sendJson(res, 400, { error: "缺少 sessionKey" });
    return;
  }

  let client = null;
  let heartbeatTimer = null;
  let closed = false;

  function cleanup() {
    if (closed) return;
    closed = true;
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
    client?.stop();
  }

  try {
    const gateway = createOpenClawGatewayClient({
      onHelloOk: async () => {
        try {
          await client.request("sessions.messages.subscribe", { key: sessionKey }, { timeoutMs: 20000 });
          writeEventStreamEvent(res, "ready", { sessionKey });
        } catch (error) {
          writeEventStreamEvent(res, "error", { error: error.message || String(error), sessionKey });
          cleanup();
          res.end();
        }
      },
      onEvent: (event) => {
        if (event.event === "session.message") {
          writeSessionEventMessage(res, event.payload, { sessionKey });
        }
      },
      onClose: (code, reason) => {
        if (closed) return;
        writeEventStreamEvent(res, "error", {
          error: `OpenClaw Gateway 连接已关闭：${code} ${reason || ""}`.trim(),
          sessionKey,
        });
        cleanup();
        res.end();
      },
      onConnectError: (error) => {
        if (closed) return;
        writeEventStreamEvent(res, "error", { error: error.message || String(error), sessionKey });
        cleanup();
        res.end();
      },
    });

    client = gateway.client;
    sendEventStreamHeaders(res);
    writeEventStreamEvent(res, "connecting", { sessionKey });
    heartbeatTimer = setInterval(() => writeEventStreamComment(res), gatewayStreamHeartbeatMs);
    res.on("close", cleanup);
    client.start();
  } catch (error) {
    if (!res.headersSent) {
      sendJson(res, 500, { error: error.message || String(error) });
      return;
    }
    writeEventStreamEvent(res, "error", { error: error.message || String(error), sessionKey });
    cleanup();
    res.end();
  }
}

async function handleChatStream(req, res) {
  const body = await readJsonBody(req);
  const message = (body.message || "").trim();
  const settings = resolveGatewaySettings();
  const sessionKey = body.sessionKey || settings.targetSessionKey || "main";
  const targetAgentId = body.agentId || settings.targetAgentId || "";
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

  let client = null;
  let heartbeatTimer = null;
  let closed = false;

  function cleanup() {
    if (closed) return;
    closed = true;
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
    client?.stop();
  }

  async function finish(payload = {}) {
    if (closed) return;

    try {
      await writeHistorySnapshotEvent(client, res, sessionKey);
    } catch (error) {
      writeEventStreamEvent(res, "warn", {
        warning: `最终历史同步失败：${error.message || String(error)}`,
        sessionKey,
      });
    }

    writeEventStreamEvent(res, "done", {
      sessionKey,
      ...payload,
    });
    cleanup();
    res.end();
  }

  function fail(error) {
    if (closed) return;
    writeEventStreamEvent(res, "error", {
      error: error.message || String(error),
      sessionKey,
    });
    cleanup();
    res.end();
  }

  try {
    const gateway = createOpenClawGatewayClient({
      onHelloOk: async () => {
        try {
          await client.request("sessions.messages.subscribe", { key: sessionKey }, { timeoutMs: 20000 });
          writeEventStreamEvent(res, "ready", { sessionKey });

          const before = await client
            .request(
              "chat.history",
              {
                sessionKey,
                limit: 30,
                maxChars: 12000,
              },
              { timeoutMs: 20000 }
            )
            .catch(() => ({ messages: [] }));
          const beforeIds = new Set((before.messages || []).map((item, index) => messageIdentity(item, index)));
          const result = await client.request(
            "chat.send",
            {
              sessionKey,
              message,
              deliver: false,
              idempotencyKey: body.idempotencyKey || randomUUID(),
            },
            { timeoutMs: 20000 }
          );
          const runId = result?.runId || result?.result?.runId || "";

          runtimeState.lastSessionKey = sessionKey;
          runtimeState.lastChatAt = new Date().toISOString();
          createActivityLog({
            source: "route",
            action: "POST /api/chat/stream",
            status: "ok",
            detail: shorten(message, 120),
            meta: {
              sessionKey,
              agentId: targetAgentId,
              stream: true,
            },
          });

          writeEventStreamEvent(res, "accepted", {
            ok: true,
            sessionKey,
            agentId: targetAgentId,
            runId,
            pending: true,
          });

          if (runId) {
            const wait = await client
              .request(
                "agent.wait",
                {
                  runId,
                  timeoutMs: gatewayStreamTimeoutMs,
                },
                { timeoutMs: gatewayStreamTimeoutMs + 5000 }
              )
              .catch((error) => ({
                status: "error",
                error: error.message || String(error),
              }));

            await sleep(250);
            await finish({ runId, wait });
            return;
          }

          const reply = await waitForAssistantReply(
            sessionKey,
            beforeIds,
            startedAt,
            Math.min(gatewayStreamTimeoutMs, 60000)
          );
          await finish({ pending: !reply });
        } catch (error) {
          fail(error);
        }
      },
      onEvent: (event) => {
        if (event.event === "session.message") {
          writeSessionEventMessage(res, event.payload, {
            sessionKey,
            skipUserEcho: message,
          });
        }
      },
      onClose: (code, reason) => {
        if (closed) return;
        fail(new Error(`OpenClaw Gateway 连接已关闭：${code} ${reason || ""}`.trim()));
      },
      onConnectError: (error) => fail(error),
    });

    client = gateway.client;
    sendEventStreamHeaders(res);
    writeEventStreamEvent(res, "connecting", { sessionKey });
    heartbeatTimer = setInterval(() => writeEventStreamComment(res), gatewayStreamHeartbeatMs);
    res.on("close", cleanup);
    client.start();
  } catch (error) {
    if (!res.headersSent) {
      sendJson(res, 500, { error: error.message || String(error) });
      return;
    }
    fail(error);
  }
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

    if (req.method === "GET" && req.url.startsWith("/api/session-events")) {
      await handleSessionEvents(req, res);
      return;
    }

    if (req.method === "GET" && req.url.startsWith("/api/history")) {
      await handleHistory(req, res);
      return;
    }

    if (req.method === "POST" && req.url === "/api/website-engineer/clone") {
      await handleWebsiteEngineerClone(req, res);
      return;
    }

    if (req.method === "POST" && req.url === "/api/website-engineer/scan") {
      await handleWebsiteEngineerScan(req, res);
      return;
    }

    if (req.method === "POST" && req.url === "/api/website-engineer/agent-task") {
      await handleWebsiteEngineerAgentTask(req, res);
      return;
    }

    if (req.method === "GET" && req.url.startsWith("/api/website-engineer/workspace")) {
      await handleWebsiteEngineerWorkspace(req, res);
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

    if (req.method === "POST" && req.url === "/api/chat/stream") {
      await handleChatStream(req, res);
      return;
    }

    if (req.method === "POST" && req.url === "/api/chat") {
      await handleChat(req, res);
      return;
    }

    if (req.method === "GET" && req.url.startsWith("/clones/")) {
      if (serveCloneArchive(req, res)) return;
    }

    if (req.method === "GET" && req.url === "/api/projects/status") {
      await handleProjectsStatus(req, res);
      return;
    }

    if (req.method === "POST" && req.url.startsWith("/api/projects/")) {
      const match = req.url.match(/^\/api\/projects\/([^/]+)\/start$/);
      if (match) {
        await handleProjectStart(req, res, decodeURIComponent(match[1]));
        return;
      }
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
  if (PROJECT_AUTO_START_ENABLED) {
    ensureManagedProjects("startup").catch((error) => {
      createActivityLog({
        source: "project",
        action: "project.ensure:startup",
        status: "error",
        detail: error.message,
      });
    });

    if (Number.isFinite(PROJECT_AUTO_START_INTERVAL_MS) && PROJECT_AUTO_START_INTERVAL_MS > 0) {
      setInterval(() => {
        ensureManagedProjects("monitor").catch((error) => {
          createActivityLog({
            source: "project",
            action: "project.ensure:monitor",
            status: "error",
            detail: error.message,
          });
        });
      }, PROJECT_AUTO_START_INTERVAL_MS).unref();
    }
  }
});
