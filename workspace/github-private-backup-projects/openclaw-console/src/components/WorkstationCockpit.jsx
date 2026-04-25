import React from "react";
import { X, SendHorizontal, RefreshCw, ExternalLink, Globe, ShieldAlert } from "lucide-react";
import { fetchEventStream, fetchJsonOrThrow } from "../lib/http.js";
import { extractSessionKey } from "../lib/openclaw.js";

function nowTime() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const URL_REGEX = /\bhttps?:\/\/[^\s<>"'`]+/i;
const BARE_HOST_REGEX = /\b((?:[a-z0-9-]+\.)+[a-z]{2,})(?:\/[^\s<>"'`]*)?/i;
const SCAN_KEYWORDS = ["漏洞", "巡检", "扫", "安全", "风险", "响应头", "scan", "audit"];

function pickUrl(text) {
  const urlMatch = text.match(URL_REGEX);
  if (urlMatch) return urlMatch[0].replace(/[.,;。，；）)]+$/, "");
  const hostMatch = text.match(BARE_HOST_REGEX);
  if (hostMatch) return `https://${hostMatch[0]}`;
  return "";
}

function detectScanIntent(text) {
  const lower = text.toLowerCase();
  return SCAN_KEYWORDS.some((kw) => lower.includes(kw.toLowerCase()));
}

const AGENT_ID_BY_PROJECT = {
  "website-engineer": "browser_automation_operator",
};

const INTRO_BY_PROJECT = {
  "website-engineer": {
    agentName: "浏览器自动化操作员",
    agentEmoji: "🦾",
    agentId: "browser_automation_operator",
    tagline: "Playwright · 会看网页、仿制设计、做漏洞巡检,所有产物写到工作目录,右侧实时读取。",
    suggestions: [
      "帮我仿制 https://example.com 的设计风格",
      "扫一下 https://example.com 的安全响应头",
      "打开 https://news.ycombinator.com 并总结头条",
    ],
    seed:
      "你好,我是浏览器自动化操作员。点右侧面板里的「派 agent 仿制」可以让我照着一个网址的UI设计重做一版(不是mirror); 成功后可直接点「打开仿制站点」看演示界面；「查询漏洞」是温和的被动+主动探测。也可以直接在这里派活。",
  },
};

function defaultIntro(project) {
  return {
    agentName: project?.role || "AI 同事",
    agentEmoji: project?.emoji || "🤖",
    tagline: project?.techStack || "",
    suggestions: [],
    seed: `${project?.role || "这位同事"}暂未接入对话通道，先用右侧的独立工作台。`,
  };
}

function MessageBubble({ message }) {
  const isUser = message.role === "user";
  return (
    <div className={`wc-bubble-row ${isUser ? "user" : "agent"}`}>
      <div className={`wc-bubble ${isUser ? "user" : "agent"} ${message.tone || ""}`}>
        <div className="wc-bubble-meta">
          <span className="wc-bubble-role">{isUser ? "我 · 老板" : message.sender || "Agent"}</span>
          <span className="wc-bubble-time">{message.time}</span>
        </div>
        <div className="wc-bubble-body">{message.content}</div>
      </div>
    </div>
  );
}

function SummaryChips({ summary }) {
  if (!summary) return null;
  const items = [
    ["总计", summary.total, "total"],
    ["高危", summary.high, "high"],
    ["中危", summary.medium, "medium"],
    ["低危", summary.low, "low"],
    ["提示", summary.info, "info"],
  ];
  return (
    <div className="wc-summary-row">
      {items.map(([label, value, tone]) => (
        <div key={label} className={`wc-summary-item tone-${tone}`}>
          <strong>{value ?? 0}</strong>
          <span>{label}</span>
        </div>
      ))}
    </div>
  );
}

function FindingsList({ findings }) {
  if (!findings?.length) return null;
  return (
    <div className="wc-findings">
      {findings.map((item, idx) => (
        <div key={idx} className={`wc-finding level-${item.level || "info"}`}>
          <div className="wc-finding-top">
            <strong>{item.title || "未命名发现"}</strong>
            <span className={`wc-level-pill level-${item.level || "info"}`}>{item.level || "info"}</span>
          </div>
          <div className="wc-finding-detail">{item.detail}</div>
        </div>
      ))}
    </div>
  );
}

function HeadersBlock({ headers }) {
  const entries = headers ? Object.entries(headers) : [];
  if (!entries.length) return null;
  return (
    <div className="wc-headers">
      <div className="wc-headers-title">响应头</div>
      <div className="wc-headers-body">
        {entries.map(([key, value]) => (
          <div key={key} className="wc-header-row">
            <span className="wc-header-key">{key}</span>
            <span className="wc-header-value">{String(value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function MetricsChips({ metrics }) {
  if (!metrics) return null;
  const entries = Object.entries(metrics);
  if (!entries.length) return null;
  return (
    <div className="wc-metrics-row">
      {entries.map(([key, value]) => (
        <span key={key} className="wc-metric-chip">
          {key}: <strong>{value}</strong>
        </span>
      ))}
    </div>
  );
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  let data = {};
  try {
    data = await response.json();
  } catch {
    // ignore
  }
  if (!response.ok) {
    throw new Error(data?.error || `请求失败 · HTTP ${response.status}`);
  }
  return data;
}

const TASK_STORAGE_PREFIX = "clawlink:we:task:";

function readStoredTask(projectId) {
  if (!projectId || typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(TASK_STORAGE_PREFIX + projectId);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeStoredTask(projectId, task) {
  if (!projectId || typeof window === "undefined") return;
  try {
    window.localStorage.setItem(TASK_STORAGE_PREFIX + projectId, JSON.stringify(task));
  } catch {
    // ignore
  }
}

function clearStoredTask(projectId) {
  if (!projectId || typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(TASK_STORAGE_PREFIX + projectId);
  } catch {
    // ignore
  }
}

function formatBytes(n) {
  if (!n) return "0 B";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

function WorkspaceFileTree({ files, onPick }) {
  if (!files?.length) return null;
  return (
    <ul className="wc-we-ws-tree">
      {files.map((f) => (
        <li key={f.path}>
          <button type="button" className="wc-we-ws-file" onClick={() => onPick?.(f)}>
            <span className="wc-we-ws-name">{f.path}</span>
            <span className="wc-we-ws-size">{formatBytes(f.size)}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function WebsiteEngineerPanel({
  targetUrl,
  onTargetUrlChange,
  agentTask,
  workspace,
  workspacePolling,
  scanResult,
  running,
  onDispatchAgent,
  onScan,
  onReset,
  onRefreshWorkspace,
}) {
  const previewFrameRef = React.useRef(null);
  const indexUrl = workspace?.indexUrl || "";
  const [previewUrl, setPreviewUrl] = React.useState("");
  const demoUrl = indexUrl || previewUrl;

  React.useEffect(() => {
    setPreviewUrl(indexUrl || "");
  }, [indexUrl]);

  React.useEffect(() => {
    const frame = previewFrameRef.current;
    if (!frame) return;
    if (previewUrl) {
      frame.removeAttribute("srcdoc");
      frame.src = previewUrl;
    } else {
      frame.removeAttribute("src");
      frame.srcdoc =
        "<!doctype html><meta charset='utf-8'><style>body{margin:0;padding:24px;font:13px/1.6 -apple-system,sans-serif;color:#64748b;background:#0f172a;}</style><div style='opacity:.75'>Agent 还没产出可预览的文件。<br/>点「派 agent 仿制」把任务发出去,它会把 <code>index.html</code> 写进工作目录,这里自动加载。</div>";
    }
  }, [previewUrl]);

  return (
    <div className="wc-we-panel">
      <div className="wc-we-controls">
        <label className="wc-we-field">
          <span>目标网址</span>
          <input
            type="text"
            value={targetUrl}
            onChange={(e) => onTargetUrlChange(e.target.value)}
            placeholder="例如 https://example.com"
            className="wc-we-input"
          />
        </label>
        <div className="wc-we-actions">
          <button
            type="button"
            className="wc-we-btn primary"
            disabled={running || !targetUrl.trim()}
            onClick={onDispatchAgent}
            title="让 agent 分析设计并仿制一版,不是 mirror"
          >
            <Globe className="h-4 w-4" />
            <span>{running === "dispatch" ? "派单中…" : "派 agent 仿制"}</span>
          </button>
          <button type="button" className="wc-we-btn secondary" disabled={running || !targetUrl.trim()} onClick={onScan}>
            <ShieldAlert className="h-4 w-4" />
            <span>{running === "scan" ? "巡检中…" : "查询漏洞"}</span>
          </button>
          <button type="button" className="wc-we-btn ghost" disabled={running} onClick={onReset}>
            <RefreshCw className="h-4 w-4" />
            <span>清空</span>
          </button>
        </div>
      </div>

      <div className="wc-we-scroll">
        <section className="wc-we-card">
          <div className="wc-we-card-head">
            <h3>Agent 工作目录</h3>
            <div className="wc-we-card-meta">
              {agentTask
                ? `${agentTask.slug} · ${workspace?.files?.length || 0} 个文件`
                : "点「派 agent 仿制」后,产物会出现在这里"}
            </div>
          </div>
          {agentTask ? (
            <div className="wc-we-archive">
              <span className="wc-we-archive-chip">
                {workspacePolling ? "监听中…" : "已同步"} · 工作目录 {agentTask.workspaceUrl}
              </span>
              <a
                className="wc-we-archive-link"
                href={agentTask.workspaceUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                打开目录
              </a>
              {demoUrl ? (
                <a
                  className="wc-we-archive-link demo"
                  href={demoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  打开仿制站点
                </a>
              ) : null}
              <button type="button" className="wc-we-archive-link" onClick={onRefreshWorkspace}>
                立即刷新
              </button>
            </div>
          ) : null}
          <WorkspaceFileTree
            files={workspace?.files || []}
            onPick={(file) => {
              if (/\.(html?|svg|png|jpe?g|webp|gif|ico|pdf)$/i.test(file.name)) {
                setPreviewUrl(file.url);
              } else {
                window.open(file.url, "_blank", "noopener");
              }
            }}
          />
          {!agentTask ? (
            <div className="wc-we-empty">
              流程: 填好网址 → 点「派 agent 仿制」 → agent 基于 UI 设计用 HTML/CSS 重做一版 → 文件落到工作目录 → 这里自动预览。
            </div>
          ) : null}
          <iframe
            ref={previewFrameRef}
            title="Agent 产物预览"
            sandbox="allow-same-origin allow-forms allow-popups allow-pointer-lock allow-scripts"
            className="wc-we-iframe"
          />
        </section>

        <section className="wc-we-card">
          <div className="wc-we-card-head">
            <h3>漏洞巡检</h3>
            <div className="wc-we-card-meta">
              {scanResult
                ? `${scanResult.title || "无标题"} · ${scanResult.finalUrl || ""} · HTTP ${scanResult.statusCode ?? "--"}`
                : "尚未执行巡检"}
            </div>
          </div>
          <SummaryChips summary={scanResult?.summary} />
          <HeadersBlock headers={scanResult?.headers} />
          <FindingsList findings={scanResult?.findings} />
          {!scanResult ? (
            <div className="wc-we-empty">执行「查询漏洞」后，这里会列出基础风险项、主动探测结果与修复建议。</div>
          ) : null}
        </section>
      </div>
    </div>
  );
}

export default function WorkstationCockpit({
  open,
  project,
  onClose,
  mode = "mock",
  sessionKey: externalSessionKey = "",
  agentId = "",
  sessionEndpoint = "/api/session",
  chatStreamEndpoint = "/api/chat/stream",
  onSessionKeyResolved,
}) {
  const intro = project ? INTRO_BY_PROJECT[project.id] || defaultIntro(project) : null;
  const isWebsiteEngineer = project?.id === "website-engineer";
  const liveEnabled = mode === "live";
  const effectiveAgentId = (project && AGENT_ID_BY_PROJECT[project.id]) || agentId || "";

  const [messages, setMessages] = React.useState([]);
  const [draft, setDraft] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const [targetUrl, setTargetUrl] = React.useState("");
  const [agentTask, setAgentTask] = React.useState(null); // {slug, workspaceAbs, workspaceUrl, prompt}
  const [workspace, setWorkspace] = React.useState(null); // {files, indexUrl, ...}
  const [workspacePolling, setWorkspacePolling] = React.useState(false);
  const [scanResult, setScanResult] = React.useState(null);
  const [running, setRunning] = React.useState(null);
  const [agentStatus, setAgentStatus] = React.useState("idle");
  const [sessionKeyByAgent, setSessionKeyByAgent] = React.useState({});

  const scrollRef = React.useRef(null);
  const textareaRef = React.useRef(null);
  const seenMessageIdsRef = React.useRef(new Set());
  const streamAbortRef = React.useRef(null);
  const workspacePollRef = React.useRef(null);

  // 全局 sessionKey 只在目标 agent 与全局一致时才复用,避免串线到其他 agent 的历史
  const globalAgentMatches = Boolean(
    externalSessionKey && effectiveAgentId && agentId && effectiveAgentId === agentId,
  );
  const effectiveSessionKey =
    sessionKeyByAgent[effectiveAgentId] || (globalAgentMatches ? externalSessionKey : "");

  React.useEffect(() => {
    if (!open || !project || !intro) return;
    setMessages([
      {
        id: `seed-${project.id}-${Date.now()}`,
        role: "assistant",
        sender: `${intro.agentEmoji} ${intro.agentName}`,
        content: intro.seed,
        time: nowTime(),
      },
    ]);
    setDraft("");
    setAgentTask(null);
    setWorkspace(null);
    setWorkspacePolling(false);
    setScanResult(null);
    setTargetUrl("");
    setRunning(null);
    setAgentStatus("idle");
    seenMessageIdsRef.current = new Set();
    if (workspacePollRef.current) {
      clearInterval(workspacePollRef.current);
      workspacePollRef.current = null;
    }

    // 恢复上次派给 agent 的任务 (localStorage 持久化),避免刷新页面工作面板丢失
    if (project.id !== "website-engineer") return;
    const stored = readStoredTask(project.id);
    if (!stored?.slug) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/website-engineer/workspace?slug=${encodeURIComponent(stored.slug)}`,
        );
        if (!res.ok) {
          clearStoredTask(project.id);
          return;
        }
        const data = await res.json();
        if (cancelled) return;
        setAgentTask(stored);
        setWorkspace(data);
        if (stored.targetUrl) setTargetUrl(stored.targetUrl);
        setWorkspacePolling(true);
        workspacePollRef.current = setInterval(async () => {
          try {
            const r = await fetch(
              `/api/website-engineer/workspace?slug=${encodeURIComponent(stored.slug)}`,
            );
            if (!r.ok) return;
            const d = await r.json();
            setWorkspace(d);
          } catch {
            // ignore
          }
        }, 4000);
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, project?.id]);

  React.useEffect(() => {
    return () => {
      if (workspacePollRef.current) {
        clearInterval(workspacePollRef.current);
        workspacePollRef.current = null;
      }
    };
  }, []);

  React.useEffect(() => {
    if (!open) {
      if (streamAbortRef.current) {
        streamAbortRef.current.abort();
        streamAbortRef.current = null;
      }
    }
    return () => {
      if (streamAbortRef.current) {
        streamAbortRef.current.abort();
        streamAbortRef.current = null;
      }
    };
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    const node = scrollRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [messages, open]);

  React.useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => {
      if (event.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  React.useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => textareaRef.current?.focus(), 120);
    return () => clearTimeout(t);
  }, [open]);

  const pushAssistant = React.useCallback(
    (content, tone) => {
      if (!intro) return;
      setMessages((prev) => [
        ...prev,
        {
          id: `a-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          role: "assistant",
          sender: `${intro.agentEmoji} ${intro.agentName}`,
          content,
          tone,
          time: nowTime(),
        },
      ]);
    },
    [intro],
  );

  const runScan = React.useCallback(
    async (url) => {
      setRunning("scan");
      try {
        const data = await postJson("/api/website-engineer/scan", { url });
        setScanResult(data);
        return data;
      } finally {
        setRunning(null);
      }
    },
    [],
  );

  const refreshWorkspace = React.useCallback(async (slug) => {
    if (!slug) return null;
    try {
      const res = await fetch(`/api/website-engineer/workspace?slug=${encodeURIComponent(slug)}`);
      if (!res.ok) return null;
      const data = await res.json();
      setWorkspace(data);
      return data;
    } catch {
      return null;
    }
  }, []);

  const startWorkspacePolling = React.useCallback(
    (slug) => {
      if (workspacePollRef.current) {
        clearInterval(workspacePollRef.current);
        workspacePollRef.current = null;
      }
      setWorkspacePolling(true);
      refreshWorkspace(slug);
      workspacePollRef.current = setInterval(() => {
        refreshWorkspace(slug);
      }, 4000);
    },
    [refreshWorkspace],
  );

  const handleManualScan = React.useCallback(async () => {
    const url = targetUrl.trim();
    if (!url) return;
    pushAssistant(`▶ 手动触发巡检：${url}`);
    try {
      const data = await runScan(url);
      pushAssistant(
        `✅ 巡检完成 · 高危 ${data.summary?.high || 0} · 中危 ${data.summary?.medium || 0} · 低危 ${data.summary?.low || 0}`,
        data.summary?.high ? "warn" : "ok",
      );
    } catch (error) {
      pushAssistant(`❌ 巡检失败：${error.message}`, "warn");
    }
  }, [targetUrl, runScan, pushAssistant]);

  const handleRefreshWorkspace = React.useCallback(() => {
    if (agentTask?.slug) refreshWorkspace(agentTask.slug);
  }, [agentTask, refreshWorkspace]);

  const handleResetPanel = React.useCallback(() => {
    if (workspacePollRef.current) {
      clearInterval(workspacePollRef.current);
      workspacePollRef.current = null;
    }
    setAgentTask(null);
    setWorkspace(null);
    setWorkspacePolling(false);
    setScanResult(null);
    clearStoredTask(project?.id);
    pushAssistant("🧹 工作面板已清空。");
  }, [pushAssistant, project]);

  const ensureSession = React.useCallback(async () => {
    if (effectiveSessionKey) return effectiveSessionKey;
    if (!effectiveAgentId) {
      throw new Error(
        `没有指定目标 Agent。请先在右上角配置中设置 agentId,或在 OpenClaw Gateway 注册 "${AGENT_ID_BY_PROJECT[project?.id] || "browser_automation_operator"}"。`,
      );
    }
    const label = `ClawLink · ${intro?.agentName || project?.role || "Agent"}`;
    const data = await fetchJsonOrThrow(
      sessionEndpoint,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label, agentId: effectiveAgentId }),
      },
      "会话创建失败",
    );
    const nextKey = extractSessionKey(data);
    if (!nextKey) throw new Error("已创建会话,但未解析到 sessionKey");
    setSessionKeyByAgent((prev) => ({ ...prev, [effectiveAgentId]: nextKey }));
    if (effectiveAgentId === agentId) {
      onSessionKeyResolved?.(nextKey);
    }
    return nextKey;
  }, [
    effectiveSessionKey,
    effectiveAgentId,
    agentId,
    sessionEndpoint,
    intro,
    project,
    onSessionKeyResolved,
  ]);

  const sendToAgent = React.useCallback(
    async (userText, toolContext) => {
      setAgentStatus("connecting");
      const contextSuffix = toolContext ? `\n\n[ClawLink 本地工具已执行]\n${toolContext}` : "";
      const composedMessage = `${userText}${contextSuffix}`;
      const controller = new AbortController();
      streamAbortRef.current = controller;

      // 不在前端做超时。后端已经:
      //  1) 用 SSE 注释 (writeEventStreamComment) 做心跳,保持连接不断
      //  2) 自己用 gatewayStreamTimeoutMs + agent.wait 管住 agent 运行上限
      //  3) 会把工具过程通过 session.message 事件一条条推过来
      // 前端只负责:接到 done / error 就结束,接到 abort 就清理。
      const ingestMessage = (rawMsg, idHint) => {
        if (!rawMsg) return;
        const msg = rawMsg;
        const msgId =
          idHint ||
          msg.messageId ||
          msg.messageSeq ||
          `${msg.role}-${msg.time || Date.now()}-${msg.content?.slice(0, 8) || ""}`;
        if (seenMessageIdsRef.current.has(msgId)) return;
        seenMessageIdsRef.current.add(msgId);
        const msgText = (msg.content || "").trim();
        if (msg.role === "user") return;
        if (!msgText) return;
        if (msgText === userText.trim() || msgText === composedMessage.trim()) return;
        setMessages((prev) => [
          ...prev,
          {
            id: `a-${msgId}`,
            role: "assistant",
            sender: `${intro.agentEmoji} ${intro.agentName}`,
            content: msgText,
            time: msg.time || nowTime(),
          },
        ]);
      };

      let streamError = null;
      let streamAccepted = false;

      try {
        const activeKey = await ensureSession();
        const body = {
          message: composedMessage,
          sessionKey: activeKey,
          agentId: effectiveAgentId,
          idempotencyKey: crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`,
        };

        await fetchEventStream(
          chatStreamEndpoint,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
            signal: controller.signal,
          },
          {
            fallbackMessage: "流式发送失败",
            onEvent: (eventName, payload) => {
              if (controller.signal.aborted) return;
              if (eventName === "accepted") {
                streamAccepted = true;
                setAgentStatus("streaming");
                const nextKey = extractSessionKey(payload, activeKey);
                if (nextKey && nextKey !== activeKey) {
                  setSessionKeyByAgent((prev) => ({ ...prev, [effectiveAgentId]: nextKey }));
                  if (effectiveAgentId === agentId) onSessionKeyResolved?.(nextKey);
                }
                return;
              }
              if (eventName === "message" && payload?.message) {
                ingestMessage(payload.message, payload.messageId || payload.messageSeq);
                return;
              }
              if (eventName === "history" && Array.isArray(payload?.messages)) {
                for (const m of payload.messages) ingestMessage(m);
                return;
              }
              if (eventName === "error") {
                streamError = new Error(payload?.error || "Agent 流式错误");
                controller.abort();
                return;
              }
              if (eventName === "done") {
                setAgentStatus("idle");
              }
            },
          },
        );
        if (streamError) throw streamError;
      } catch (error) {
        if (controller.signal.aborted && !streamError) return;
        const err = streamError || error;
        // 如果流还没被后端 accepted,退回到阻塞式接口(跟主聊天一样的兜底)
        if (!streamAccepted && !streamError) {
          try {
            const fallbackUrl = chatStreamEndpoint.replace(/\/stream$/, "");
            const data = await fetchJsonOrThrow(
              fallbackUrl,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  message: composedMessage,
                  sessionKey: effectiveSessionKey || "",
                  agentId: effectiveAgentId,
                  idempotencyKey: crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`,
                }),
              },
              "消息发送失败",
            );
            if (data?.reply) pushAssistant(data.reply);
            const nextKey = extractSessionKey(data);
            if (nextKey) {
              setSessionKeyByAgent((prev) => ({ ...prev, [effectiveAgentId]: nextKey }));
              if (effectiveAgentId === agentId) onSessionKeyResolved?.(nextKey);
            }
            return;
          } catch (fallbackErr) {
            pushAssistant(`❌ Agent 通道异常：${fallbackErr.message || String(fallbackErr)}`, "warn");
            return;
          }
        }
        pushAssistant(`❌ Agent 通道异常：${err.message || String(err)}`, "warn");
      } finally {
        setAgentStatus("idle");
        if (streamAbortRef.current === controller) {
          streamAbortRef.current = null;
        }
      }
    },
    [
      ensureSession,
      chatStreamEndpoint,
      effectiveAgentId,
      effectiveSessionKey,
      agentId,
      onSessionKeyResolved,
      intro,
      pushAssistant,
    ],
  );

  const handleDispatchAgent = React.useCallback(async () => {
    const url = targetUrl.trim();
    if (!url) return;
    setRunning("dispatch");
    try {
      const task = await postJson("/api/website-engineer/agent-task", { url });
      setAgentTask(task);
      writeStoredTask(project?.id, {
        slug: task.slug,
        workspaceUrl: task.workspaceUrl,
        workspaceAbs: task.workspaceAbs,
        targetUrl: task.targetUrl || url,
        prompt: task.prompt,
        createdAt: Date.now(),
      });
      pushAssistant(
        `▶ 已为 ${url} 建好工作目录 ${task.workspaceUrl}，派单给 agent 仿制设计。右侧会轮询产物。`,
        "ok",
      );
      startWorkspacePolling(task.slug);
      if (liveEnabled) {
        setRunning(null);
        await sendToAgent(task.prompt, "");
      }
    } catch (error) {
      pushAssistant(`❌ 派单失败：${error.message}`, "warn");
    } finally {
      setRunning(null);
    }
  }, [targetUrl, pushAssistant, startWorkspacePolling, liveEnabled, sendToAgent, project]);

  const handleSend = React.useCallback(async () => {
    const text = draft.trim();
    if (!text || sending || !project || !intro) return;
    setMessages((prev) => [
      ...prev,
      { id: `u-${Date.now()}`, role: "user", content: text, time: nowTime() },
    ]);
    setDraft("");
    setSending(true);

    let toolContext = "";

    try {
      if (isWebsiteEngineer) {
        const detectedUrl = pickUrl(text) || targetUrl.trim();
        if (detectedUrl && detectedUrl !== targetUrl) setTargetUrl(detectedUrl);
        if (detectedUrl && detectScanIntent(text)) {
          try {
            const data = await runScan(detectedUrl);
            const s = data.summary || {};
            const top = (data.findings || []).slice(0, 5).map((f) => `[${f.level}] ${f.title}`).join("; ");
            toolContext = `巡检 ${detectedUrl} → 高危${s.high || 0}/中危${s.medium || 0}/低危${s.low || 0}。${top}`;
            pushAssistant(
              `✅ 巡检完成 · 高危 ${s.high || 0} · 中危 ${s.medium || 0} · 低危 ${s.low || 0}`,
              s.high ? "warn" : "ok",
            );
          } catch (error) {
            toolContext = `巡检失败: ${error.message}`;
            pushAssistant(`❌ 巡检失败：${error.message}`, "warn");
          }
        }
      }

      if (liveEnabled) {
        await sendToAgent(text, toolContext);
      } else if (!isWebsiteEngineer) {
        pushAssistant("当前处于演示模式（mock），真 Agent 通道未启用。在右上角切到真实接口模式就能和我正式对话。");
      } else if (!toolContext) {
        pushAssistant("演示模式下只能跑本地工具；如果想让我仿制设计，点右边「派 agent 仿制」或切到真实接口模式。");
      }
    } finally {
      setSending(false);
    }
  }, [
    draft,
    sending,
    project,
    intro,
    isWebsiteEngineer,
    targetUrl,
    pushAssistant,
    runScan,
    liveEnabled,
    sendToAgent,
  ]);

  const handleKeyDown = (event) => {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      handleSend();
    }
  };

  return (
    <div className={`wc-shell ${open ? "open" : ""}`} aria-hidden={!open} role="dialog" aria-modal="true">
      <button type="button" className="wc-backdrop" onClick={onClose} aria-label="关闭工位对话框" />
      {open && project && intro ? (
        <section className="wc-panel" onClick={(e) => e.stopPropagation()}>
          <header className="wc-header">
            <div className="wc-header-left">
              <span className="wc-header-emoji" style={{ background: `${project.color}22`, color: project.color }}>
                {project.emoji}
              </span>
              <div>
                <div className="wc-header-eyebrow">工位对话 · {project.role}</div>
                <div className="wc-header-title">
                  {intro.agentEmoji} {intro.agentName}
                </div>
                {intro.tagline ? <div className="wc-header-sub">{intro.tagline}</div> : null}
                {liveEnabled && effectiveAgentId ? (
                  <div className="wc-header-agent">agent · <code>{effectiveAgentId}</code></div>
                ) : null}
              </div>
            </div>
            <div className="wc-header-right">
              {!isWebsiteEngineer && project.url ? (
                <a
                  className="wc-icon-btn"
                  href={project.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={`在新标签页打开 ${project.role} 的独立页`}
                >
                  <ExternalLink className="h-4 w-4" />
                </a>
              ) : null}
              <button type="button" className="wc-icon-btn" onClick={onClose} aria-label="关闭">
                <X className="h-4 w-4" />
              </button>
            </div>
          </header>

          <div className="wc-body">
            <div className="wc-left">
              <div ref={scrollRef} className="wc-messages">
                {messages.map((msg) => (
                  <MessageBubble key={msg.id} message={msg} />
                ))}
                {sending || running || agentStatus !== "idle" ? (
                  <div className="wc-bubble-row agent">
                    <div className="wc-bubble agent thinking">
                      <span className="wc-dot" />
                      <span className="wc-dot" />
                      <span className="wc-dot" />
                    </div>
                  </div>
                ) : null}
              </div>

              {intro.suggestions?.length ? (
                <div className="wc-suggestions">
                  {intro.suggestions.map((tip) => (
                    <button key={tip} type="button" className="wc-suggestion-chip" onClick={() => setDraft(tip)}>
                      {tip}
                    </button>
                  ))}
                </div>
              ) : null}

              <div className="wc-composer">
                <textarea
                  ref={textareaRef}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={handleKeyDown}
                  rows={3}
                  placeholder={
                    isWebsiteEngineer
                      ? "告诉操作员去哪个网址、做什么动作（⌘/Ctrl + Enter 发送）"
                      : "输入给这个工位的任务指令（⌘/Ctrl + Enter 发送）"
                  }
                  className="wc-textarea"
                />
                <div className="wc-composer-actions">
                  <span className="wc-composer-hint">
                    {agentStatus === "connecting"
                      ? "连接 OpenClaw…"
                      : agentStatus === "streaming"
                      ? "Agent 正在回复…"
                      : running
                      ? running === "dispatch"
                        ? "派单给 agent…"
                        : "巡检工具运行中…"
                      : sending
                      ? "操作员处理中…"
                      : liveEnabled
                      ? `⌘/Ctrl + Enter 发送 · 目标 agent: ${effectiveAgentId || "未设置"} · ${effectiveSessionKey ? "会话就绪" : "待创建会话"}`
                      : "⌘/Ctrl + Enter 发送 · 演示模式"}
                  </span>
                  <button
                    type="button"
                    className="wc-send"
                    disabled={!draft.trim() || sending}
                    onClick={handleSend}
                  >
                    <SendHorizontal className="h-4 w-4" />
                    <span>派发</span>
                  </button>
                </div>
              </div>
            </div>

            <div className="wc-right">
              <div className="wc-right-header">
                <div className="wc-right-title">实时工作面板</div>
              </div>
              {isWebsiteEngineer ? (
                <WebsiteEngineerPanel
                  targetUrl={targetUrl}
                  onTargetUrlChange={setTargetUrl}
                  agentTask={agentTask}
                  workspace={workspace}
                  workspacePolling={workspacePolling}
                  scanResult={scanResult}
                  running={running}
                  onDispatchAgent={handleDispatchAgent}
                  onScan={handleManualScan}
                  onReset={handleResetPanel}
                  onRefreshWorkspace={handleRefreshWorkspace}
                />
              ) : (
                <div className="wc-right-empty">
                  <div className="wc-right-empty-title">这个工位还没有独立工作面板</div>
                  <div className="wc-right-empty-sub">
                    左侧可以先和这位同事聊聊思路。真实 agent 接入后，这里会显示工具调用的实时产物。
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}
