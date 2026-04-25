export function nowTime() {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}

export function shortenText(value, maxLength = 180) {
  if (typeof value !== "string") return "";
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength)}…`;
}

export function normalizeMessagePart(part, index = 0) {
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
      summary: part.summary || "",
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
      text: part.text || "[image]",
    };
  }

  return null;
}

export function normalizeMessageParts(message) {
  const sourceParts =
    Array.isArray(message?.parts) && message.parts.length
      ? message.parts
      : Array.isArray(message?.content)
        ? message.content
        : typeof message?.content === "string"
          ? [{ type: "text", text: message.content }]
          : typeof message?.text === "string"
            ? [{ type: "text", text: message.text }]
            : typeof message?.reply === "string"
              ? [{ type: "text", text: message.reply }]
              : [];

  return sourceParts.map((part, index) => normalizeMessagePart(part, index)).filter(Boolean);
}

function buildMessageText(parts, fallback = "") {
  const textContent = parts
    .map((part) => {
      if (part.type === "text") return part.text || "";
      if (part.type === "toolCall") return part.summary || part.name || "tool";
      if (part.type === "image") return part.text || "[image]";
      return "";
    })
    .filter(Boolean)
    .join("\n");

  return textContent || fallback || "";
}

function arePartsEquivalent(left = [], right = []) {
  if (left.length !== right.length) return false;

  for (let index = 0; index < left.length; index += 1) {
    const leftPart = left[index];
    const rightPart = right[index];

    if (!rightPart) return false;
    if (leftPart.type !== rightPart.type) return false;
    if ((leftPart.text || "") !== (rightPart.text || "")) return false;
    if ((leftPart.name || "") !== (rightPart.name || "")) return false;
    if ((leftPart.summary || "") !== (rightPart.summary || "")) return false;
  }

  return true;
}

function areMessagesEquivalent(left, right) {
  if (!left || !right) return false;
  if (left.id !== right.id) return false;
  if (left.role !== right.role) return false;
  if (left.content !== right.content) return false;
  if ((left.time || "") !== (right.time || "")) return false;
  if ((left.provider || "") !== (right.provider || "")) return false;
  if ((left.model || "") !== (right.model || "")) return false;
  return arePartsEquivalent(normalizeMessageParts(left), normalizeMessageParts(right));
}

export function areMessageListsEquivalent(current, next) {
  if (current === next) return true;
  if (!Array.isArray(current) || !Array.isArray(next)) return false;
  if (current.length !== next.length) return false;

  for (let index = 0; index < current.length; index += 1) {
    if (!areMessagesEquivalent(current[index], next[index])) {
      return false;
    }
  }

  return true;
}

function areScalarArraysEquivalent(left = [], right = []) {
  if (left.length !== right.length) return false;

  for (let index = 0; index < left.length; index += 1) {
    if ((left[index] || "") !== (right[index] || "")) {
      return false;
    }
  }

  return true;
}

function areAgentSessionsEquivalent(left = [], right = []) {
  if (left.length !== right.length) return false;

  for (let index = 0; index < left.length; index += 1) {
    const leftSession = left[index] || {};
    const rightSession = right[index] || {};

    if ((leftSession.id || "") !== (rightSession.id || "")) return false;
    if ((leftSession.sessionKey || "") !== (rightSession.sessionKey || "")) return false;
    if ((leftSession.label || "") !== (rightSession.label || "")) return false;
    if ((leftSession.status || "") !== (rightSession.status || "")) return false;
    if ((leftSession.updatedAt || "") !== (rightSession.updatedAt || "")) return false;
    if ((leftSession.createdAt || "") !== (rightSession.createdAt || "")) return false;
  }

  return true;
}

function areAgentsEquivalent(left, right) {
  if (!left || !right) return false;
  if (left.id !== right.id) return false;
  if (left.name !== right.name) return false;
  if (left.workspace !== right.workspace) return false;
  if (left.modelPrimary !== right.modelPrimary) return false;
  if (left.description !== right.description) return false;
  if (left.isDefault !== right.isDefault) return false;
  if (left.status !== right.status) return false;
  if (left.statusLabel !== right.statusLabel) return false;
  if (left.sessionCount !== right.sessionCount) return false;
  if (left.recentSessionCount !== right.recentSessionCount) return false;
  if (left.runningSessionCount !== right.runningSessionCount) return false;
  if (left.lastActivityAt !== right.lastActivityAt) return false;
  if (left.recentSessionKey !== right.recentSessionKey) return false;
  if (left.recentSessionLabel !== right.recentSessionLabel) return false;
  if (left.recentSessionPreview !== right.recentSessionPreview) return false;
  if (left.toolSummary !== right.toolSummary) return false;
  if (!areScalarArraysEquivalent(left.modelFallbacks, right.modelFallbacks)) return false;
  if (!areScalarArraysEquivalent(left.channelKinds, right.channelKinds)) return false;
  return areAgentSessionsEquivalent(left.sessions, right.sessions);
}

export function areAgentListsEquivalent(current, next) {
  if (current === next) return true;
  if (!Array.isArray(current) || !Array.isArray(next)) return false;
  if (current.length !== next.length) return false;

  for (let index = 0; index < current.length; index += 1) {
    if (!areAgentsEquivalent(current[index], next[index])) {
      return false;
    }
  }

  return true;
}

export function serializeMessageForCompare(message) {
  return {
    id: message.id,
    role: message.role,
    content: message.content,
    time: message.time,
    provider: message.provider || "",
    model: message.model || "",
    parts: normalizeMessageParts(message).map((part) => ({
      type: part.type,
      text: part.text || "",
      name: part.name || "",
      summary: part.summary || "",
      arguments: part.arguments || null,
    })),
  };
}

export function normalizeMessages(payload, fallbackMessages = []) {
  if (!Array.isArray(payload)) return fallbackMessages;
  if (payload.length === 0) return [];

  return payload
    .map((message, index) => {
      const parts = normalizeMessageParts(message);
      const content = buildMessageText(
        parts,
        typeof message.content === "string"
          ? message.content
          : typeof message.text === "string"
            ? message.text
            : typeof message.reply === "string"
              ? message.reply
              : ""
      );

      return {
        id: message.id || message.messageId || `history-${index}-${message.role || "assistant"}`,
        role: message.role || "assistant",
        content: content || "接口已返回消息，但当前字段无法直接显示。",
        parts,
        time: message.time || nowTime(),
        provider: message.provider || "",
        model: message.model || "",
        api: message.api || "",
      };
    })
    .filter((message) => message.parts.length || message.content);
}

export function normalizeSessions(payload) {
  if (!Array.isArray(payload)) return [];

  return payload.map((session, index) => ({
    sessionKey: session.sessionKey || session.key || session.id || `session-${index + 1}`,
    label: session.label || session.name || `会话 ${index + 1}`,
    lastMessage: session.lastMessage || session.preview || session.lastContent || session.updatedAt || "暂无预览",
    updatedAt: session.updatedAt || session.createdAt || "未知",
  }));
}

export function normalizeServerLogs(payload) {
  if (!Array.isArray(payload)) return [];

  return payload.map((log, index) => ({
    id: log.id || `server-log-${index}`,
    source: log.source || "server",
    action: log.action || "activity",
    status: log.status || "info",
    sessionKey: log.meta?.sessionKey || "",
    agentId: log.meta?.agentId || "",
    requestPreview: log.meta?.request || "",
    title: `${log.source || "server"} · ${log.action || "activity"}`,
    detail: [
      log.detail,
      log.durationMs ? `${log.durationMs}ms` : "",
      log.meta?.sessionKey ? `session ${log.meta.sessionKey}` : "",
      log.meta?.agentId ? `agent ${log.meta.agentId}` : "",
    ]
      .filter(Boolean)
      .join(" · "),
    time: log.time
      ? new Date(log.time).toLocaleTimeString("zh-CN", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        })
      : nowTime(),
    level: log.status === "error" ? "warn" : log.status === "ok" ? "ok" : "info",
  }));
}

export function normalizeAgents(payload) {
  if (!Array.isArray(payload)) return [];

  return payload.map((agent, index) => ({
    id: agent.id || agent.agentId || `agent-${index + 1}`,
    name: agent.name || agent.label || agent.id || `Agent ${index + 1}`,
    workspace: agent.workspace || "",
    modelPrimary: agent.modelPrimary || agent.model?.primary || agent.model || "",
    modelFallbacks: Array.isArray(agent.modelFallbacks) ? agent.modelFallbacks : agent.model?.fallbacks || [],
    description: agent.description || "",
    isDefault: Boolean(agent.isDefault),
    status: agent.status || "idle",
    statusLabel: agent.statusLabel || "待命",
    sessionCount: Number(agent.sessionCount) || 0,
    recentSessionCount: Number(agent.recentSessionCount) || 0,
    runningSessionCount: Number(agent.runningSessionCount) || 0,
    lastActivityAt: agent.lastActivityAt || "",
    recentSessionKey: agent.recentSessionKey || "",
    recentSessionLabel: agent.recentSessionLabel || "",
    recentSessionPreview: agent.recentSessionPreview || "",
    channelKinds: Array.isArray(agent.channelKinds) ? agent.channelKinds : [],
    toolSummary: agent.toolSummary || "",
    sessions: Array.isArray(agent.sessions) ? agent.sessions : [],
  }));
}

export function agentStatusTone(status) {
  if (status === "working") return "ok";
  if (status === "thinking") return "info";
  if (status === "error") return "warn";
  return "default";
}

export function getBackendOriginFromUrl(url) {
  const fallback = typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";

  try {
    return new URL(url, fallback).origin;
  } catch {
    return fallback;
  }
}
