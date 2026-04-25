import React from "react";
import {
  Activity,
  Bell,
  Bot,
  CheckCircle2,
  ChevronRight,
  Clock3,
  FolderOpen,
  Globe,
  History,
  LayoutDashboard,
  Link2,
  ListTodo,
  MessagesSquare,
  Moon,
  Plus,
  PlugZap,
  RefreshCw,
  Search,
  SendHorizontal,
  Server,
  Settings2,
  Sparkles,
  SquareTerminal,
  Sun,
  Workflow,
  Wrench,
  X,
} from "lucide-react";
import { BRANDING, formatDashboardDate, getGreeting } from "./branding.js";
import clawLinkMark from "./assets/logo-mark.png";
import { DEFAULT_CONFIG, loadStoredConfig, STORAGE_KEY } from "./lib/app-config.js";
import {
  agentStatusTone,
  areAgentListsEquivalent,
  areMessageListsEquivalent,
  getBackendOriginFromUrl,
  normalizeAgents,
  normalizeMessageParts,
  normalizeMessages,
  normalizeServerLogs,
  normalizeSessions,
  nowTime,
  shortenText,
} from "./lib/console-data.js";
import { fetchEventStream, fetchJsonOrThrow } from "./lib/http.js";
import { extractSessionKey } from "./lib/openclaw.js";

const ProjectGallery3D = React.lazy(() => import("./components/ProjectGallery3D.jsx"));
const DEFAULT_OPENCLAW_GATEWAY_URL = "http://127.0.0.1:18789";

// 6 位 AI 同事。URL 可按需改成你本地实际的端口。
const PROJECTS = [
  {
    id: "make-ppt",
    name: "make-ppt",
    role: "演示设计师",
    emoji: "🎨",
    color: "#f59e0b",
    url: "http://localhost:4321",
    techStack: "Node.js · Python · Gemini",
    description: "Word / PDF / Markdown 一键转 PPT，漫画风、Gemini 风模板随叫随到。",
  },
  {
    id: "ai-app",
    name: "Ai-app",
    role: "应用架构师",
    emoji: "🏗️",
    color: "#8b5cf6",
    url: "http://localhost:5112",
    techStack: "React · Vite · Express · SQLite",
    description: "输入应用创意 → AI 出 PRD → 生成 Kotlin 安卓代码 → 直接打 APK。",
  },
  {
    id: "clawlink",
    name: "ClawLink",
    role: "总控调度员",
    emoji: "🎛️",
    color: "#06b6d4",
    url: typeof window !== "undefined" ? window.location.origin : "http://localhost:3000",
    techStack: "React · Vite · OpenClaw Gateway",
    description: "当前控制台 · 聚合会话 / 日志 / 节点 / 真实 Agent 调度。",
  },
  {
    id: "jimeng-ui",
    name: "jimeng-ui",
    role: "视频制作员",
    emoji: "🎬",
    color: "#ef4444",
    url: "http://localhost:8000",
    techStack: "FastAPI · Playwright · 原生 Web",
    description: "即梦视频批量生产 · 异步任务管理 · 抖音发布链路。",
  },
  {
    id: "douyin-crawler",
    name: "抖音爬虫",
    role: "流量情报官",
    emoji: "🎯",
    color: "#ec4899",
    url: "http://localhost:8001",
    techStack: "FastAPI · SQLModel · SQLite",
    description: "视频登记 → 评论导入 → 意向打分 → 线索池 → 外呼台账。",
  },
  {
    id: "xianyu",
    name: "xianyu-openclaw-channel",
    role: "闲鱼经纪人",
    emoji: "🐟",
    color: "#10b981",
    url: "http://localhost:7860",
    techStack: "TypeScript · Python · Playwright",
    description: "闲鱼消息接入 AI · 智能客服 · 自动发货 · 商品发布。",
  },
];

const seedMessages = [
  {
    id: "m1",
    role: "system",
    content: "ClawLink 已启动，正在准备接入本地 OpenClaw。",
    time: "14:26",
  },
  {
    id: "m2",
    role: "assistant",
    content: "你好，我是你的 ClawLink 控制台。默认会优先连接真实 OpenClaw Gateway。",
    time: "14:27",
  },
];

const SCENE_PRESET_OPTIONS = [
  { id: "overview", label: "总览视角", focusId: "gateway", hint: "从中轴看整个控制层" },
  { id: "gateway", label: "中庭视角", focusId: "gateway", hint: "聚焦入口与中庭工位" },
  { id: "agents", label: "Agent 视角", focusId: "agents", hint: "聚焦真实 Agent 工位集群" },
  { id: "operations", label: "运维视角", focusId: "logs", hint: "聚焦日志、同步和运维面板" },
];

const OPENCLAW_SCENE_COLORS = [
  "#ec4899",
  "#8b5cf6",
  "#10b981",
  "#3b82f6",
  "#f59e0b",
  "#ef4444",
  "#14b8a6",
  "#f97316",
  "#6366f1",
  "#84cc16",
];

function buildChatStreamEndpoint(endpoint) {
  const base = typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";

  try {
    const url = new URL(endpoint || "/api/chat", base);
    const normalizedPath = url.pathname.replace(/\/$/, "");
    url.pathname = normalizedPath;
    if (!normalizedPath.endsWith("/stream")) {
      url.pathname = normalizedPath.endsWith("/api/chat") ? `${normalizedPath}/stream` : `${normalizedPath}/stream`;
    }
    return url.toString();
  } catch {
    return "/api/chat/stream";
  }
}

function buildSessionEventsEndpoint(backendOrigin, sessionKey) {
  const base = backendOrigin || (typeof window !== "undefined" ? window.location.origin : "http://localhost:3000");
  const url = new URL("/api/session-events", base);
  url.searchParams.set("sessionKey", sessionKey);
  return url.toString();
}

function upsertMessagesById(current, incoming) {
  if (!incoming.length) return current;

  const nextMessages = [...current];
  const indexesById = new Map(nextMessages.map((message, index) => [message.id, index]));
  let changed = false;

  incoming.forEach((message) => {
    if (!message?.id) return;
    const existingIndex = indexesById.get(message.id);

    if (existingIndex === undefined) {
      indexesById.set(message.id, nextMessages.length);
      nextMessages.push(message);
      changed = true;
      return;
    }

    nextMessages[existingIndex] = message;
    changed = true;
  });

  return changed ? nextMessages : current;
}

function compareAgentsByStableOrder(left, right) {
  if (left.isDefault !== right.isDefault) return left.isDefault ? -1 : 1;

  return `${left.name || left.id || ""}`.localeCompare(`${right.name || right.id || ""}`, "zh-Hans-CN", {
    numeric: true,
    sensitivity: "base",
  });
}

function getOpenClawSceneColor(agent) {
  const key = `${agent?.id || ""}:${agent?.name || ""}`;
  let hash = 0;

  for (let index = 0; index < key.length; index += 1) {
    hash = (hash * 33 + key.charCodeAt(index)) | 0;
  }

  return OPENCLAW_SCENE_COLORS[Math.abs(hash) % OPENCLAW_SCENE_COLORS.length];
}

function areAgentSummariesEquivalent(left, right) {
  if (!left || !right) return false;

  return (
    left.total === right.total &&
    left.activeCount === right.activeCount &&
    left.workingCount === right.workingCount &&
    left.recentCount === right.recentCount &&
    left.idleCount === right.idleCount &&
    left.errorCount === right.errorCount &&
    left.sessionCount === right.sessionCount &&
    left.defaultAgentId === right.defaultAgentId
  );
}

function getOpenClawSceneEmoji(agent) {
  const key = `${agent?.id || ""} ${agent?.name || ""}`.toLowerCase();
  if (key.includes("main")) return "🧠";
  if (key.includes("browser")) return "🌐";
  if (key.includes("video")) return "🎬";
  if (key.includes("image") || key.includes("图文")) return "🖼";
  if (key.includes("peripheral") || key.includes("外接")) return "🔌";
  if (key.includes("telegram")) return "✈️";
  if (key.includes("feishu")) return "📨";
  if (key.includes("commerce") || key.includes("电商")) return "🛍";
  if (key.includes("stack") || key.includes("全栈")) return "🧩";
  return "🤖";
}

const NAV_ITEMS = [
  {
    id: "overview",
    label: "概览",
    description: "任务中枢总览、状态与快捷动作",
    icon: LayoutDashboard,
    badge: "HOME",
  },
  {
    id: "chat",
    label: "聊天控制",
    description: "会话消息、连接检查与发送面板",
    icon: MessagesSquare,
    badge: "CORE",
  },
  {
    id: "sessions",
    label: "会话管理",
    description: "集中查看会话列表与当前上下文",
    icon: FolderOpen,
    badge: "LIVE",
  },
  {
    id: "agents",
    label: "Agent 调度",
    description: "读取实时 Agent 状态并派发正式任务",
    icon: Bot,
    badge: "LIVE",
  },
  {
    id: "logs",
    label: "工具日志",
    description: "查看 ClawLink 后端与运行调用日志",
    icon: Activity,
    badge: "NEW",
  },
  {
    id: "nodes",
    label: "节点设备",
    description: "汇总网关、默认路由与模块运行状态",
    icon: Server,
    badge: "PLAN",
  },
  {
    id: "browser",
    label: "3D 场景",
    description: "沉浸式总部调度视图",
    icon: Globe,
    badge: "3D",
  },
  {
    id: "tasks",
    label: "任务调度",
    description: "预留任务队列、计划与自动化",
    icon: Clock3,
    badge: "PLAN",
  },
  {
    id: "settings",
    label: "系统设置",
    description: "接口地址、默认会话与本地保存配置",
    icon: Settings2,
    badge: "SAVE",
  },
];

const placeholderModules = {
  nodes: [
    {
      title: "节点总览",
      description: "汇总在线节点、心跳、版本与告警状态。",
      icon: Server,
    },
    {
      title: "设备动作",
      description: "展示设备开关、占用状态与最近执行记录。",
      icon: Wrench,
    },
    {
      title: "运维控制",
      description: "预留重启、巡检、拉起任务等控制动作。",
      icon: Workflow,
    },
  ],
  browser: [
    {
      title: "浏览器实例",
      description: "管理页面标签、连接状态与运行会话。",
      icon: Globe,
    },
    {
      title: "自动化动作",
      description: "预留点击、输入、截图与脚本执行能力。",
      icon: SquareTerminal,
    },
    {
      title: "操作回放",
      description: "后续可展示轨迹、录像与失败快照。",
      icon: History,
    },
  ],
  tasks: [
    {
      title: "任务队列",
      description: "展示待执行、运行中和失败任务。",
      icon: ListTodo,
    },
    {
      title: "定时任务",
      description: "预留周期任务与自动运行入口。",
      icon: Clock3,
    },
    {
      title: "联动动作",
      description: "任务失败与节点异常联动通知和恢复。",
      icon: Link2,
    },
  ],
};

const overviewModules = [
  {
    key: "chat",
    title: "聊天控制",
    summary: "发送消息、创建会话并加载历史。",
    action: "进入聊天",
    icon: MessagesSquare,
  },
  {
    key: "sessions",
    title: "会话管理",
    summary: "集中查看 session 列表和当前会话上下文。",
    action: "查看会话",
    icon: FolderOpen,
  },
  {
    key: "agents",
    title: "Agent 调度",
    summary: "读取实时 Agent 状态并创建/派发任务。",
    action: "调度 Agent",
    icon: Bot,
  },
  {
    key: "logs",
    title: "工具日志",
    summary: "读取后端真实活动日志，并支持筛选定位。",
    action: "查看日志",
    icon: Activity,
  },
  {
    key: "browser",
    title: "3D 场景",
    summary: "进入 ClawLink 控制层 3D 办公场景。",
    action: "打开场景",
    icon: Globe,
  },
];

const DEFAULT_OPERATIONAL_REFRESH = {
  logs: true,
  overview: true,
  agents: true,
};

function mergeOperationalRefreshRequest(current, next) {
  const base = current || { logs: false, overview: false, agents: false };
  const incoming = next || DEFAULT_OPERATIONAL_REFRESH;

  return {
    logs: Boolean(base.logs || incoming.logs),
    overview: Boolean(base.overview || incoming.overview),
    agents: Boolean(base.agents || incoming.agents),
  };
}

function FilterChip({ label, active, onClick }) {
  return (
    <button type="button" onClick={onClick} className={`filter-chip ${active ? "active" : ""}`}>
      {label}
    </button>
  );
}

function SectionCard({ title, description, icon: Icon, action, children, className = "" }) {
  return (
    <section className={`app-panel p-5 ${className}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {Icon ? <Icon className="h-4 w-4 text-[var(--accent)]" /> : null}
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">{title}</h2>
          </div>
          {description ? <p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">{description}</p> : null}
        </div>
        {action}
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function DockItem({ item, active, onClick }) {
  const Icon = item.icon;

  return (
    <button type="button" onClick={onClick} className={`dock-item ${active ? "active" : ""}`}>
      <Icon className="h-5 w-5" />
      <span className="dock-label">{item.label}</span>
    </button>
  );
}

function MobileNav({ activeView, onSelect }) {
  return (
    <div className="-mx-1 mt-4 flex gap-2 overflow-x-auto px-1 xl:hidden">
      {NAV_ITEMS.map((item) => {
        const Icon = item.icon;
        const active = item.id === activeView;

        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelect(item.id)}
            className={`mobile-tab ${active ? "active" : ""}`}
          >
            <Icon className="h-4 w-4" />
            <span>{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function StatusBadge({ label, value, tone = "default", pulse = false }) {
  return (
    <div className={`status-badge status-${tone}`}>
      <span className={`status-dot ${pulse ? "pulse" : ""}`} />
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function MetricCard({ label, value, hint, icon: Icon, tone = "default" }) {
  return (
    <div className={`metric-card metric-${tone}`}>
      <div className="flex items-center justify-between gap-3">
        <span className="metric-label">{label}</span>
        {Icon ? <Icon className="h-4 w-4 text-[var(--text-secondary)]" /> : null}
      </div>
      <div className="mt-3 text-2xl font-semibold tracking-tight text-[var(--text-primary)]">{value}</div>
      {hint ? <div className="mt-2 text-xs leading-5 text-[var(--text-secondary)]">{hint}</div> : null}
    </div>
  );
}

function formatToolArguments(value) {
  if (!value) return "";
  if (typeof value === "string") return value;

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return "";
  }
}

function getToolCallHeadline(part) {
  const args = part.arguments && typeof part.arguments === "object" ? part.arguments : {};
  if (typeof args.command === "string" && args.command.trim()) return args.command.trim();
  if (typeof args.path === "string" && args.path.trim()) return args.path.trim();
  if (typeof args.action === "string" && args.action.trim()) {
    return [args.action, args.sessionId].filter(Boolean).join(" · ");
  }
  return "";
}

function getToolCallMeta(part) {
  const args = part.arguments && typeof part.arguments === "object" ? part.arguments : {};
  return [
    typeof args.workdir === "string" && args.workdir ? `workdir ${args.workdir}` : "",
    typeof args.timeout === "number" ? `timeout ${args.timeout}s` : "",
    typeof args.yieldMs === "number" ? `yield ${args.yieldMs}ms` : "",
    typeof args.limit === "number" ? `limit ${args.limit}` : "",
    typeof args.offset === "number" ? `offset ${args.offset}` : "",
  ].filter(Boolean);
}

function ToolCallCard({ part }) {
  const headline = getToolCallHeadline(part);
  const metaItems = getToolCallMeta(part);
  const formattedArguments = formatToolArguments(part.arguments);
  const shouldShowArguments =
    formattedArguments && (!headline || formattedArguments.trim() !== headline.trim()) && formattedArguments.length <= 900;

  return (
    <div className="tool-call-card">
      <div className="tool-call-header">
        <div className="tool-call-title">
          <SquareTerminal className="h-4 w-4 text-[var(--accent)]" />
          <span>{part.name || "tool"}</span>
        </div>
        {part.id ? <span className="tool-call-id">{shortenText(String(part.id).replace(/^call_/, ""), 12)}</span> : null}
      </div>

      {part.summary ? <div className="tool-call-summary">{part.summary}</div> : null}
      {headline ? <pre className="tool-call-primary">{headline}</pre> : null}

      {metaItems.length ? (
        <div className="tool-call-meta">
          {metaItems.map((item) => (
            <span key={item} className="tool-call-pill">
              {item}
            </span>
          ))}
        </div>
      ) : null}

      {shouldShowArguments ? <pre className="tool-call-arguments">{formattedArguments}</pre> : null}
    </div>
  );
}

function MessageBubble({ message }) {
  const isUser = message.role === "user";
  const isSystem = message.role === "system";
  const parts = normalizeMessageParts(message);
  const textParts = parts.filter((part) => part.type === "text");
  const toolParts = parts.filter((part) => part.type === "toolCall");
  const roleLabel = isUser ? "你" : isSystem ? "系统" : "ClawLink";
  const avatarLabel = isUser ? "U" : isSystem ? "SYS" : "AI";
  const modelBadge = [message.model, message.provider].filter(Boolean).join(" · ");

  return (
    <div className={`message-row ${isUser ? "user" : isSystem ? "system" : "assistant"}`}>
      <div className={`message-avatar ${isUser ? "user" : isSystem ? "system" : "assistant"}`}>{avatarLabel}</div>
      <div className={`message-bubble ${isUser ? "user" : isSystem ? "system" : "assistant"}`}>
        <div className="message-bubble-header">
          <div className="message-bubble-badges">
            <span className="message-role-pill">{roleLabel}</span>
            {modelBadge ? <span className="message-meta-pill">{modelBadge}</span> : null}
            {toolParts.length ? <span className="message-meta-pill">{toolParts.length} 次工具调用</span> : null}
          </div>
          <div className="message-time">{message.time || "刚刚"}</div>
        </div>

        <div className="message-bubble-body">
          {textParts.length ? (
            <div className="message-text-stack">
              {textParts.map((part) => (
                <div key={part.id} className="message-text-block">
                  {part.text}
                </div>
              ))}
            </div>
          ) : null}

          {toolParts.length ? (
            <div className="message-tools-section">
              {toolParts.map((part) => (
                <ToolCallCard key={part.id} part={part} />
              ))}
            </div>
          ) : null}

          {!textParts.length && !toolParts.length ? <div className="message-text-block">{message.content}</div> : null}
        </div>
      </div>
    </div>
  );
}

function SessionItem({ session, active, onClick }) {
  return (
    <button type="button" onClick={onClick} className={`session-item ${active ? "active" : ""}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="truncate text-sm font-semibold text-[var(--text-primary)]">{session.label || "未命名会话"}</div>
        <div className="shrink-0 text-[11px] text-[var(--text-muted)]">{session.updatedAt}</div>
      </div>
      <div className="mt-1 break-all text-xs text-[var(--text-secondary)]">{session.sessionKey}</div>
      <div className="mt-3 text-xs leading-5 text-[var(--text-muted)]">{session.lastMessage || "暂无预览"}</div>
    </button>
  );
}

function SessionDrawer({ open, sessions, activeSessionKey, loading, mode, onClose, onRefresh, onOpenSession }) {
  return (
    <div className={`session-drawer-shell ${open ? "open" : ""}`} aria-hidden={!open}>
      <button type="button" className="session-drawer-backdrop" onClick={onClose} aria-label="关闭会话列表" />
      <aside className="session-drawer">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="topbar-eyebrow">Sessions</div>
            <h2 className="mt-2 text-xl font-semibold text-[var(--text-primary)]">会话列表</h2>
            <p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">选择会话后自动载入历史。</p>
          </div>
          <button type="button" className="icon-shell" onClick={onClose} aria-label="关闭">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-5 grid gap-3">
          <QuickActionButton
            label={loading ? "刷新中..." : "刷新会话"}
            icon={RefreshCw}
            tone="secondary"
            disabled={loading || mode === "mock"}
            onClick={onRefresh}
            loading={loading}
          />
        </div>

        <div className="session-drawer-list">
          {sessions.length ? (
            sessions.map((session) => (
              <SessionItem
                key={session.sessionKey}
                session={session}
                active={session.sessionKey === activeSessionKey}
                onClick={() => {
                  onOpenSession(session.sessionKey);
                  onClose();
                }}
              />
            ))
          ) : (
            <div className="placeholder-card">
              {mode === "mock" ? "演示模式下不拉取真实会话。" : "暂无会话数据，先检查网关或创建会话。"}
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}

function SceneAgentDrawer({
  open,
  agent,
  dispatchTitle,
  dispatchMessage,
  onTitleChange,
  onMessageChange,
  onClose,
  onSetDefault,
  onCreateSession,
  onDispatch,
  connecting,
  dispatching,
  mode,
}) {
  return (
    <div className={`scene-agent-drawer-shell ${open ? "open" : ""}`} aria-hidden={!open}>
      <button type="button" className="scene-agent-drawer-backdrop" onClick={onClose} aria-label="关闭 Agent 抽屉" />
      <aside className="scene-agent-drawer">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="topbar-eyebrow">3D Agent Drawer</div>
            <h2 className="mt-2 text-xl font-semibold text-[var(--text-primary)]">{agent?.name || "选择一个 Agent"}</h2>
            <p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">
              {agent ? `${agent.id} · 在 3D 场景里直接对这个 Agent 下发任务。` : "点击 3D 里的 Agent 角色或工位后，这里会自动打开。"}
            </p>
          </div>
          <button type="button" className="icon-shell" onClick={onClose} aria-label="关闭">
            <X className="h-4 w-4" />
          </button>
        </div>

        {agent ? (
          <>
            <div className="scene-agent-drawer-summary">
              <StatusBadge label="状态" value={agent.statusLabel || "待命"} tone={agentStatusTone(agent.status)} pulse={agent.status === "working"} />
              <StatusBadge label="模型" value={agent.modelPrimary || "未公开"} tone="default" />
              <StatusBadge label="近 1h" value={`${agent.recentSessionCount || 0} 会话`} tone="info" />
            </div>

            <div className="scene-agent-drawer-form">
              <label>
                <span>任务标题</span>
                <input value={dispatchTitle} onChange={onTitleChange} className="app-input w-full" placeholder="例如：今日巡检与汇总" />
              </label>
              <label>
                <span>任务指令</span>
                <textarea
                  value={dispatchMessage}
                  onChange={onMessageChange}
                  rows={8}
                  className="app-textarea w-full"
                  placeholder="在这里直接写给该 Agent 的正式任务。点击“派发任务”后会创建 OpenClaw 会话并发送。"
                />
              </label>
            </div>

            <div className="scene-agent-drawer-actions">
              <QuickActionButton label="设为默认" icon={CheckCircle2} tone="secondary" disabled={!agent} onClick={onSetDefault} />
              <QuickActionButton
                label={connecting ? "创建中..." : "创建会话"}
                icon={Plus}
                tone="success"
                disabled={!agent || connecting || mode === "mock"}
                onClick={onCreateSession}
                loading={connecting}
              />
              <QuickActionButton
                label={dispatching ? "派发中..." : "派发任务"}
                icon={SendHorizontal}
                tone="primary"
                disabled={!agent || dispatching || mode === "mock" || !dispatchMessage.trim()}
                onClick={onDispatch}
                loading={dispatching}
              />
            </div>

            <div className="scene-agent-drawer-context">
              <div className="scene-agent-drawer-context-title">最近会话</div>
              <div className="scene-agent-drawer-session-list">
                {(agent.sessions || []).slice(0, 5).map((session) => (
                  <div key={session.sessionKey} className="scene-agent-drawer-session">
                    <div className="scene-agent-drawer-session-top">
                      <strong>{session.label || "未命名会话"}</strong>
                      <span>{session.updatedAt || "未知"}</span>
                    </div>
                    <div className="scene-agent-drawer-session-key">{session.sessionKey}</div>
                  </div>
                ))}
                {!agent.sessions?.length ? <div className="placeholder-card">该 Agent 暂无近期会话。</div> : null}
              </div>
            </div>
          </>
        ) : null}
      </aside>
    </div>
  );
}

function LogItem({ log }) {
  return (
    <div className={`log-item log-${log.level || "info"}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-semibold">{log.title}</div>
        <div className="text-[11px] opacity-70">{log.time}</div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <span className="log-meta-pill">{log.status || "info"}</span>
        <span className="log-meta-pill">{log.source || "server"}</span>
        {log.sessionKey ? <span className="log-meta-pill">{log.sessionKey}</span> : null}
        {log.agentId ? <span className="log-meta-pill">{log.agentId}</span> : null}
      </div>
      <div className="mt-2 text-xs leading-6 opacity-80">{log.detail}</div>
      {log.requestPreview ? <div className="mt-2 text-[11px] leading-5 opacity-50">{log.requestPreview}</div> : null}
    </div>
  );
}

function PlaceholderCard({ title, description, icon: Icon }) {
  return (
    <div className="placeholder-card">
      <div className="flex items-center gap-2">
        {Icon ? <Icon className="h-4 w-4 text-[var(--accent)]" /> : null}
        <div className="text-sm font-semibold text-[var(--text-primary)]">{title}</div>
      </div>
      <div className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">{description}</div>
    </div>
  );
}

function ConfigInput({ label, value, onChange, placeholder, type = "text" }) {
  return (
    <label className="block">
      <div className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--text-muted)]">{label}</div>
      {type === "select" ? (
        <select value={value} onChange={onChange} className="app-input w-full">
          <option value="mock">演示模式</option>
          <option value="live">真实接口模式</option>
        </select>
      ) : (
        <input value={value} onChange={onChange} placeholder={placeholder} className="app-input w-full" />
      )}
    </label>
  );
}

function QuickActionButton({ label, icon: Icon, tone = "secondary", disabled, onClick, loading = false }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={`action-button action-${tone}`}>
      {Icon ? <Icon className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> : null}
      <span>{label}</span>
    </button>
  );
}

function OverviewModuleCard({ item, onOpen }) {
  const Icon = item.icon;

  return (
    <button type="button" onClick={onOpen} className="overview-module">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Icon className="h-5 w-5 text-[var(--accent)]" />
          <div className="text-base font-semibold text-[var(--text-primary)]">{item.title}</div>
        </div>
        <ChevronRight className="h-4 w-4 text-[var(--text-muted)]" />
      </div>
      <div className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">{item.summary}</div>
      <div className="mt-4 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--accent)]">
        {item.action}
      </div>
    </button>
  );
}

export default function App() {
  const [activeView, setActiveView] = React.useState("overview");
  const [config, setConfig] = React.useState(loadStoredConfig);
  const [isSessionDrawerOpen, setIsSessionDrawerOpen] = React.useState(false);
  const [isSceneAgentDrawerOpen, setIsSceneAgentDrawerOpen] = React.useState(false);
  const [sceneCameraPreset, setSceneCameraPreset] = React.useState("overview");
  const [sceneFocusId, setSceneFocusId] = React.useState("gateway");
  const [activeProjectId, setActiveProjectId] = React.useState(null);
  const handleOpenProject = React.useCallback((project) => {
    if (!project?.url) return;
    if (typeof window === "undefined") return;
    window.open(project.url, "_blank", "noopener");
  }, []);
  const [messages, setMessages] = React.useState(seedMessages);
  const [input, setInput] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const [connecting, setConnecting] = React.useState(false);
  const [loadingSessions, setLoadingSessions] = React.useState(false);
  const [loadingHistory, setLoadingHistory] = React.useState(false);
  const [connectionInfo, setConnectionInfo] = React.useState(null);
  const [gatewayCheckState, setGatewayCheckState] = React.useState("idle");
  const [gatewayCheckedAt, setGatewayCheckedAt] = React.useState("");
  const [gatewayCheckError, setGatewayCheckError] = React.useState("");
  const [sessions, setSessions] = React.useState([]);
  const [serverLogs, setServerLogs] = React.useState([]);
  const [serverLogMeta, setServerLogMeta] = React.useState({
    total: 0,
    matched: 0,
    filters: { limit: 80, status: "", source: "", action: "", sessionKey: "", q: "" },
    facets: { statuses: [], sources: [], actions: [] },
  });
  const [loadingServerLogs, setLoadingServerLogs] = React.useState(false);
  const [systemOverview, setSystemOverview] = React.useState(null);
  const [loadingSystemOverview, setLoadingSystemOverview] = React.useState(false);
  const [openClawAgents, setOpenClawAgents] = React.useState([]);
  const [agentSummary, setAgentSummary] = React.useState({
    total: 0,
    activeCount: 0,
    workingCount: 0,
    recentCount: 0,
    idleCount: 0,
    errorCount: 0,
    sessionCount: 0,
    defaultAgentId: "",
  });
  const [loadingAgents, setLoadingAgents] = React.useState(false);
  const [dispatchingAgent, setDispatchingAgent] = React.useState(false);
  const [selectedAgentId, setSelectedAgentId] = React.useState("");
  const [dispatchTitle, setDispatchTitle] = React.useState("ClawLink 正式调度");
  const [dispatchMessage, setDispatchMessage] = React.useState("");
  const [logSearchInput, setLogSearchInput] = React.useState("");
  const [isMessageStageAtBottom, setIsMessageStageAtBottom] = React.useState(true);
  const [sessionStreamState, setSessionStreamState] = React.useState("idle");
  const hasAutoHealthChecked = React.useRef(false);
  const lastAutoLoadedSessionKey = React.useRef("");
  const messageStageRef = React.useRef(null);
  const chatInputRef = React.useRef(null);
  const shouldStickToBottomRef = React.useRef(true);
  const pendingUserEchoRef = React.useRef(new Map());
  const operationalRefreshRef = React.useRef({
    timer: null,
    inFlight: false,
    pending: null,
  });
  const [activityLogs, setActivityLogs] = React.useState(() => [
    {
      id: "log-boot",
      title: "任务中枢已就绪",
      detail: "当前界面已改成参考 FeiControl 的任务中枢信息架构。",
      level: "ok",
      time: nowTime(),
    },
  ]);

  const {
    mode,
    endpoint,
    sessionEndpoint,
    healthEndpoint,
    sessionsEndpoint,
    historyEndpoint,
    agentsEndpoint,
    agentDispatchEndpoint,
    theme,
    sessionKey,
    agentId,
  } = config;

  const greeting = getGreeting();
  const currentDate = formatDashboardDate();
  const canSend = input.trim().length > 0 && !sending;
  const activeNav = NAV_ITEMS.find((item) => item.id === activeView) || NAV_ITEMS[0];
  const currentSession = sessions.find((session) => session.sessionKey === sessionKey) || null;
  const latestLog = activityLogs[0] || null;
  const latestServerLog = serverLogs[0] || null;
  const recentMessages = messages.slice(-3);
  const overviewChecks = systemOverview?.checks || [];
  const backendOrigin = React.useMemo(() => getBackendOriginFromUrl(healthEndpoint), [healthEndpoint]);
  const bridgeEndpointLabel = backendOrigin || healthEndpoint;
  const gatewayEndpointLabel = connectionInfo?.gatewayBaseUrl || DEFAULT_OPENCLAW_GATEWAY_URL;
  const connectionStateMeta = React.useMemo(() => {
    if (mode === "mock") {
      return {
        state: "演示模式",
        tone: "ok",
        badgeValue: "模拟运行",
        pulse: true,
        runtimeState: "mock",
        runtimeLabel: "Mock",
        dotState: "mock",
        note: "当前为演示模式，不会自动拉取真实网关状态。",
        metaPrimary: "运行方式：本地演示",
        metaSecondary: `默认网关：${gatewayEndpointLabel}`,
        footerLabel: "演示模式",
      };
    }

    if (connecting || gatewayCheckState === "checking") {
      return {
        state: "检查中",
        tone: "info",
        badgeValue: "检查中",
        pulse: true,
        runtimeState: "checking",
        runtimeLabel: "检查中",
        dotState: "checking",
        note: "正在检查网关连通性，请稍候。",
        metaPrimary: `实际网关：${gatewayEndpointLabel}`,
        metaSecondary: gatewayCheckedAt ? `桥接入口：${bridgeEndpointLabel} · 上次检查：${gatewayCheckedAt}` : `桥接入口：${bridgeEndpointLabel}`,
        footerLabel: "正在检查网关",
      };
    }

    if (gatewayCheckState === "error") {
      return {
        state: "检查失败",
        tone: "warn",
        badgeValue: "检查失败",
        pulse: false,
        runtimeState: "failed",
        runtimeLabel: "失败",
        dotState: "failed",
        note: `网关检查失败：${shortenText(gatewayCheckError || "暂时无法连接网关", 64)}`,
        metaPrimary: `实际网关：${gatewayEndpointLabel}`,
        metaSecondary: gatewayCheckedAt ? `桥接入口：${bridgeEndpointLabel} · 失败时间：${gatewayCheckedAt}` : `桥接入口：${bridgeEndpointLabel}`,
        footerLabel: "网关检查失败",
      };
    }

    if (connectionInfo || gatewayCheckState === "success") {
      return {
        state: "已连接",
        tone: "ok",
        badgeValue: "运行正常",
        pulse: true,
        runtimeState: "live",
        runtimeLabel: "已连接",
        dotState: "online",
        note: "网关在线，可继续创建会话和发送消息。",
        metaPrimary: `实际网关：${gatewayEndpointLabel}`,
        metaSecondary: gatewayCheckedAt ? `桥接入口：${bridgeEndpointLabel} · 上次检查：${gatewayCheckedAt}` : `桥接入口：${bridgeEndpointLabel}`,
        footerLabel: "网关已连接",
      };
    }

    return {
      state: "待检查",
      tone: "warn",
      badgeValue: "待检查",
      pulse: false,
      runtimeState: "waiting",
      runtimeLabel: "待检查",
      dotState: "idle",
      note: "还没有执行过网关检查，先点一下按钮。",
      metaPrimary: `实际网关：${gatewayEndpointLabel}`,
      metaSecondary: `桥接入口：${bridgeEndpointLabel}`,
      footerLabel: "网关待检查",
    };
  }, [bridgeEndpointLabel, connecting, connectionInfo, gatewayCheckError, gatewayCheckState, gatewayCheckedAt, gatewayEndpointLabel, mode]);
  const connectionState = connectionStateMeta.state;
  const connectionTone = connectionStateMeta.tone;
  const connectionBadgeValue = connectionStateMeta.badgeValue;
  const connectionBadgePulse = connectionStateMeta.pulse;
  const connectionRuntimeState = connectionStateMeta.runtimeState;
  const connectionRuntimeLabel = connectionStateMeta.runtimeLabel;
  const connectionDotState = connectionStateMeta.dotState;
  const connectionStatusNote = connectionStateMeta.note;
  const connectionStatusMetaPrimary = connectionStateMeta.metaPrimary;
  const connectionStatusMetaSecondary = connectionStateMeta.metaSecondary;
  const chatConnectionLabel = connectionStateMeta.footerLabel;
  const chatSyncLabel =
    mode === "mock"
      ? "演示模式"
      : sessionStreamState === "connected"
        ? "实时流式同步"
        : sessionStreamState === "connecting"
          ? "实时连接中"
          : "流式备用同步";
  const currentLogFilters = serverLogMeta.filters || {};
  const logStatusOptions = serverLogMeta.facets?.statuses || [];
  const logSourceOptions = serverLogMeta.facets?.sources || [];
  const serverLogErrorCount = React.useMemo(
    () => serverLogs.filter((log) => log.status === "error").length,
    [serverLogs]
  );
  const gatewayLogCount = React.useMemo(
    () => serverLogs.filter((log) => log.source === "gateway").length,
    [serverLogs]
  );
  const selectedAgent =
    openClawAgents.find((agent) => agent.id === selectedAgentId) ||
    openClawAgents.find((agent) => agent.id === agentId) ||
    openClawAgents.find((agent) => agent.isDefault) ||
    openClawAgents[0] ||
    null;
  const agentErrorCount = agentSummary.errorCount || openClawAgents.filter((agent) => agent.status === "error").length;
  const ThemeIcon = theme === "light" ? Sun : Moon;
  const topbarRuntimeState = connectionRuntimeState;
  const topbarRuntimeLabel = connectionRuntimeLabel;
  const sceneSystemAgents = React.useMemo(
    () => [
      {
        id: "gateway",
        kind: "system",
        name: "Gateway",
        emoji: "⛩",
        color: "#ff6b5e",
        status:
          mode === "mock"
            ? "idle"
            : connecting || gatewayCheckState === "checking"
              ? "working"
              : gatewayCheckState === "error"
                ? "error"
                : connectionInfo || gatewayCheckState === "success"
                  ? "working"
                  : "thinking",
        statusLabel: connectionState,
        note: connectionStatusNote,
      },
      {
        id: "chat",
        kind: "system",
        name: "Chat",
        emoji: "💬",
        color: "#8b5cf6",
        status: sending ? "working" : messages.length ? "thinking" : "idle",
        statusLabel: sending ? "消息处理中" : `${messages.length} 条消息`,
        note: currentSession?.label || "当前无聊天上下文",
      },
      {
        id: "sessions",
        kind: "system",
        name: "Sessions",
        emoji: "🗂",
        color: "#10b981",
        status: loadingSessions ? "working" : sessions.length ? "thinking" : "idle",
        statusLabel: loadingSessions ? "同步会话" : `${sessions.length} 个会话`,
        note: sessions[0]?.label || "等待会话列表",
      },
      {
        id: "history",
        kind: "system",
        name: "History",
        emoji: "🕘",
        color: "#3b82f6",
        status: loadingHistory ? "working" : sessionKey ? "thinking" : "idle",
        statusLabel: loadingHistory ? "载入历史" : sessionKey ? "会话已绑定" : "未绑定 session",
        note: sessionKey || "请先创建或选择会话",
      },
      {
        id: "logs",
        kind: "system",
        name: "Logs",
        emoji: "🛠",
        color: "#f59e0b",
        status: loadingServerLogs ? "working" : serverLogErrorCount ? "error" : "thinking",
        statusLabel: serverLogErrorCount ? `${serverLogErrorCount} 条异常` : "日志正常",
        note: latestServerLog?.detail || "最近暂无后端日志",
      },
      {
        id: "agents",
        kind: "system",
        name: "Agents",
        emoji: "🤖",
        color: "#ec4899",
        status: loadingAgents ? "working" : agentErrorCount ? "error" : agentSummary.activeCount ? "thinking" : "idle",
        statusLabel: loadingAgents ? "同步 Agent" : `${agentSummary.total || openClawAgents.length} 个 Agent`,
        note: selectedAgent?.name || agentId || "等待 OpenClaw Agent 列表",
      },
    ],
    [
      agentId,
      agentErrorCount,
      agentSummary.activeCount,
      agentSummary.total,
      connectionInfo,
      connectionState,
      connectionStatusNote,
      connecting,
      currentSession,
      gatewayCheckState,
      latestServerLog,
      loadingAgents,
      loadingHistory,
      loadingServerLogs,
      loadingSessions,
      messages.length,
      mode,
      openClawAgents.length,
      selectedAgent,
      sending,
      serverLogErrorCount,
      sessionKey,
      sessions,
    ]
  );
  const sceneRuntimeAgents = React.useMemo(
    () =>
      openClawAgents.map((agent) => ({
        id: `agent-${agent.id}`,
        kind: "openclaw-agent",
        agentId: agent.id,
        name: agent.name || agent.id,
        emoji: getOpenClawSceneEmoji(agent),
        color: getOpenClawSceneColor(agent),
        status: agent.status || "idle",
        statusLabel: agent.statusLabel || "待命",
        note: agent.recentSessionLabel || agent.modelPrimary || agent.workspace || "等待任务派发",
      })),
    [openClawAgents]
  );
  const sceneAgents = React.useMemo(
    () => [...sceneSystemAgents, ...sceneRuntimeAgents],
    [sceneRuntimeAgents, sceneSystemAgents]
  );
  const sceneSummary = React.useMemo(
    () => ({
      sessions: sessions.length,
      messages: messages.length,
      errors: serverLogErrorCount,
      agents: agentSummary.total || openClawAgents.length,
      activeAgents: agentSummary.activeCount || 0,
    }),
    [agentSummary.activeCount, agentSummary.total, messages.length, openClawAgents.length, serverLogErrorCount, sessions.length]
  );

  const updateConfig = React.useCallback((field, value) => {
    setConfig((current) => ({ ...current, [field]: value }));
  }, []);

  const scrollMessagesToBottom = React.useCallback((behavior = "auto") => {
    const stage = messageStageRef.current;
    if (!stage) return;
    if (typeof stage.scrollTo === "function") {
      stage.scrollTo({ top: stage.scrollHeight, behavior });
      return;
    }
    stage.scrollTop = stage.scrollHeight;
  }, []);

  const toggleTheme = React.useCallback(() => {
    setConfig((current) => ({ ...current, theme: current.theme === "light" ? "dark" : "light" }));
  }, []);

  const pushActivityLog = React.useCallback((title, detail, level = "info") => {
    setActivityLogs((current) => [
      {
        id: crypto.randomUUID(),
        title,
        detail,
        level,
        time: nowTime(),
      },
      ...current,
    ].slice(0, 60));
  }, []);

  const pushSystemMessage = React.useCallback((content) => {
    setMessages((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        role: "system",
        content,
        parts: [{ id: "system-text", type: "text", text: content }],
        time: nowTime(),
      },
    ]);
  }, []);

  const rememberPendingUserEcho = React.useCallback((content) => {
    const key = content.trim();
    if (!key) return;

    const pending = pendingUserEchoRef.current;
    const queue = pending.get(key) || [];
    queue.push(Date.now() + 15000);
    pending.set(key, queue);
  }, []);

  const consumePendingUserEcho = React.useCallback((message) => {
    if (message?.role !== "user") return false;

    const key = (message.content || "").trim();
    if (!key) return false;

    const pending = pendingUserEchoRef.current;
    const queue = pending.get(key) || [];
    const now = Date.now();
    const activeQueue = queue.filter((expiresAt) => expiresAt > now);

    if (!activeQueue.length) {
      pending.delete(key);
      return false;
    }

    activeQueue.shift();
    if (activeQueue.length) {
      pending.set(key, activeQueue);
    } else {
      pending.delete(key);
    }

    return true;
  }, []);

  const applyIncomingMessages = React.useCallback(
    (incomingMessages, options = {}) => {
      const normalized = normalizeMessages(incomingMessages, []);
      const visibleMessages = normalized.filter((message) => !consumePendingUserEcho(message));

      if (!visibleMessages.length) return;

      if (options.forceStickToBottom) {
        shouldStickToBottomRef.current = true;
      }

      setMessages((current) => upsertMessagesById(current, visibleMessages));
    },
    [consumePendingUserEcho]
  );

  const handleLoadServerLogs = React.useCallback(
    async (overrides = {}) => {
      try {
        setLoadingServerLogs(true);
        const nextFilters = {
          limit: 80,
          status: "",
          source: "",
          action: "",
          sessionKey: "",
          q: "",
          ...currentLogFilters,
          ...overrides,
        };

        const params = new URLSearchParams();
        Object.entries(nextFilters).forEach(([key, value]) => {
          if (value !== undefined && value !== null && `${value}`.trim() !== "") {
            params.set(key, `${value}`);
          }
        });

        const data = await fetchJsonOrThrow(`${backendOrigin}/api/activity-logs?${params.toString()}`, {}, "日志读取失败");
        setServerLogs(normalizeServerLogs(data.logs || []));
        setServerLogMeta({
          total: data.total || 0,
          matched: data.matched || 0,
          filters: data.filters || nextFilters,
          facets: data.facets || { statuses: [], sources: [], actions: [] },
        });
        if (Object.prototype.hasOwnProperty.call(overrides, "q")) {
          setLogSearchInput(data.filters?.q || nextFilters.q || "");
        }
      } catch (error) {
        pushActivityLog("后端日志读取失败", error.message, "warn");
      } finally {
        setLoadingServerLogs(false);
      }
    },
    [backendOrigin, currentLogFilters, pushActivityLog]
  );

  const handleLoadSystemOverview = React.useCallback(async () => {
    try {
      setLoadingSystemOverview(true);
      const data = await fetchJsonOrThrow(`${backendOrigin}/api/system/overview`, {}, "系统概览读取失败");
      setSystemOverview(data);
    } catch (error) {
      pushActivityLog("系统概览读取失败", error.message, "warn");
    } finally {
      setLoadingSystemOverview(false);
    }
  }, [backendOrigin, pushActivityLog]);

  const handleLoadAgents = React.useCallback(
    async (options = {}) => {
      const { silent = false } = options;

      if (mode === "mock") return;

      try {
        setLoadingAgents(true);
        if (!silent) {
          pushActivityLog("同步 Agent 列表", agentsEndpoint);
        }

        const data = await fetchJsonOrThrow(agentsEndpoint, {}, "Agent 列表读取失败");

        const normalized = normalizeAgents(data.agents || []).sort(compareAgentsByStableOrder);
        setOpenClawAgents((current) => (areAgentListsEquivalent(current, normalized) ? current : normalized));
        const nextSummary = {
          total: data.summary?.total || normalized.length,
          activeCount: data.summary?.activeCount || 0,
          workingCount: data.summary?.workingCount || 0,
          recentCount: data.summary?.recentCount || 0,
          idleCount: data.summary?.idleCount || 0,
          errorCount: data.summary?.errorCount || 0,
          sessionCount: data.summary?.sessionCount || 0,
          defaultAgentId: data.summary?.defaultAgentId || data.defaultId || "",
        };
        setAgentSummary((current) => (areAgentSummariesEquivalent(current, nextSummary) ? current : nextSummary));
        setSelectedAgentId((current) => {
          if (current && normalized.some((agent) => agent.id === current)) return current;
          return agentId || data.summary?.defaultAgentId || data.defaultId || normalized.find((agent) => agent.isDefault)?.id || normalized[0]?.id || "";
        });
        if (!agentId && (data.summary?.defaultAgentId || data.defaultId)) {
          updateConfig("agentId", data.summary?.defaultAgentId || data.defaultId);
        }
        if (!silent) {
          pushActivityLog("Agent 列表已更新", `OpenClaw 返回 ${normalized.length} 个 Agent`, "ok");
        }
      } catch (error) {
        if (!silent) {
          pushActivityLog("Agent 列表读取失败", error.message, "warn");
        }
      } finally {
        setLoadingAgents(false);
      }
    },
    [agentId, agentsEndpoint, mode, pushActivityLog, updateConfig]
  );

  function handleApplyLogSearch() {
    void handleLoadServerLogs({ q: logSearchInput.trim() });
  }

  function handleResetLogFilters() {
    setLogSearchInput("");
    void handleLoadServerLogs({
      limit: 80,
      status: "",
      source: "",
      action: "",
      sessionKey: "",
      q: "",
    });
  }

  async function handleCheckHealth() {
    try {
      setConnecting(true);
      setGatewayCheckState("checking");
      setGatewayCheckError("");
      pushActivityLog("开始健康检查", healthEndpoint);

      const data = await fetchJsonOrThrow(healthEndpoint, {}, "健康检查失败");
      const checkedAt = nowTime();

      setConnectionInfo(data);
      setGatewayCheckedAt(checkedAt);
      setGatewayCheckState("success");
      setConfig((current) => ({
        ...current,
        sessionKey: current.sessionKey || data.targetSessionKey || current.sessionKey,
        agentId: current.agentId || data.targetAgentId || current.agentId,
      }));

      pushSystemMessage("网关检查成功，已连接到 ClawLink 后端。");
      pushActivityLog("健康检查成功", data.gatewayBaseUrl || "后端已在线", "ok");
    } catch (error) {
      setGatewayCheckedAt(nowTime());
      setGatewayCheckState("error");
      setGatewayCheckError(error.message);
      pushSystemMessage(`网关检查失败：${error.message}`);
      pushActivityLog("健康检查失败", error.message, "warn");
    } finally {
      setConnecting(false);
      refreshOperationalData();
    }
  }

  async function handleLoadSessions(options = {}) {
    const { silent = false, refresh = true } = options;

    try {
      setLoadingSessions(true);
      if (!silent) {
        pushActivityLog("拉取会话列表", sessionsEndpoint);
      }

      const data = await fetchJsonOrThrow(sessionsEndpoint, {}, "会话列表加载失败");

      const normalized = normalizeSessions(data.sessions || []);
      setSessions(normalized);
      setConfig((current) => {
        const nextSessionKey = current.sessionKey || connectionInfo?.targetSessionKey || "";
        const nextAgentId = current.agentId || connectionInfo?.targetAgentId || "";
        if (nextSessionKey === current.sessionKey && nextAgentId === current.agentId) {
          return current;
        }
        return {
          ...current,
          sessionKey: nextSessionKey,
          agentId: nextAgentId,
        };
      });
      if (!silent) {
        pushActivityLog("会话列表已更新", `当前共 ${normalized.length} 个会话`, "ok");
      }
    } catch (error) {
      if (!silent) {
        pushActivityLog("会话列表加载失败", error.message, "warn");
      }
    } finally {
      setLoadingSessions(false);
      if (refresh) {
        refreshOperationalData({ logs: true, overview: true, agents: false });
      }
    }
  }

  async function handleLoadHistory(targetKey = sessionKey, options = {}) {
    const { silent = false, refresh = true } = options;

    if (!targetKey) {
      if (!silent) {
        pushSystemMessage("请先选择会话或填写 sessionKey。");
        pushActivityLog("历史消息加载取消", "缺少 sessionKey", "warn");
      }
      return;
    }

    try {
      setLoadingHistory(true);
      if (!silent) {
        pushActivityLog("拉取会话历史", targetKey);
      }

      const data = await fetchJsonOrThrow(
        `${historyEndpoint}?sessionKey=${encodeURIComponent(targetKey)}`,
        {},
        "历史消息加载失败"
      );

      const normalizedMessages = normalizeMessages(data.messages || [], seedMessages);
      setMessages(normalizedMessages);
      updateConfig("sessionKey", targetKey);
      if (!silent) {
        pushActivityLog("历史消息已更新", `${targetKey} · ${normalizedMessages.length} 条`, "ok");
      }
    } catch (error) {
      if (!silent) {
        pushSystemMessage(`历史消息加载失败：${error.message}`);
        pushActivityLog("历史消息加载失败", error.message, "warn");
      }
    } finally {
      setLoadingHistory(false);
      if (refresh) {
        refreshOperationalData({ logs: true, overview: true, agents: false });
      }
    }
  }

  async function handleSyncHistorySilently(targetKey = sessionKey) {
    if (!targetKey) return;

    try {
      const data = await fetchJsonOrThrow(
        `${historyEndpoint}?sessionKey=${encodeURIComponent(targetKey)}`,
        {},
        "历史消息同步失败"
      );

      const normalizedMessages = normalizeMessages(data.messages || [], seedMessages);
      setMessages((current) => (areMessageListsEquivalent(current, normalizedMessages) ? current : normalizedMessages));
    } catch {}
  }

  async function handleCreateSession() {
    try {
      setConnecting(true);
      shouldStickToBottomRef.current = true;
      pushActivityLog("创建新会话", sessionEndpoint);

      const data = await fetchJsonOrThrow(
        sessionEndpoint,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            label: "ClawLink Console",
          }),
        },
        "会话创建失败"
      );
      const nextSessionKey = extractSessionKey(data);

      if (nextSessionKey) {
        updateConfig("sessionKey", nextSessionKey);
        updateConfig("agentId", data.agentId || agentId || connectionInfo?.targetAgentId || "");
        setMessages([]);
        pushSystemMessage(`会话已创建：${nextSessionKey}`);
        pushActivityLog("会话创建成功", nextSessionKey, "ok");
        void handleLoadSessions({ silent: true, refresh: false });
        void handleLoadHistory(nextSessionKey, { silent: true, refresh: false });
      } else {
        pushSystemMessage("已调用创建会话接口，但暂未从返回值中解析到 sessionKey。你也可以手动填写 sessionKey。");
        pushActivityLog("会话创建已返回", "未解析到 sessionKey", "warn");
      }
    } catch (error) {
      pushSystemMessage(`创建会话失败：${error.message}`);
      pushActivityLog("会话创建失败", error.message, "warn");
    } finally {
      setConnecting(false);
      refreshOperationalData();
    }
  }

  function handleSetDefaultAgent(targetAgentId = selectedAgent?.id || "") {
    if (!targetAgentId) return;
    setSelectedAgentId(targetAgentId);
    updateConfig("agentId", targetAgentId);
    pushActivityLog("默认 Agent 已切换", targetAgentId, "ok");
  }

  async function handleCreateAgentSession(targetAgent = selectedAgent) {
    if (!targetAgent?.id) {
      pushActivityLog("创建 Agent 会话取消", "未选择 Agent", "warn");
      return;
    }

    try {
      setConnecting(true);
      shouldStickToBottomRef.current = true;
      const label = `${dispatchTitle || "ClawLink 正式调度"} · ${targetAgent.name || targetAgent.id}`;
      pushActivityLog("创建 Agent 会话", `${targetAgent.id} · ${label}`);

      const data = await fetchJsonOrThrow(
        sessionEndpoint,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            label,
            agentId: targetAgent.id,
          }),
        },
        "Agent 会话创建失败"
      );
      const nextSessionKey = extractSessionKey(data);

      if (!nextSessionKey) throw new Error("已创建会话，但未解析到 sessionKey");

      setConfig((current) => ({
        ...current,
        agentId: targetAgent.id,
        sessionKey: nextSessionKey,
      }));
      setSelectedAgentId(targetAgent.id);
      setActiveView("chat");
      setMessages([]);
      pushSystemMessage(`已为 ${targetAgent.name || targetAgent.id} 创建会话：${nextSessionKey}`);
      pushActivityLog("Agent 会话创建成功", nextSessionKey, "ok");
      void handleLoadAgents({ silent: true });
      void handleLoadSessions({ silent: true, refresh: false });
      void handleLoadHistory(nextSessionKey, { silent: true, refresh: false });
    } catch (error) {
      pushSystemMessage(`Agent 会话创建失败：${error.message}`);
      pushActivityLog("Agent 会话创建失败", error.message, "warn");
    } finally {
      setConnecting(false);
      refreshOperationalData();
    }
  }

  async function handleDispatchToAgent() {
    const targetAgent = selectedAgent;
    const message = dispatchMessage.trim();

    if (!targetAgent?.id) {
      pushActivityLog("任务派发取消", "未选择 Agent", "warn");
      return;
    }

    if (!message) {
      pushActivityLog("任务派发取消", "请先填写任务指令", "warn");
      return;
    }

    try {
      setDispatchingAgent(true);
      shouldStickToBottomRef.current = true;
      pushActivityLog("派发 Agent 任务", `${targetAgent.id} · ${shortenText(message, 80)}`);

      const data = await fetchJsonOrThrow(
        agentDispatchEndpoint,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            agentId: targetAgent.id,
            label: dispatchTitle || `ClawLink Dispatch · ${targetAgent.name || targetAgent.id}`,
            message,
          }),
        },
        "任务派发失败"
      );
      const nextSessionKey = extractSessionKey(data, sessionKey);

      setConfig((current) => ({
        ...current,
        agentId: targetAgent.id,
        sessionKey: nextSessionKey || current.sessionKey,
      }));
      setSelectedAgentId(targetAgent.id);
      setDispatchMessage("");
      setActiveView("chat");
      pushSystemMessage(`已派发给 ${targetAgent.name || targetAgent.id}：${nextSessionKey || "等待 sessionKey"}`);
      pushActivityLog("Agent 任务已派发", nextSessionKey || targetAgent.id, "ok");
      if (nextSessionKey) {
        void handleLoadHistory(nextSessionKey, { silent: true, refresh: false });
      }
      void handleLoadAgents({ silent: true });
      void handleLoadSessions({ silent: true, refresh: false });
    } catch (error) {
      pushSystemMessage(`任务派发失败：${error.message}`);
      pushActivityLog("任务派发失败", error.message, "warn");
    } finally {
      setDispatchingAgent(false);
      refreshOperationalData();
    }
  }

  async function handleSend(event) {
    event.preventDefault();
    if (!canSend) return;

    const text = input.trim();
    const userMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: text,
      parts: [{ id: "user-text", type: "text", text }],
      time: nowTime(),
    };

    shouldStickToBottomRef.current = true;
    setMessages((current) => [...current, userMessage]);
    setInput("");

    if (mode === "mock") {
      pushActivityLog("演示消息发送", text, "ok");
      setTimeout(() => {
        setMessages((current) => [
          ...current,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content: `已收到：${text}\n\n下一步把这里接到 OpenClaw 的会话发送接口即可，ClawLink 就能真正工作了。`,
            parts: [
              {
                id: "assistant-text",
                type: "text",
                text: `已收到：${text}\n\n下一步把这里接到 OpenClaw 的会话发送接口即可，ClawLink 就能真正工作了。`,
              },
            ],
            time: nowTime(),
          },
        ]);
      }, 250);
      return;
    }

    try {
      setSending(true);
      const targetSessionKey = sessionKey || connectionInfo?.targetSessionKey || "";
      const targetAgentId = agentId || connectionInfo?.targetAgentId || "";
      const requestBody = {
        message: text,
        sessionKey: targetSessionKey,
        agentId: targetAgentId,
        idempotencyKey: crypto.randomUUID(),
        messages: [...messages, userMessage].map(({ role, content }) => ({ role, content })),
      };

      async function sendBlockingFallback() {
        const data = await fetchJsonOrThrow(
          endpoint,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(requestBody),
          },
          "消息发送失败"
        );

        setMessages((current) => [
          ...current,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content: data.reply || "接口已连接，但返回内容为空。",
            parts: [
              {
                id: "assistant-text",
                type: "text",
                text: data.reply || "接口已连接，但返回内容为空。",
              },
            ],
            time: nowTime(),
          },
        ]);

        const nextSessionKey = extractSessionKey(data);
        if (nextSessionKey && !sessionKey) {
          updateConfig("sessionKey", nextSessionKey);
        }
        pushActivityLog("消息发送成功", data.reply || "接口返回为空", "ok");
        await handleLoadSessions({ silent: true, refresh: false });
      }

      rememberPendingUserEcho(text);
      pushActivityLog("发送消息", `${targetSessionKey || "未指定 sessionKey"} · ${text}`);

      let streamAccepted = false;

      try {
        await fetchEventStream(buildChatStreamEndpoint(endpoint), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(requestBody),
        }, {
          fallbackMessage: "流式消息发送失败",
          onEvent: (eventName, payload) => {
            if (eventName === "accepted") {
              streamAccepted = true;
              const nextSessionKey = extractSessionKey(payload, targetSessionKey);
              if (nextSessionKey && !sessionKey) {
                updateConfig("sessionKey", nextSessionKey);
              }
              return;
            }

            if (eventName === "message" && payload?.message) {
              applyIncomingMessages([payload.message], { forceStickToBottom: true });
              return;
            }

            if (eventName === "history" && Array.isArray(payload?.messages)) {
              const normalizedHistory = normalizeMessages(payload.messages, []);
              setMessages(normalizedHistory);
              shouldStickToBottomRef.current = true;
              return;
            }

            if (eventName === "error") {
              throw new Error(payload?.error || "流式消息发送失败");
            }
          },
        });
      } catch (streamError) {
        if (streamAccepted) {
          throw streamError;
        }

        pushActivityLog("流式发送不可用，切换普通发送", streamError.message, "warn");
        await sendBlockingFallback();
        return;
      }

      pushActivityLog("消息流式完成", targetSessionKey || "当前会话", "ok");
      await handleLoadSessions({ silent: true, refresh: false });
    } catch (error) {
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "system",
          content: `连接失败：${error.message}`,
          parts: [{ id: "system-text", type: "text", text: `连接失败：${error.message}` }],
          time: nowTime(),
        },
      ]);
      pushActivityLog("消息发送失败", error.message, "warn");
    } finally {
      setSending(false);
      refreshOperationalData({ logs: true, overview: true, agents: false });
    }
  }

  const runOperationalRefresh = React.useCallback(
    async (request = DEFAULT_OPERATIONAL_REFRESH) => {
      const tasks = [];

      if (request.logs) tasks.push(handleLoadServerLogs());
      if (request.overview) tasks.push(handleLoadSystemOverview());
      if (request.agents) tasks.push(handleLoadAgents({ silent: true }));

      await Promise.allSettled(tasks);
    },
    [handleLoadAgents, handleLoadServerLogs, handleLoadSystemOverview]
  );

  const refreshOperationalData = React.useCallback(
    (request = DEFAULT_OPERATIONAL_REFRESH) => {
      const refreshState = operationalRefreshRef.current;
      refreshState.pending = mergeOperationalRefreshRequest(refreshState.pending, request);

      if (typeof window === "undefined") {
        if (!refreshState.inFlight) {
          refreshState.inFlight = true;
          void runOperationalRefresh(refreshState.pending).finally(() => {
            refreshState.pending = null;
            refreshState.inFlight = false;
          });
        }
        return;
      }

      if (refreshState.timer || refreshState.inFlight) return;

      refreshState.timer = window.setTimeout(() => {
        refreshState.timer = null;
        if (refreshState.inFlight) return;

        const nextRequest = refreshState.pending || DEFAULT_OPERATIONAL_REFRESH;
        refreshState.pending = null;
        refreshState.inFlight = true;

        void runOperationalRefresh(nextRequest).finally(() => {
          refreshState.inFlight = false;
          if (refreshState.pending) {
            refreshOperationalData(refreshState.pending);
          }
        });
      }, 120);
    },
    [runOperationalRefresh]
  );

  function handleResetSettings() {
    setConfig(DEFAULT_CONFIG);
    setConnectionInfo(null);
    pushActivityLog("已恢复默认设置", "接口地址与本地默认值已重置", "warn");
  }

  function handleClearLogs() {
    setActivityLogs([]);
  }

  function handleOpenSession(targetKey) {
    shouldStickToBottomRef.current = true;
    setActiveView("chat");
    handleLoadHistory(targetKey);
  }

  function handleApplyScenePreset(presetId, focusId) {
    setSceneCameraPreset(presetId);
    if (focusId) {
      if (presetId === "agents" && selectedAgent?.id) {
        setSceneFocusId(`agent-${selectedAgent.id}`);
      } else {
        setSceneFocusId(focusId);
      }
    }
  }

  const getSceneViewTarget = React.useCallback((targetId) => {
    if (!targetId) return "overview";
    if (targetId.startsWith("agent-")) return "agents";
    if (targetId === "gateway") return "nodes";
    if (targetId === "chat" || targetId === "history") return "chat";
    if (targetId === "sessions") return "sessions";
    if (targetId === "logs") return "logs";
    if (targetId === "agents") return "agents";
    return "overview";
  }, []);

  const getScenePresetForId = React.useCallback((targetId) => {
    if (!targetId) return "overview";
    if (targetId === "gateway") return "gateway";
    if (targetId === "logs") return "operations";
    if (targetId === "agents" || targetId.startsWith("agent-")) return "agents";
    return "overview";
  }, []);

  const handleFocusSceneModule = React.useCallback(
    (moduleId) => {
      if (moduleId.startsWith("agent-")) {
        setSelectedAgentId(moduleId.replace(/^agent-/, ""));
        setIsSceneAgentDrawerOpen(true);
      }
      setSceneFocusId(moduleId);
      setSceneCameraPreset(getScenePresetForId(moduleId));
    },
    [getScenePresetForId]
  );

  function handleMessageStageScroll(event) {
    const stage = event.currentTarget;
    const distanceToBottom = stage.scrollHeight - stage.scrollTop - stage.clientHeight;
    const isNearBottom = distanceToBottom <= 96;
    shouldStickToBottomRef.current = isNearBottom;
    setIsMessageStageAtBottom(isNearBottom);
  }

  function handleJumpToLatest() {
    shouldStickToBottomRef.current = true;
    setIsMessageStageAtBottom(true);
    scrollMessagesToBottom("smooth");
  }

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  }, [config]);

  React.useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.dataset.theme = theme === "light" ? "light" : "dark";
  }, [theme]);

  React.useEffect(() => {
    if (mode === "live") {
      void handleLoadSessions({ silent: true, refresh: false });
      void handleLoadAgents({ silent: true });
    }
  }, [mode]);

  React.useEffect(() => {
    if (mode !== "live" || hasAutoHealthChecked.current) return;
    hasAutoHealthChecked.current = true;
    void handleCheckHealth();
  }, [mode]);

  React.useEffect(() => {
    if (mode !== "live" || !sessionKey || lastAutoLoadedSessionKey.current === sessionKey) return;
    lastAutoLoadedSessionKey.current = sessionKey;
    shouldStickToBottomRef.current = true;
    void handleLoadHistory(sessionKey);
  }, [mode, sessionKey]);

  React.useLayoutEffect(() => {
    if (activeView !== "chat") return undefined;
    shouldStickToBottomRef.current = true;
    setIsMessageStageAtBottom(true);

    if (typeof window === "undefined") {
      scrollMessagesToBottom();
      chatInputRef.current?.focus?.({ preventScroll: true });
      return undefined;
    }

    const timers = [0, 120, 320, 640].map((delay) =>
      window.setTimeout(() => {
        if (!shouldStickToBottomRef.current) return;
        scrollMessagesToBottom();
        setIsMessageStageAtBottom(true);
      }, delay)
    );

    const frame = window.requestAnimationFrame(() => {
      chatInputRef.current?.focus?.({ preventScroll: true });
    });

    return () => {
      window.cancelAnimationFrame(frame);
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [activeView, loadingHistory, scrollMessagesToBottom, sessionKey]);

  React.useLayoutEffect(() => {
    if (!messages.length || !shouldStickToBottomRef.current) return undefined;
    if (typeof window === "undefined") {
      scrollMessagesToBottom();
      return undefined;
    }

    const frame = window.requestAnimationFrame(() => {
      scrollMessagesToBottom();
      setIsMessageStageAtBottom(true);
    });

    return () => window.cancelAnimationFrame(frame);
  }, [messages, sessionKey, scrollMessagesToBottom]);

  React.useEffect(() => {
    if (mode !== "live" || activeView !== "chat" || !sessionKey) {
      setSessionStreamState("idle");
      return undefined;
    }

    if (typeof window === "undefined" || typeof window.EventSource === "undefined") {
      setSessionStreamState("error");
      return undefined;
    }

    const source = new window.EventSource(buildSessionEventsEndpoint(backendOrigin, sessionKey));
    let closed = false;

    setSessionStreamState("connecting");

    function parseEventPayload(event) {
      if (!event.data) return {};
      try {
        return JSON.parse(event.data);
      } catch {
        return {};
      }
    }

    function handleReady() {
      if (!closed) {
        setSessionStreamState("connected");
      }
    }

    function handleMessageEvent(event) {
      const payload = parseEventPayload(event);
      if (payload?.message) {
        applyIncomingMessages([payload.message]);
      }
    }

    function handleHistoryEvent(event) {
      const payload = parseEventPayload(event);
      if (Array.isArray(payload?.messages)) {
        setMessages(normalizeMessages(payload.messages, []));
      }
    }

    function handleErrorEvent(event) {
      if (event.data) {
        setSessionStreamState("error");
        source.close();
        return;
      }

      if (!closed) {
        setSessionStreamState("connecting");
      }
    }

    source.addEventListener("ready", handleReady);
    source.addEventListener("message", handleMessageEvent);
    source.addEventListener("history", handleHistoryEvent);
    source.addEventListener("error", handleErrorEvent);

    return () => {
      closed = true;
      source.close();
    };
  }, [activeView, applyIncomingMessages, backendOrigin, mode, sessionKey]);

  React.useEffect(() => {
    if (mode !== "live" || activeView !== "chat" || !sessionKey || sessionStreamState === "connected") return undefined;

    const timer = window.setInterval(() => {
      if (document.hidden) return;
      void handleSyncHistorySilently(sessionKey);
    }, 10000);

    return () => window.clearInterval(timer);
  }, [activeView, historyEndpoint, mode, sessionKey, sessionStreamState]);

  React.useEffect(() => {
    if (!isSessionDrawerOpen || typeof window === "undefined") return undefined;

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        setIsSessionDrawerOpen(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isSessionDrawerOpen]);

  React.useEffect(() => {
    if (!isSceneAgentDrawerOpen || typeof window === "undefined") return undefined;

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        setIsSceneAgentDrawerOpen(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isSceneAgentDrawerOpen]);

  React.useEffect(() => {
    if (activeView !== "browser" && isSceneAgentDrawerOpen) {
      setIsSceneAgentDrawerOpen(false);
    }
  }, [activeView, isSceneAgentDrawerOpen]);

  React.useEffect(() => {
    if (activeView === "overview" || activeView === "logs" || activeView === "nodes" || activeView === "browser" || activeView === "agents") {
      refreshOperationalData();
    }
  }, [activeView, refreshOperationalData]);

  React.useEffect(() => {
    return () => {
      const refreshState = operationalRefreshRef.current;
      if (refreshState.timer && typeof window !== "undefined") {
        window.clearTimeout(refreshState.timer);
      }
      refreshState.timer = null;
      refreshState.pending = null;
      refreshState.inFlight = false;
    };
  }, []);

  function renderOverviewView() {
    const overviewRecentMessages = recentMessages.slice().reverse();
    const overviewSuggestions = [
      !connectionInfo && mode !== "mock"
        ? {
            icon: RefreshCw,
            title: "先检查网关",
            detail: "确认任务网关在线后，再继续刷新会话或进入聊天。",
          }
        : {
            icon: MessagesSquare,
            title: "继续当前会话",
            detail: sessionKey ? "当前会话已经就绪，直接进入聊天继续处理。" : "先创建一个新会话，再进入聊天继续操作。",
          },
      {
        icon: Bot,
        title: agentId ? "默认 Agent 已就绪" : "补齐默认 Agent",
        detail: agentId ? `当前默认 Agent：${agentId}` : "建议在设置页或 Agent 调度页补齐默认 Agent。",
      },
      {
        icon: Activity,
        title: "关注最新活动",
        detail: latestServerLog ? `${latestServerLog.title} · ${latestServerLog.time}` : "当前还没有新的后端活动日志。",
      },
    ];

    return (
      <div className="overview-workspace">
        <section className="hero-panel overview-hero-panel">
          <div className="overview-hero-layout">
            <div className="overview-hero-main">
              <div className="overview-hero-brand">
                <div className="overview-hero-brand-chip">
                  <div className="overview-hero-brand-mark-shell">
                    <img src={clawLinkMark} alt="ClawLink" className="overview-hero-logo" draggable="false" />
                  </div>
                  <div className="overview-hero-brand-copy">
                    <div className="overview-hero-brand-name">{BRANDING.name}</div>
                    <div className="overview-hero-brand-label">{BRANDING.shellLabel}</div>
                  </div>
                </div>
              </div>
              <div className="flex min-w-0 items-start gap-4">
                <div className="hero-icon">{greeting.emoji}</div>
                <div className="min-w-0">
                  <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[var(--text-primary)] sm:text-4xl">{greeting.title}</h1>
                  <p className="mt-3 max-w-3xl text-sm leading-7 text-[var(--text-secondary)]">
                    {BRANDING.name} 负责承接底层运行网关，把聊天控制、会话列表、工具日志和后续节点、浏览器、任务能力统一收拢成一个任务中枢。
                  </p>
                </div>
              </div>

              <div className="overview-hero-meta">
                <span className="overview-meta-chip">
                  <Bot className="h-4 w-4 text-[var(--accent)]" />
                  {mode === "mock" ? "演示模式" : "正式连接"}
                </span>
                <span className="overview-meta-chip">{sessions.length} 个会话</span>
                <span className="overview-meta-chip">{activityLogs.length} 条活动日志</span>
                <span className="overview-meta-chip">{currentDate}</span>
              </div>
            </div>

            <div className="overview-hero-side">
              <div className="overview-hero-status-card">
                <div className="overview-hero-status-top">
                  <StatusBadge label={BRANDING.gatewayName} value={connectionBadgeValue} tone={connectionTone} pulse={connectionBadgePulse} />
                  <button
                    type="button"
                    className="overview-health-button"
                    onClick={handleCheckHealth}
                    disabled={connecting}
                    title={connecting ? "正在检查网关" : "检查网关"}
                  >
                    <RefreshCw className={`h-4 w-4 ${connecting ? "animate-spin" : ""}`} />
                    <span>{connecting ? "检查中..." : "检查网关"}</span>
                  </button>
                </div>

                <div className={`overview-hero-status-note ${connectionRuntimeState}`}>{connectionStatusNote}</div>

                <div className="overview-hero-status-meta">
                  <span>{connectionStatusMetaPrimary}</span>
                  <span>{connectionStatusMetaSecondary}</span>
                </div>
              </div>

              <div className="overview-hero-stat-grid">
                <div className="overview-hero-stat">
                  <span>连接</span>
                  <strong>{connectionState}</strong>
                </div>
                <div className="overview-hero-stat">
                  <span>会话</span>
                  <strong>{sessionKey || "未选择"}</strong>
                </div>
                <div className="overview-hero-stat">
                  <span>Agent</span>
                  <strong>{agentId || "未设置"}</strong>
                </div>
                <div className="overview-hero-stat">
                  <span>日志</span>
                  <strong>{serverLogs.length || activityLogs.length}</strong>
                </div>
              </div>
            </div>
          </div>
        </section>

        <div className="overview-metrics-grid">
          <MetricCard
            label="连接状态"
            value={connectionState}
            hint={
              <div className="metric-hint-stack">
                <span className="metric-hint-emphasis">{connectionStatusNote}</span>
                <span>{connectionStatusMetaPrimary}</span>
                <span>{connectionStatusMetaSecondary}</span>
              </div>
            }
            icon={PlugZap}
            tone={connectionTone}
          />
          <MetricCard
            label="当前会话"
            value={sessionKey || "未选择"}
            hint="聊天页和设置页共用同一个 sessionKey。"
            icon={MessagesSquare}
            tone={sessionKey ? "ok" : "warn"}
          />
          <MetricCard
            label="活动日志"
            value={serverLogs.length || activityLogs.length}
            hint={
              latestServerLog
                ? `${latestServerLog.title} · ${latestServerLog.time}`
                : latestLog
                  ? `${latestLog.title} · ${latestLog.time}`
                  : "暂无活动日志。"
            }
            icon={Activity}
          />
          <MetricCard
            label="当前 Agent"
            value={agentId || "未设置"}
            hint="正式发送与创建会话会优先使用当前 Agent。"
            icon={Bot}
            tone={agentId ? "ok" : "warn"}
          />
        </div>

        <div className="overview-main-grid">
          <SectionCard
            title="工作台"
            description="首页只保留最常用动作和模块入口。"
            icon={Sparkles}
            className="overview-workbench-card"
          >
            <div className="overview-action-grid">
              <QuickActionButton
                label={connecting ? "检查中..." : "检查网关"}
                icon={RefreshCw}
                tone="secondary"
                disabled={connecting}
                onClick={handleCheckHealth}
                loading={connecting}
              />
              <QuickActionButton
                label="刷新会话"
                icon={RefreshCw}
                tone="secondary"
                disabled={loadingSessions || mode === "mock"}
                onClick={handleLoadSessions}
                loading={loadingSessions}
              />
              <QuickActionButton
                label="创建会话"
                icon={Plus}
                tone="primary"
                disabled={connecting || mode === "mock"}
                onClick={handleCreateSession}
              />
              <QuickActionButton
                label="进入聊天"
                icon={MessagesSquare}
                tone="success"
                disabled={false}
                onClick={() => setActiveView("chat")}
              />
            </div>

            <div className="overview-module-grid">
              {overviewModules.map((item) => (
                <OverviewModuleCard key={item.key} item={item} onOpen={() => setActiveView(item.key)} />
              ))}
            </div>
          </SectionCard>

          <SectionCard
            title="当前上下文"
            description="把会话摘要、最近消息和下一步建议收在一处。"
            icon={FolderOpen}
            className="overview-context-panel"
          >
            <div className="overview-context-stack">
              <div className="overview-context-card highlight">
                <div className="overview-context-label">Session</div>
                <div className="overview-context-title">{sessionKey || "当前尚未选择会话"}</div>
                <div className="overview-context-text">
                  {currentSession?.lastMessage || "可以先检查网关、创建会话，再切到聊天页继续操作。"}
                </div>
              </div>

              <div className="overview-context-card">
                <div className="overview-context-label">最近消息</div>
                <div className="overview-recent-feed">
                  {overviewRecentMessages.length ? (
                    overviewRecentMessages.map((message) => (
                      <div key={message.id} className="overview-recent-item">
                        <div className="overview-recent-head">
                          <span className="overview-recent-role">{message.role}</span>
                          <span>{message.time}</span>
                        </div>
                        <div className="overview-recent-text">{message.content}</div>
                      </div>
                    ))
                  ) : (
                    <div className="overview-empty-note">当前还没有消息，进入聊天页后可以直接开始新对话。</div>
                  )}
                </div>
              </div>

              <div className="overview-context-card">
                <div className="overview-context-label">下一步建议</div>
                <div className="overview-suggestion-list">
                  {overviewSuggestions.map((item) => {
                    const Icon = item.icon;
                    return (
                      <div key={item.title} className="overview-suggestion-item">
                        <div className="overview-suggestion-icon">
                          <Icon className="h-4 w-4" />
                        </div>
                        <div>
                          <div className="overview-suggestion-title">{item.title}</div>
                          <div className="overview-suggestion-text">{item.detail}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </SectionCard>
        </div>
      </div>
    );
  }

  function renderChatView() {
    return (
      <div className="chat-workspace">
        <SessionDrawer
          open={isSessionDrawerOpen}
          sessions={sessions}
          activeSessionKey={sessionKey}
          loading={loadingSessions}
          mode={mode}
          onClose={() => setIsSessionDrawerOpen(false)}
          onRefresh={handleLoadSessions}
          onOpenSession={handleOpenSession}
        />

        <section className="chat-main-panel app-panel">
          <div className="chat-main-header">
            <div className="chat-header-copy min-w-0">
              <div className="topbar-eyebrow">Live Chat</div>
              <h2 className="chat-view-title text-[var(--text-primary)]">
                {currentSession?.label || "ClawLink 对话"}
              </h2>
              <div className="chat-view-meta text-xs text-[var(--text-secondary)]">
                <span className="session-key-pill">{sessionKey || "未选择会话"}</span>
                <span>{messages.length} 条消息</span>
                <span>·</span>
                <span>{chatSyncLabel}</span>
              </div>
            </div>

            <div className="chat-header-actions">
              <QuickActionButton
                label="会话列表"
                icon={FolderOpen}
                tone="secondary"
                disabled={false}
                onClick={() => setIsSessionDrawerOpen(true)}
              />
              <QuickActionButton
                label="新会话"
                icon={Plus}
                tone="primary"
                disabled={connecting || mode === "mock"}
                onClick={handleCreateSession}
              />
              <QuickActionButton
                label={loadingHistory ? "同步中..." : "同步"}
                icon={RefreshCw}
                tone="secondary"
                disabled={loadingHistory || mode === "mock"}
                onClick={() => handleLoadHistory()}
                loading={loadingHistory}
              />
            </div>
          </div>

          <div ref={messageStageRef} className="chat-message-stage" onScroll={handleMessageStageScroll}>
            {messages.length ? (
              <div className="chat-message-list space-y-4">
                {messages.map((message) => (
                  <MessageBubble key={message.id} message={message} />
                ))}
              </div>
            ) : (
              <div className="empty-chat-state">
                <MessagesSquare className="h-8 w-8 text-[var(--accent)]" />
                <div>
                  <div className="text-lg font-semibold text-[var(--text-primary)]">开始一个新对话</div>
                  <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
                    当前会话还没有消息。输入第一条指令后，ClawLink 会持续同步 OpenClaw 的最新回复。
                  </p>
                </div>
              </div>
            )}

            {messages.length && !isMessageStageAtBottom ? (
              <button type="button" className="chat-jump-latest" onClick={handleJumpToLatest}>
                <MessagesSquare className="h-4 w-4" />
                <span>查看最新消息</span>
              </button>
            ) : null}
          </div>

          <form onSubmit={handleSend} className="chat-composer-form">
            <div className="chat-editor">
              <textarea
                ref={chatInputRef}
                value={input}
                onChange={(event) => setInput(event.target.value)}
                rows={2}
                placeholder="给 ClawLink 发消息，比如：总结当前会话、继续执行刚才任务、列出最近工具调用…"
                className="app-textarea chat-input"
              />

              <div className="chat-editor-footer">
                <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--text-secondary)]">
                  <span className={`live-dot ${connectionDotState}`} />
                  <span>{chatConnectionLabel}</span>
                  <span>·</span>
                  <span>{sessionKey ? "消息会发送到当前会话" : "请先选择或创建会话"}</span>
                </div>
                <button type="submit" disabled={!canSend} className="send-button">
                  <SendHorizontal className="h-4 w-4" />
                  <span>{sending ? "发送中..." : "发送消息"}</span>
                </button>
              </div>
            </div>
          </form>
        </section>

        <div className="chat-side-column">
          <SectionCard title="连接概览" description="借鉴 dashboard 的状态卡片组织方式。" icon={PlugZap}>
            <div className="space-y-3">
              <StatusBadge label="运行模式" value={mode === "mock" ? "Mock" : "Live"} tone="ok" />
              <StatusBadge label="连接状态" value={connectionState} tone={connectionTone} pulse={connectionBadgePulse} />
              <StatusBadge label="当前会话" value={sessionKey || "未连接"} tone={sessionKey ? "ok" : "warn"} />
              <StatusBadge label="Agent ID" value={agentId || "未设置"} tone={agentId ? "ok" : "warn"} />
            </div>
            <div className="connection-summary-card">
              <div>{connectionStatusNote}</div>
              <div>{connectionStatusMetaPrimary}</div>
              <div>{connectionStatusMetaSecondary}</div>
            </div>
          </SectionCard>

          <SectionCard title="快捷操作" description="聊天页保留必要动作，避免左侧列表长期占位。" icon={Sparkles}>
            <div className="grid gap-3">
              <QuickActionButton
                label={connecting ? "检查中..." : "检查网关"}
                icon={RefreshCw}
                tone="secondary"
                disabled={connecting}
                onClick={handleCheckHealth}
                loading={connecting}
              />
              <QuickActionButton label="打开设置" icon={Settings2} tone="success" disabled={false} onClick={() => setActiveView("settings")} />
              <QuickActionButton
                label={theme === "light" ? "切到夜间" : "切到白天"}
                icon={ThemeIcon}
                tone="secondary"
                disabled={false}
                onClick={toggleTheme}
              />
            </div>
          </SectionCard>

          <SectionCard title="快捷配置" description="完整接口地址放在系统设置页。" icon={Settings2}>
            <div className="grid gap-3">
              <ConfigInput
                label="sessionKey"
                value={sessionKey}
                onChange={(event) => updateConfig("sessionKey", event.target.value)}
                placeholder="当前会话键"
              />
              <ConfigInput
                label="agentId"
                value={agentId}
                onChange={(event) => updateConfig("agentId", event.target.value)}
                placeholder="当前 Agent ID"
              />
            </div>
          </SectionCard>
        </div>
      </div>
    );
  }

  function renderSessionsView() {
    return (
      <div className="space-y-5">
        <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
          <MetricCard
            label="会话数量"
            value={sessions.length}
            hint={mode === "mock" ? "演示模式下不拉真实会话。" : "可从后端同步当前列表。"}
            icon={FolderOpen}
            tone={sessions.length ? "ok" : "default"}
          />
          <MetricCard label="当前会话" value={sessionKey || "未选择"} hint="聊天面板会直接复用这个 session。" icon={MessagesSquare} tone={sessionKey ? "ok" : "warn"} />
          <MetricCard label="消息数量" value={messages.length} hint="当前前端已载入的消息总数。" icon={History} />
          <MetricCard label="最近日志" value={latestLog?.title || "暂无"} hint={latestLog?.time || "尚未产生动作。"} icon={Activity} />
        </div>

        <div className="grid gap-5 2xl:grid-cols-[1.15fr,0.85fr]">
          <SectionCard
            title="全部会话"
            description="从这里刷新、选择并切回聊天页。"
            icon={FolderOpen}
            action={
              <QuickActionButton
                label={loadingSessions ? "刷新中..." : "刷新"}
                icon={RefreshCw}
                tone="secondary"
                disabled={loadingSessions || mode === "mock"}
                onClick={handleLoadSessions}
                loading={loadingSessions}
              />
            }
          >
            <div className="space-y-3">
              {sessions.length ? (
                sessions.map((session) => (
                  <SessionItem
                    key={session.sessionKey}
                    session={session}
                    active={session.sessionKey === sessionKey}
                    onClick={() => handleOpenSession(session.sessionKey)}
                  />
                ))
              ) : (
                <div className="placeholder-card">当前还没有会话数据，先检查网关或创建会话。</div>
              )}
            </div>
          </SectionCard>

          <SectionCard title="当前选中会话" description="便于从会话维度继续操作。" icon={MessagesSquare}>
            <div className="space-y-4">
              <MetricCard label="会话标签" value={currentSession?.label || "暂无"} hint="当前 UI 选中的会话。" icon={MessagesSquare} tone={currentSession ? "ok" : "warn"} />
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-elevated)] px-4 py-4">
                <div className="text-xs uppercase tracking-[0.18em] text-[var(--text-muted)]">最近预览</div>
                <div className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">
                  {currentSession?.lastMessage || "暂无会话预览。"}
                </div>
              </div>
              <div className="grid gap-3">
                <QuickActionButton
                  label={loadingHistory ? "读取中..." : "加载历史"}
                  icon={History}
                  tone="secondary"
                  disabled={loadingHistory || !sessionKey || mode === "mock"}
                  onClick={() => handleLoadHistory()}
                  loading={loadingHistory}
                />
                <QuickActionButton label="返回聊天" icon={MessagesSquare} tone="success" disabled={false} onClick={() => setActiveView("chat")} />
                <QuickActionButton
                  label="创建新会话"
                  icon={Plus}
                  tone="primary"
                  disabled={connecting || mode === "mock"}
                  onClick={handleCreateSession}
                />
              </div>
            </div>
          </SectionCard>
        </div>
      </div>
    );
  }

  function renderAgentsView() {
    const defaultAgent = openClawAgents.find((agent) => agent.isDefault) || null;
    const recentSessions = selectedAgent?.sessions || [];

    return (
      <div className="agent-workspace">
        <div className="agent-metrics-grid">
          <MetricCard
            label="Agent 总数"
            value={agentSummary.total || openClawAgents.length}
            hint="来自 OpenClaw Gateway 的 agents.list。"
            icon={Bot}
            tone={openClawAgents.length ? "ok" : "warn"}
          />
          <MetricCard
            label="活跃 Agent"
            value={agentSummary.activeCount || 0}
            hint={`工作中 ${agentSummary.workingCount || 0} 个，近 1h ${agentSummary.recentCount || 0} 个。`}
            icon={Workflow}
            tone={agentSummary.activeCount ? "ok" : "default"}
          />
          <MetricCard
            label="会话聚合"
            value={agentSummary.sessionCount || sessions.length}
            hint="通过 sessionKey 反向聚合到各个 Agent。"
            icon={FolderOpen}
          />
          <MetricCard
            label="默认 Agent"
            value={agentId || agentSummary.defaultAgentId || defaultAgent?.id || "未设置"}
            hint="前端默认值会用于创建会话和派发任务。"
            icon={CheckCircle2}
            tone={agentId || defaultAgent ? "ok" : "warn"}
          />
        </div>

        <div className="agent-command-layout">
          <SectionCard
            title="Agent 状态"
            description="数据从 OpenClaw 读取，状态由会话运行态和最近活跃度聚合。"
            icon={Bot}
            className="agent-roster-panel"
            action={
              <QuickActionButton
                label={loadingAgents ? "同步中..." : "刷新 Agent"}
                icon={RefreshCw}
                tone="secondary"
                disabled={loadingAgents || mode === "mock"}
                onClick={handleLoadAgents}
                loading={loadingAgents}
              />
            }
          >
            <div className="agent-roster-list">
              {openClawAgents.length ? (
                openClawAgents.map((agent) => (
                  <button
                    key={agent.id}
                    type="button"
                    className={`agent-roster-card ${selectedAgent?.id === agent.id ? "active" : ""}`}
                    onClick={() => setSelectedAgentId(agent.id)}
                  >
                    <div className="agent-roster-top">
                      <div className="agent-avatar-mark">{(agent.name || agent.id).slice(0, 2).toUpperCase()}</div>
                      <div className="agent-roster-main">
                        <div className="agent-roster-name">{agent.name || agent.id}</div>
                        <div className="agent-roster-id">{agent.id}</div>
                      </div>
                      <span className={`agent-state-dot ${agent.status}`} />
                    </div>
                    <div className="agent-roster-footer">
                      <span className={`agent-status-pill ${agent.status}`}>{agent.statusLabel}</span>
                      <span>{agent.sessionCount} 会话</span>
                    </div>
                    <div className="agent-roster-note">{agent.workspace || agent.modelPrimary || "暂无工作区信息"}</div>
                  </button>
                ))
              ) : (
                <div className="placeholder-card">暂未读取到 Agent。请先确认 OpenClaw Gateway 正在运行，然后刷新。</div>
              )}
            </div>
          </SectionCard>

          <div className="agent-detail-column">
            <SectionCard title="当前 Agent" description="选择后可设为默认、创建会话或派发任务。" icon={Sparkles}>
              {selectedAgent ? (
                <div className="agent-detail-card">
                  <div className="agent-detail-header">
                    <div>
                      <div className="topbar-eyebrow">Selected Agent</div>
                      <h3 className="agent-detail-title text-[var(--text-primary)]">{selectedAgent.name || selectedAgent.id}</h3>
                      <div className="agent-detail-subtitle">{selectedAgent.id}</div>
                    </div>
                    <StatusBadge label="状态" value={selectedAgent.statusLabel} tone={agentStatusTone(selectedAgent.status)} pulse={selectedAgent.status === "working"} />
                  </div>

                  <div className="agent-detail-grid">
                    <div>
                      <span>主模型</span>
                      <strong>{selectedAgent.modelPrimary || "未公开"}</strong>
                    </div>
                    <div>
                      <span>近 1h 会话</span>
                      <strong>{selectedAgent.recentSessionCount}</strong>
                    </div>
                    <div>
                      <span>最近活跃</span>
                      <strong>{selectedAgent.lastActivityAt || "暂无"}</strong>
                    </div>
                    <div>
                      <span>通道</span>
                      <strong>{selectedAgent.toolSummary || "暂无"}</strong>
                    </div>
                  </div>

                  <div className="agent-workspace-path">{selectedAgent.workspace || "OpenClaw 未返回工作区路径"}</div>
                  {selectedAgent.modelFallbacks?.length ? (
                    <div className="agent-fallback-row">
                      {selectedAgent.modelFallbacks.map((model) => (
                        <span key={model}>{model}</span>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="placeholder-card">先从左侧选择一个 Agent。</div>
              )}
            </SectionCard>

            <SectionCard title="最近会话" description="用于判断该 Agent 当前是否在工作。" icon={History}>
              <div className="agent-session-list">
                {recentSessions.length ? (
                  recentSessions.map((session) => (
                    <button
                      key={session.sessionKey}
                      type="button"
                      className="agent-session-card"
                      onClick={() => handleOpenSession(session.sessionKey)}
                    >
                      <div className="agent-session-card-top">
                        <strong>{session.label || "未命名会话"}</strong>
                        <span>{session.updatedAt || "未知时间"}</span>
                      </div>
                      <div>{session.sessionKey}</div>
                      <p>{session.lastMessage || "暂无预览"}</p>
                    </button>
                  ))
                ) : (
                  <div className="placeholder-card">该 Agent 暂无近期会话。</div>
                )}
              </div>
            </SectionCard>
          </div>

          <SectionCard title="调度控制台" description="正式派发会创建 OpenClaw 会话并把指令送入该 Agent。" icon={SendHorizontal}>
            <div className="agent-dispatch-panel">
              <label>
                <span>目标 Agent</span>
                <select
                  value={selectedAgent?.id || ""}
                  onChange={(event) => setSelectedAgentId(event.target.value)}
                  className="app-input w-full"
                >
                  {!openClawAgents.length ? <option value="">暂无 Agent</option> : null}
                  {openClawAgents.map((agent) => (
                    <option key={agent.id} value={agent.id}>
                      {agent.name || agent.id}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                <span>任务标题</span>
                <input
                  value={dispatchTitle}
                  onChange={(event) => setDispatchTitle(event.target.value)}
                  className="app-input w-full"
                  placeholder="例如：网页自动化巡检"
                />
              </label>

              <label>
                <span>任务指令</span>
                <textarea
                  value={dispatchMessage}
                  onChange={(event) => setDispatchMessage(event.target.value)}
                  rows={8}
                  className="app-textarea agent-dispatch-textarea"
                  placeholder="写给目标 Agent 的正式任务：目标、输入、交付物、注意事项…"
                />
              </label>

              <div className="agent-dispatch-actions">
                <QuickActionButton
                  label="设为默认"
                  icon={CheckCircle2}
                  tone="secondary"
                  disabled={!selectedAgent}
                  onClick={() => handleSetDefaultAgent(selectedAgent?.id)}
                />
                <QuickActionButton
                  label={connecting ? "创建中..." : "创建会话"}
                  icon={Plus}
                  tone="success"
                  disabled={!selectedAgent || connecting || mode === "mock"}
                  onClick={() => handleCreateAgentSession(selectedAgent)}
                  loading={connecting}
                />
                <QuickActionButton
                  label={dispatchingAgent ? "派发中..." : "派发任务"}
                  icon={SendHorizontal}
                  tone="primary"
                  disabled={!selectedAgent || dispatchingAgent || mode === "mock" || !dispatchMessage.trim()}
                  onClick={handleDispatchToAgent}
                  loading={dispatchingAgent}
                />
              </div>
            </div>
          </SectionCard>
        </div>
      </div>
    );
  }

  function renderNodesView() {
    const checks = overviewChecks;
    const summary = systemOverview?.summary || {
      onlineCount: 0,
      warnCount: 0,
      offlineCount: 0,
      plannedCount: 0,
      lastSessionsCount: sessions.length,
      recentErrorCount: 0,
    };
    const runtime = systemOverview?.runtime || {};
    const configState = systemOverview?.config || {};

    const iconMap = {
      "clawlink-api": Server,
      "openclaw-gateway": PlugZap,
      "agent-routing": Bot,
      "session-routing": MessagesSquare,
      "browser-control": Globe,
      "task-scheduler": Clock3,
    };

    const statusMap = {
      online: { label: "在线", tone: "ok" },
      warn: { label: "待补齐", tone: "warn" },
      offline: { label: "离线", tone: "warn" },
      planned: { label: "规划中", tone: "default" },
    };

    return (
      <div className="space-y-5">
        <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-5">
          <MetricCard label="在线节点" value={summary.onlineCount} hint="当前可工作的服务/配置项。" icon={CheckCircle2} tone="ok" />
          <MetricCard label="待补齐" value={summary.warnCount} hint="需要补配置或人工干预。" icon={Wrench} tone="warn" />
          <MetricCard label="离线项" value={summary.offlineCount} hint="当前不可达或探测失败。" icon={PlugZap} tone={summary.offlineCount ? "warn" : "default"} />
          <MetricCard label="规划模块" value={summary.plannedCount} hint="页面已就绪，真实接口待接。" icon={Workflow} />
          <MetricCard label="最近会话数" value={summary.lastSessionsCount} hint={`错误日志 ${summary.recentErrorCount} 条`} icon={FolderOpen} />
        </div>

        <div className="grid gap-5 2xl:grid-cols-[1.2fr,0.8fr]">
          <SectionCard
            title="节点与模块状态"
            description="这里汇总 ClawLink 当前可感知的节点、配置和模块状态。"
            icon={Server}
            action={
              <QuickActionButton
                label={loadingSystemOverview ? "刷新中..." : "刷新状态"}
                icon={RefreshCw}
                tone="secondary"
                disabled={loadingSystemOverview}
                onClick={handleLoadSystemOverview}
                loading={loadingSystemOverview}
              />
            }
          >
            <div className="grid gap-4 xl:grid-cols-2">
              {checks.length ? (
                checks.map((check) => {
                  const Icon = iconMap[check.id] || Server;
                  const status = statusMap[check.status] || statusMap.planned;

                  return (
                    <div key={check.id} className="placeholder-card">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <Icon className="h-4 w-4 text-[var(--accent)]" />
                          <div className="text-sm font-semibold text-[var(--text-primary)]">{check.label}</div>
                        </div>
                        <div className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${
                          status.tone === "ok"
                            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                            : status.tone === "warn"
                              ? "border-amber-500/30 bg-amber-500/10 text-amber-300"
                              : "border-slate-700 bg-slate-800 text-slate-300"
                        }`}>
                          {status.label}
                        </div>
                      </div>
                      <div className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">{check.detail}</div>
                    </div>
                  );
                })
              ) : (
                <div className="placeholder-card">系统概览还没加载到，点“刷新状态”再试一次。</div>
              )}
            </div>
          </SectionCard>

          <div className="space-y-5">
            <SectionCard title="路由与运行态" description="把默认路由、最近会话和网关配置集中展示。" icon={Link2}>
              <div className="grid gap-3">
                <MetricCard
                  label="Gateway"
                  value={configState.gatewayBaseUrl || "未配置"}
                  hint={configState.hasGatewayToken ? "已带网关令牌" : "当前未配置网关令牌"}
                  icon={PlugZap}
                  tone={configState.gatewayBaseUrl ? "ok" : "warn"}
                />
                <MetricCard
                  label="默认路由"
                  value={runtime.lastSessionKey || "未建立"}
                  hint={configState.hasAgentId ? "Agent 已配置" : "仍缺少默认 Agent"}
                  icon={MessagesSquare}
                  tone={runtime.lastSessionKey ? "ok" : "warn"}
                />
                <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-elevated)] px-4 py-4">
                  <div className="text-xs uppercase tracking-[0.18em] text-[var(--text-muted)]">运行记录</div>
                  <div className="mt-3 space-y-2 text-sm leading-6 text-[var(--text-secondary)]">
                    <div>最近历史读取：{runtime.lastHistorySessionKey || "暂无"}</div>
                    <div>最近消息发送：{runtime.lastChatAt ? new Date(runtime.lastChatAt).toLocaleString("zh-CN") : "暂无"}</div>
                  </div>
                </div>
              </div>
            </SectionCard>

            <SectionCard title="运维动作" description="节点页上直接给出常用动作。" icon={Wrench}>
              <div className="grid gap-3">
                <QuickActionButton
                  label={connecting ? "检查中..." : "检查网关"}
                  icon={RefreshCw}
                  tone="secondary"
                  disabled={connecting}
                  onClick={handleCheckHealth}
                  loading={connecting}
                />
                <QuickActionButton
                  label="刷新后端日志"
                  icon={Activity}
                  tone="secondary"
                  disabled={loadingServerLogs}
                  onClick={() => void handleLoadServerLogs()}
                  loading={loadingServerLogs}
                />
                <QuickActionButton
                  label="创建会话"
                  icon={Plus}
                  tone="primary"
                  disabled={connecting || mode === "mock"}
                  onClick={handleCreateSession}
                />
                <QuickActionButton
                  label="打开设置"
                  icon={Settings2}
                  tone="success"
                  disabled={false}
                  onClick={() => setActiveView("settings")}
                />
              </div>
            </SectionCard>

            <SectionCard title="最近后端日志" description="这里已经是后端真实活动数据，不再只是前端占位。" icon={Activity}>
              <div className="space-y-3">
                {serverLogs.length ? (
                  serverLogs.slice(0, 6).map((log) => <LogItem key={log.id} log={log} />)
                ) : (
                  <div className="placeholder-card">后端日志为空，执行一次检查网关或刷新会话后这里会出现记录。</div>
                )}
              </div>
            </SectionCard>
          </div>
        </div>
      </div>
    );
  }

  function renderSceneView() {
    const focusedSceneAgent = sceneAgents.find((agent) => agent.id === sceneFocusId) || sceneAgents[0] || null;
    const focusedRuntimeAgentId = sceneFocusId.startsWith("agent-") ? sceneFocusId.replace(/^agent-/, "") : "";
    const sceneDispatchAgent = selectedAgent;
    const focusedOpenClawAgent =
      openClawAgents.find((agent) => agent.id === focusedRuntimeAgentId) ||
      ((sceneFocusId === "agents" || sceneFocusId.startsWith("agent-")) ? sceneDispatchAgent : null);
    const sceneAgentCount = agentSummary.total || openClawAgents.length;
    const sceneActiveAgentCount = agentSummary.activeCount || 0;
    const isAgentWorkbenchFocused = !sceneFocusId || sceneFocusId === "agents" || sceneFocusId.startsWith("agent-");

    return (
      <div className="scene-workspace">
        <SceneAgentDrawer
          open={isSceneAgentDrawerOpen}
          agent={focusedOpenClawAgent || sceneDispatchAgent}
          dispatchTitle={dispatchTitle}
          dispatchMessage={dispatchMessage}
          onTitleChange={(event) => setDispatchTitle(event.target.value)}
          onMessageChange={(event) => setDispatchMessage(event.target.value)}
          onClose={() => setIsSceneAgentDrawerOpen(false)}
          onSetDefault={() => handleSetDefaultAgent((focusedOpenClawAgent || sceneDispatchAgent)?.id)}
          onCreateSession={() => handleCreateAgentSession(focusedOpenClawAgent || sceneDispatchAgent)}
          onDispatch={() => void handleDispatchToAgent()}
          connecting={connecting}
          dispatching={dispatchingAgent}
          mode={mode}
        />

        <section className="scene-stage-panel app-panel">
          <div className="scene-stage-header">
            <div className="min-w-0">
              <div className="topbar-eyebrow">Project Gallery</div>
              <h2 className="scene-stage-title text-[var(--text-primary)]">我的 AI 项目画廊</h2>
              <div className="scene-stage-meta text-xs text-[var(--text-secondary)]">
                <span>{PROJECTS.length} 位 AI 同事</span>
                <span>·</span>
                <span>点击展台即可跳转</span>
                <span>·</span>
                <span>{sceneAgentCount} 个在线 Agent</span>
              </div>
            </div>

            <div className="scene-preset-row">
              {PROJECTS.map((project) => (
                <button
                  key={project.id}
                  type="button"
                  className={`scene-preset-chip ${activeProjectId === project.id ? "active" : ""}`}
                  style={
                    activeProjectId === project.id
                      ? { borderColor: project.color, color: project.color }
                      : undefined
                  }
                  onMouseEnter={() => setActiveProjectId(project.id)}
                  onMouseLeave={() => setActiveProjectId((current) => (current === project.id ? null : current))}
                  onClick={() => handleOpenProject(project)}
                  title={`打开 ${project.role} · ${project.url}`}
                >
                  <span style={{ marginRight: 6 }}>{project.emoji}</span>
                  {project.role}
                </button>
              ))}
            </div>
          </div>

          <div className="scene-canvas-shell">
            <React.Suspense fallback={<div className="scene-loading-state">正在加载 3D 场景…</div>}>
              <ProjectGallery3D
                projects={PROJECTS}
                theme={theme}
                activeId={activeProjectId}
                onOpen={handleOpenProject}
                onHover={setActiveProjectId}
              />
            </React.Suspense>
          </div>
        </section>

        <div className="scene-side-column">
          <SectionCard title="3D Agent 调度台" description="就在场景里读取实时 Agent，并直接调度到真实会话。" icon={SendHorizontal}>
            <div className="scene-scheduler-stack">
              <div className="scene-scheduler-summary">
                <StatusBadge
                  label="Agent 总数"
                  value={String(sceneAgentCount)}
                  tone={sceneAgentCount ? "ok" : "warn"}
                />
                <StatusBadge
                  label="当前焦点"
                  value={isAgentWorkbenchFocused ? "Agent 工位" : "其他工位"}
                  tone={isAgentWorkbenchFocused ? "info" : "default"}
                />
                <StatusBadge
                  label="活跃 Agent"
                  value={String(sceneActiveAgentCount)}
                  tone={sceneActiveAgentCount ? "ok" : "default"}
                />
              </div>

              <QuickActionButton
                label={isAgentWorkbenchFocused ? "已定位 Agent 工位" : "定位到 Agent 工位"}
                icon={Bot}
                tone="primary"
                disabled={isAgentWorkbenchFocused}
                onClick={() => handleFocusSceneModule(sceneDispatchAgent ? `agent-${sceneDispatchAgent.id}` : "agents")}
              />

              <div className="scene-dispatch-mini-form">
                <label>
                  <span>目标 Agent</span>
                  <select
                    value={sceneDispatchAgent?.id || ""}
                    onChange={(event) => {
                      setSelectedAgentId(event.target.value);
                      handleFocusSceneModule(`agent-${event.target.value}`);
                    }}
                    className="app-input w-full"
                  >
                    {!openClawAgents.length ? <option value="">暂无 Agent</option> : null}
                    {openClawAgents.map((agent) => (
                      <option key={agent.id} value={agent.id}>
                        {agent.name || agent.id}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  <span>任务标题</span>
                  <input
                    value={dispatchTitle}
                    onChange={(event) => setDispatchTitle(event.target.value)}
                    className="app-input w-full"
                    placeholder="例如：飞书日报整理"
                  />
                </label>

                <label>
                  <span>任务指令</span>
                  <textarea
                    value={dispatchMessage}
                    onChange={(event) => setDispatchMessage(event.target.value)}
                    rows={5}
                    className="app-textarea w-full"
                    placeholder="直接给这个 Agent 下发正式任务，派发后会自动创建 OpenClaw 会话。"
                  />
                </label>

                <div className="scene-dispatch-actions">
                  <QuickActionButton
                    label="弹出任务抽屉"
                    icon={SquareTerminal}
                    tone="secondary"
                    disabled={!sceneDispatchAgent}
                    onClick={() => setIsSceneAgentDrawerOpen(true)}
                  />
                  <QuickActionButton
                    label="设为默认"
                    icon={CheckCircle2}
                    tone="secondary"
                    disabled={!sceneDispatchAgent}
                    onClick={() => handleSetDefaultAgent(sceneDispatchAgent?.id)}
                  />
                  <QuickActionButton
                    label={connecting ? "创建中..." : "创建会话"}
                    icon={Plus}
                    tone="success"
                    disabled={!sceneDispatchAgent || connecting || mode === "mock"}
                    onClick={() => handleCreateAgentSession(sceneDispatchAgent)}
                    loading={connecting}
                  />
                  <QuickActionButton
                    label={dispatchingAgent ? "派发中..." : "派发任务"}
                    icon={SendHorizontal}
                    tone="primary"
                    disabled={!sceneDispatchAgent || dispatchingAgent || mode === "mock" || !dispatchMessage.trim()}
                    onClick={handleDispatchToAgent}
                    loading={dispatchingAgent}
                  />
                </div>
              </div>

              <div className="scene-openclaw-roster">
                {openClawAgents.length ? (
                  openClawAgents.map((agent) => (
                    <button
                      key={agent.id}
                      type="button"
                      className={`scene-openclaw-card ${sceneDispatchAgent?.id === agent.id ? "active" : ""}`}
                      onClick={() => {
                        setSelectedAgentId(agent.id);
                        handleFocusSceneModule(`agent-${agent.id}`);
                      }}
                    >
                      <div className="scene-openclaw-top">
                        <div className="scene-openclaw-name">
                          <span>{agent.name || agent.id}</span>
                          <span className="scene-openclaw-id">{agent.id}</span>
                        </div>
                        <span className={`scene-agent-dot ${agent.status}`} />
                      </div>
                      <div className="scene-openclaw-meta">
                        <span className={`agent-status-pill ${agent.status}`}>{agent.statusLabel}</span>
                        <span>{agent.sessionCount} 会话</span>
                      </div>
                      <div className="scene-openclaw-note">
                        {agent.recentSessionLabel || agent.workspace || "暂无最近会话"}
                      </div>
                    </button>
                  ))
                ) : (
                  <div className="placeholder-card">当前未读取到 Agent，先检查网关或点击“刷新 Agent”。</div>
                )}
              </div>
            </div>
          </SectionCard>

          <SectionCard title="场景控制" description="用总部式空间视角来承载 ClawLink 状态。" icon={Globe}>
            <div className="grid gap-3">
              <QuickActionButton
                label={connecting ? "检查中..." : "检查网关"}
                icon={RefreshCw}
                tone="secondary"
                disabled={connecting}
                onClick={handleCheckHealth}
                loading={connecting}
              />
              <QuickActionButton
                label={loadingSessions ? "同步中..." : "刷新会话"}
                icon={FolderOpen}
                tone="secondary"
                disabled={loadingSessions || mode === "mock"}
                onClick={handleLoadSessions}
                loading={loadingSessions}
              />
              <QuickActionButton
                label={loadingAgents ? "同步 Agent..." : "刷新 Agent"}
                icon={Bot}
                tone="secondary"
                disabled={loadingAgents || mode === "mock"}
                onClick={handleLoadAgents}
                loading={loadingAgents}
              />
              <QuickActionButton label="进入聊天" icon={MessagesSquare} tone="success" disabled={false} onClick={() => setActiveView("chat")} />
            </div>
          </SectionCard>

          <SectionCard title="工位状态" description="每个工位都映射当前控制台的真实状态。" icon={Bot}>
            <div className="scene-agent-list">
              <div className="scene-agent-group-title">系统工位</div>
              {sceneSystemAgents.map((agent) => (
                <button
                  key={agent.id}
                  type="button"
                  className={`scene-agent-card ${sceneFocusId === agent.id ? "active" : ""}`}
                  onClick={() => handleFocusSceneModule(agent.id)}
                >
                  <div className="scene-agent-card-top">
                    <div className="scene-agent-name">
                      <span>{agent.emoji}</span>
                      <span>{agent.name}</span>
                    </div>
                    <span className={`scene-agent-dot ${agent.status}`} />
                  </div>
                  <div className="scene-agent-status">{agent.statusLabel}</div>
                  <div className="scene-agent-note">{agent.note}</div>
                </button>
              ))}

              {sceneRuntimeAgents.length ? <div className="scene-agent-group-title">真实 Agent 工位</div> : null}
              {sceneRuntimeAgents.map((agent) => (
                <button
                  key={agent.id}
                  type="button"
                  className={`scene-agent-card ${sceneFocusId === agent.id ? "active" : ""}`}
                  onClick={() => handleFocusSceneModule(agent.id)}
                >
                  <div className="scene-agent-card-top">
                    <div className="scene-agent-name">
                      <span>{agent.emoji}</span>
                      <span>{agent.name}</span>
                    </div>
                    <span className={`scene-agent-dot ${agent.status}`} />
                  </div>
                  <div className="scene-agent-status">{agent.statusLabel}</div>
                  <div className="scene-agent-note">{agent.note}</div>
                </button>
              ))}
            </div>
          </SectionCard>

          <SectionCard title="当前焦点" description="选中工位后，右侧同步展示当前模块摘要。" icon={Workflow}>
            <div className="space-y-3">
              <MetricCard
                label="焦点工位"
                value={focusedSceneAgent?.name || "未选择"}
                hint={focusedSceneAgent?.statusLabel || "暂无状态"}
                icon={Bot}
                tone={focusedSceneAgent?.status === "error" ? "warn" : focusedSceneAgent?.status === "thinking" ? "info" : "ok"}
              />
              {isAgentWorkbenchFocused && focusedOpenClawAgent ? (
                <div className="scene-focus-agent-card">
                  <div className="scene-focus-agent-title">
                    <span>{focusedOpenClawAgent.name || focusedOpenClawAgent.id}</span>
                    <span className={`agent-status-pill ${focusedOpenClawAgent.status}`}>{focusedOpenClawAgent.statusLabel}</span>
                  </div>
                  <div className="scene-focus-agent-grid">
                    <div>
                      <span>主模型</span>
                      <strong>{focusedOpenClawAgent.modelPrimary || "未公开"}</strong>
                    </div>
                    <div>
                      <span>近 1h 会话</span>
                      <strong>{focusedOpenClawAgent.recentSessionCount}</strong>
                    </div>
                    <div>
                      <span>最近会话</span>
                      <strong>{focusedOpenClawAgent.recentSessionLabel || "暂无"}</strong>
                    </div>
                    <div>
                      <span>工作区</span>
                      <strong>{focusedOpenClawAgent.workspace || "未公开"}</strong>
                    </div>
                  </div>
                  <div className="scene-focus-agent-note">
                    {focusedOpenClawAgent.recentSessionPreview || focusedSceneAgent?.note || "在这个工位上直接调度真实 Agent。"}
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-elevated)] px-4 py-4 text-sm leading-6 text-[var(--text-secondary)]">
                  {focusedSceneAgent?.note || "点击任一工位即可查看当前摘要。"}
                </div>
              )}
              <QuickActionButton
                label={isAgentWorkbenchFocused ? "打开完整 Agent 页" : "打开对应页面"}
                icon={ChevronRight}
                tone="primary"
                disabled={!focusedSceneAgent}
                onClick={() => setActiveView(getSceneViewTarget(focusedSceneAgent.id))}
              />
              {isAgentWorkbenchFocused ? (
                <QuickActionButton
                  label="打开任务抽屉"
                  icon={SquareTerminal}
                  tone="secondary"
                  disabled={!(focusedOpenClawAgent || sceneDispatchAgent)}
                  onClick={() => setIsSceneAgentDrawerOpen(true)}
                />
              ) : null}
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-elevated)] px-4 py-4 text-sm leading-6 text-[var(--text-secondary)]">
                这套场景恢复为总部中庭、环绕工位、会议区与休息区的组织方式，看起来更像完整公司空间。
              </div>
            </div>
          </SectionCard>
        </div>
      </div>
    );
  }

  function renderLogsView() {
    return (
      <div className="space-y-5">
        <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
          <MetricCard
            label="匹配日志"
            value={serverLogMeta.matched || serverLogs.length}
            hint={`总日志 ${serverLogMeta.total || serverLogs.length} 条`}
            icon={Activity}
            tone={serverLogs.length ? "ok" : "default"}
          />
          <MetricCard
            label="错误日志"
            value={serverLogErrorCount}
            hint="按当前筛选结果统计。"
            icon={Wrench}
            tone={serverLogErrorCount ? "warn" : "ok"}
          />
          <MetricCard
            label="Gateway 调用"
            value={gatewayLogCount}
            hint="当前筛选结果里的网关调用数量。"
            icon={PlugZap}
            tone={gatewayLogCount ? "ok" : "default"}
          />
          <MetricCard
            label="当前筛选"
            value={currentLogFilters.status || currentLogFilters.source || currentLogFilters.q || "全部"}
            hint={currentLogFilters.sessionKey ? `session ${currentLogFilters.sessionKey}` : "可按状态、来源或关键词筛选。"}
            icon={Search}
          />
        </div>

        <SectionCard title="日志筛选" description="借鉴控制台列表页逻辑，把筛选条件放在顶部统一管理。" icon={Search}>
          <div className="space-y-4">
            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr),auto,auto]">
              <input
                value={logSearchInput}
                onChange={(event) => setLogSearchInput(event.target.value)}
                placeholder="搜索 detail / sessionKey / agentId / request"
                className="app-input w-full"
              />
              <QuickActionButton
                label={loadingServerLogs ? "查询中..." : "应用筛选"}
                icon={Search}
                tone="primary"
                disabled={loadingServerLogs}
                onClick={handleApplyLogSearch}
                loading={loadingServerLogs}
              />
              <QuickActionButton label="重置筛选" icon={RefreshCw} tone="secondary" disabled={loadingServerLogs} onClick={handleResetLogFilters} />
            </div>

            <div>
              <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">状态</div>
              <div className="filter-chip-row">
                <FilterChip label="全部" active={!currentLogFilters.status} onClick={() => void handleLoadServerLogs({ status: "" })} />
                {logStatusOptions.map((status) => (
                  <FilterChip
                    key={status}
                    label={status}
                    active={currentLogFilters.status === status}
                    onClick={() => void handleLoadServerLogs({ status })}
                  />
                ))}
              </div>
            </div>

            <div>
              <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">来源</div>
              <div className="filter-chip-row">
                <FilterChip label="全部" active={!currentLogFilters.source} onClick={() => void handleLoadServerLogs({ source: "" })} />
                {logSourceOptions.map((source) => (
                  <FilterChip
                    key={source}
                    label={source}
                    active={currentLogFilters.source === source}
                    onClick={() => void handleLoadServerLogs({ source })}
                  />
                ))}
                {sessionKey ? (
                  <FilterChip
                    label="当前会话"
                    active={currentLogFilters.sessionKey === sessionKey}
                    onClick={() =>
                      void handleLoadServerLogs({
                        sessionKey: currentLogFilters.sessionKey === sessionKey ? "" : sessionKey,
                      })
                    }
                  />
                ) : null}
              </div>
            </div>
          </div>
        </SectionCard>

        <div className="grid gap-5 2xl:grid-cols-[1.2fr,0.8fr]">
          <SectionCard
            title="后端活动日志"
            description="这里已改为读取 ClawLink 后端与 OpenClaw Tool 调用日志。"
            icon={Activity}
            action={
              <QuickActionButton
                label={loadingServerLogs ? "刷新中..." : "刷新"}
                icon={RefreshCw}
                tone="secondary"
                disabled={loadingServerLogs}
                onClick={() => void handleLoadServerLogs()}
                loading={loadingServerLogs}
              />
            }
          >
            <div className="space-y-3">
              {serverLogs.length ? (
                serverLogs.map((log) => <LogItem key={log.id} log={log} />)
              ) : (
                <div className="placeholder-card">后端日志暂时为空，执行一次检查网关、拉取会话或发送消息后，这里会出现真实记录。</div>
              )}
            </div>
          </SectionCard>

          <div className="space-y-5">
            <SectionCard title="日志上下文" description="当前接口地址与系统概览，便于定位日志来源。" icon={Link2}>
              <div className="space-y-3">
                <MetricCard label="聊天接口" value={endpoint} hint="发送消息会调用此地址。" icon={MessagesSquare} />
                <MetricCard label="会话列表接口" value={sessionsEndpoint} hint="刷新会话时读取此地址。" icon={FolderOpen} />
                <MetricCard label="历史接口" value={historyEndpoint} hint="加载历史时读取此地址。" icon={History} />
              </div>
            </SectionCard>

            <SectionCard title="前端动作流" description="保留本地 UI 动作日志，辅助对照后端日志。" icon={Sparkles}>
              <div className="space-y-3">
                {activityLogs.length ? (
                  activityLogs.slice(0, 6).map((log) => <LogItem key={log.id} log={log} />)
                ) : (
                  <div className="placeholder-card">当前没有本地 UI 动作日志。</div>
                )}
                <QuickActionButton label="清空本地日志" icon={Wrench} tone="secondary" disabled={false} onClick={handleClearLogs} />
              </div>
            </SectionCard>
          </div>
        </div>
      </div>
    );
  }

  function renderPlaceholderView(moduleId) {
    const cards = placeholderModules[moduleId] || [];

    return (
      <div className="space-y-5">
        <SectionCard title={`${activeNav.label}模块框架`} description="先把 dashboard 骨架搭出来，后续只需补真实数据和动作。" icon={activeNav.icon}>
          <div className="grid gap-4 md:grid-cols-3">
            {cards.map((card) => (
              <PlaceholderCard key={card.title} title={card.title} description={card.description} icon={card.icon} />
            ))}
          </div>
        </SectionCard>

        <SectionCard title="当前建议" description="按任务中枢的组织方式继续扩展。" icon={Workflow}>
          <div className="space-y-3">
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-elevated)] px-4 py-3 text-sm text-[var(--text-secondary)]">
              每个模块保持“顶部状态卡 + 核心列表 + 详情动作”的布局。
            </div>
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-elevated)] px-4 py-3 text-sm text-[var(--text-secondary)]">
              把真实接口接进来后，优先保证状态同步和错误提示链路。
            </div>
          </div>
        </SectionCard>
      </div>
    );
  }

  function renderSettingsView() {
    return (
      <div className="grid gap-5 2xl:grid-cols-[1.1fr,0.9fr]">
        <SectionCard title="接口与默认值" description="这些字段会自动保存在当前浏览器的 localStorage。" icon={Settings2}>
          <div className="grid gap-4 md:grid-cols-2">
            <ConfigInput
              label="运行模式"
              value={mode}
              onChange={(event) => updateConfig("mode", event.target.value)}
              type="select"
            />
            <label className="block">
              <div className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--text-muted)]">显示主题</div>
              <select value={theme} onChange={(event) => updateConfig("theme", event.target.value)} className="app-input w-full">
                <option value="dark">夜间模式</option>
                <option value="light">白天模式</option>
              </select>
            </label>
            <ConfigInput
              label="聊天接口"
              value={endpoint}
              onChange={(event) => updateConfig("endpoint", event.target.value)}
              placeholder="POST /api/chat"
            />
            <ConfigInput
              label="创建会话接口"
              value={sessionEndpoint}
              onChange={(event) => updateConfig("sessionEndpoint", event.target.value)}
              placeholder="POST /api/session"
            />
            <ConfigInput
              label="健康检查接口"
              value={healthEndpoint}
              onChange={(event) => updateConfig("healthEndpoint", event.target.value)}
              placeholder="GET /api/health"
            />
            <ConfigInput
              label="会话列表接口"
              value={sessionsEndpoint}
              onChange={(event) => updateConfig("sessionsEndpoint", event.target.value)}
              placeholder="GET /api/sessions"
            />
            <ConfigInput
              label="历史接口"
              value={historyEndpoint}
              onChange={(event) => updateConfig("historyEndpoint", event.target.value)}
              placeholder="GET /api/history"
            />
            <ConfigInput
              label="Agent 列表接口"
              value={agentsEndpoint}
              onChange={(event) => updateConfig("agentsEndpoint", event.target.value)}
              placeholder="GET /api/agents"
            />
            <ConfigInput
              label="Agent 派发接口"
              value={agentDispatchEndpoint}
              onChange={(event) => updateConfig("agentDispatchEndpoint", event.target.value)}
              placeholder="POST /api/agents/dispatch"
            />
            <ConfigInput
              label="默认 sessionKey"
              value={sessionKey}
              onChange={(event) => updateConfig("sessionKey", event.target.value)}
              placeholder="手动指定会话"
            />
            <ConfigInput
              label="默认 agentId"
              value={agentId}
              onChange={(event) => updateConfig("agentId", event.target.value)}
              placeholder="手动指定 Agent"
            />
          </div>
        </SectionCard>

        <div className="space-y-5">
          <SectionCard title="本地保存说明" description="统一管理本地配置与默认上下文。" icon={Sparkles}>
            <div className="space-y-3">
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-elevated)] px-4 py-3 text-sm text-[var(--text-secondary)]">
                当前页面会自动保存模式、接口地址、sessionKey 和 agentId。
              </div>
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-elevated)] px-4 py-3 text-sm text-[var(--text-secondary)]">
                同时兼容旧的 `openclaw` 本地存储键，避免已有配置丢失。
              </div>
            </div>
          </SectionCard>

          <SectionCard title="快捷动作" description="调试时最常用的动作放这里。" icon={Wrench}>
            <div className="grid gap-3">
              <QuickActionButton
                label={connecting ? "检查中..." : "检查网关"}
                icon={RefreshCw}
                tone="secondary"
                disabled={connecting}
                onClick={handleCheckHealth}
                loading={connecting}
              />
              <QuickActionButton label="恢复默认" icon={Wrench} tone="primary" disabled={false} onClick={handleResetSettings} />
              <QuickActionButton label="返回概览" icon={LayoutDashboard} tone="success" disabled={false} onClick={() => setActiveView("overview")} />
            </div>
          </SectionCard>
        </div>
      </div>
    );
  }

  function renderContent() {
    switch (activeView) {
      case "overview":
        return renderOverviewView();
      case "chat":
        return renderChatView();
      case "sessions":
        return renderSessionsView();
      case "agents":
        return renderAgentsView();
      case "logs":
        return renderLogsView();
      case "browser":
        return renderSceneView();
      case "settings":
        return renderSettingsView();
      case "nodes":
        return renderNodesView();
      case "tasks":
        return renderPlaceholderView(activeView);
      default:
        return renderOverviewView();
    }
  }

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text-primary)]" data-theme={theme}>
      <div className="mx-auto flex min-h-screen max-w-[1760px] gap-4 px-4 py-4">
        <aside className="app-dock hidden xl:flex">
          <div className="dock-brand">
            <img src={clawLinkMark} alt="ClawLink" className="dock-brand-logo" draggable="false" />
            <div className="text-center">
              <div className="dock-brand-name">{BRANDING.name}</div>
              <div className="dock-brand-version">{BRANDING.version}</div>
            </div>
          </div>

          <nav className="flex-1 space-y-2 overflow-auto">
            {NAV_ITEMS.map((item) => (
              <DockItem key={item.id} item={item} active={item.id === activeView} onClick={() => setActiveView(item.id)} />
            ))}
          </nav>

          <div className="dock-footer">
            <div className="text-xs uppercase tracking-[0.18em] text-[var(--text-muted)]">{BRANDING.gatewayName}</div>
            <div className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">{connectionState}</div>
          </div>
        </aside>

        <main className="app-main min-w-0 flex-1">
          <header className={`app-panel topbar ${activeView === "chat" ? "topbar-compact" : ""}`}>
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div className="topbar-copy">
                <div className="topbar-eyebrow">{BRANDING.shellLabel}</div>
                <div className="topbar-title text-[var(--text-primary)]">{activeNav.label}</div>
                <div className="topbar-description text-[var(--text-secondary)]">{activeNav.description}</div>
              </div>

              <div className="topbar-right-cluster">
                <div className="search-shell">
                  <Search className="h-4 w-4 text-[var(--text-muted)]" />
                  <span>{BRANDING.searchPlaceholder}</span>
                </div>
                <div className="topbar-tools">
                  <button
                    type="button"
                    className="icon-shell"
                    onClick={handleCheckHealth}
                    disabled={connecting}
                    aria-label="检查网关"
                    title={connecting ? "正在检查网关" : "检查网关"}
                  >
                    <RefreshCw className={`h-4 w-4 ${connecting ? "animate-spin" : ""}`} />
                  </button>
                  <button
                    type="button"
                    className="theme-toggle"
                    onClick={toggleTheme}
                    aria-label="切换明暗主题"
                    title={theme === "light" ? "切换到夜间模式" : "切换到白天模式"}
                  >
                    <ThemeIcon className="h-4 w-4" />
                  </button>
                  <button type="button" className="icon-shell" aria-label="notifications">
                    <Bell className="h-4 w-4" />
                  </button>
                  <div
                    className={`topbar-runtime-pill ${topbarRuntimeState}`}
                    aria-label={`当前运行状态：${topbarRuntimeLabel}`}
                    title={`当前运行状态：${topbarRuntimeLabel}`}
                  >
                    <span className="topbar-runtime-dot" />
                    <span>{topbarRuntimeLabel}</span>
                  </div>
                </div>
              </div>
            </div>

            <MobileNav activeView={activeView} onSelect={setActiveView} />
          </header>

          <div
            className={`app-content-shell ${
              activeView === "chat" ? "chat-content-shell" : activeView === "browser" ? "scene-content-shell" : ""
            }`}
          >
            {renderContent()}
          </div>
        </main>
      </div>
    </div>
  );
}
