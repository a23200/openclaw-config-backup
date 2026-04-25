const examplePayload = {
  video_id: 1,
  comments: [
    {
      platform_comment_id: "comment_90001",
      content: "这个怎么联系？多少钱？",
      like_count: 12,
      reply_count: 2,
      comment_time: "2026-04-10T10:20:00+08:00",
      author: {
        platform_user_id: "user_10001",
        nickname: "想做副业的小王",
        profile_url: "https://www.douyin.com/user/user_10001",
        bio: "杭州 | 电商创业",
        province: "浙江",
        city: "杭州",
        follower_count: 120,
        following_count: 88,
        liked_count: 3500,
      },
    },
    {
      platform_comment_id: "comment_90002",
      content: "效果怎么样？新手能做吗？",
      like_count: 6,
      reply_count: 1,
      comment_time: "2026-04-10T10:30:00+08:00",
      author: {
        platform_user_id: "user_10002",
        nickname: "阿浩",
        profile_url: "https://www.douyin.com/user/user_10002",
        bio: "广州 | 自由职业",
        province: "广东",
        city: "广州",
        follower_count: 60,
        following_count: 140,
        liked_count: 1800,
      },
    },
  ],
};

const state = {
  leads: [],
  tasks: [],
  videos: [],
  lastCollectResult: null,
  lastDiscoverResult: null,
  lastBatchCollectResult: null,
  selectedLeadIds: new Set(),
  taskQueueProgress: null,
};

const STORAGE_KEYS = {
  discover: "leadops:lastDiscoverResult",
  collect: "leadops:lastCollectResult",
  batch: "leadops:lastBatchCollectResult",
};

const DISCOVERY_FILTER_LABELS = {
  sort_by: {
    comprehensive: "综合排序",
    latest: "最新发布",
    most_liked: "最多点赞",
  },
  publish_time: {
    all: "不限",
    day: "一天内",
    week: "一周内",
    half_year: "半年内",
  },
  video_duration: {
    all: "不限",
    lt_1m: "1分钟以下",
    between_1m_5m: "1-5分钟",
    gt_5m: "5分钟以上",
  },
  search_scope: {
    all: "不限",
    following: "关注的人",
    recent: "最近看过",
    unseen: "还未看过",
  },
};

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

  if (!response.ok) {
    const text = await response.text();
    let message = text || `Request failed: ${response.status}`;
    try {
      const parsed = JSON.parse(text);
      message = parsed.detail || message;
    } catch {}
    throw new Error(message);
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

function showToast(message, isError = false) {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.classList.remove("hidden");
  toast.style.background = isError ? "#e5484d" : "linear-gradient(135deg, #2764ff, #12b8ff)";
  clearTimeout(showToast.timeoutId);
  showToast.timeoutId = setTimeout(() => toast.classList.add("hidden"), 2800);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function truncateMiddle(value, head = 14, tail = 10) {
  const text = String(value ?? "");
  if (text.length <= head + tail + 1) {
    return text;
  }
  return `${text.slice(0, head)}...${text.slice(-tail)}`;
}

function formatDate(value) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function findLead(leadId) {
  return state.leads.find((lead) => lead.id === leadId);
}

function sortTasksNewestFirst(tasks) {
  return [...tasks].sort((left, right) => {
    const leftTime = new Date(left.created_at || 0).getTime();
    const rightTime = new Date(right.created_at || 0).getTime();
    return rightTime - leftTime;
  });
}

function upsertTask(task) {
  state.tasks = sortTasksNewestFirst([...state.tasks.filter((item) => item.id !== task.id), task]);
  renderTasks(state.tasks);
}

function getVisibleLeadIds() {
  return state.leads.map((lead) => lead.id);
}

function syncLeadSelectionUi() {
  const selectedCount = state.selectedLeadIds.size;
  document.getElementById("selectedLeadCount").textContent = `已选 ${selectedCount} 条线索`;

  const toggleAll = document.getElementById("toggleAllLeads");
  if (!toggleAll) {
    return;
  }

  const visibleLeadIds = getVisibleLeadIds();
  const selectedVisibleCount = visibleLeadIds.filter((leadId) => state.selectedLeadIds.has(leadId)).length;
  toggleAll.checked = visibleLeadIds.length > 0 && selectedVisibleCount === visibleLeadIds.length;
  toggleAll.indeterminate = selectedVisibleCount > 0 && selectedVisibleCount < visibleLeadIds.length;
}

function clearLeadSelection({ rerender = true } = {}) {
  state.selectedLeadIds.clear();
  if (rerender) {
    renderLeads(state.leads);
  } else {
    syncLeadSelectionUi();
  }
}

function toggleLeadSelection(leadId, checked) {
  if (checked) {
    state.selectedLeadIds.add(leadId);
  } else {
    state.selectedLeadIds.delete(leadId);
  }
  syncLeadSelectionUi();
}

function setVisibleLeadSelection(checked) {
  getVisibleLeadIds().forEach((leadId) => {
    if (checked) {
      state.selectedLeadIds.add(leadId);
    } else {
      state.selectedLeadIds.delete(leadId);
    }
  });
  renderLeads(state.leads);
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const input = document.createElement("textarea");
  input.value = text;
  input.setAttribute("readonly", "");
  input.style.position = "fixed";
  input.style.opacity = "0";
  document.body.appendChild(input);
  input.select();
  document.execCommand("copy");
  document.body.removeChild(input);
}

function renderSummary(summary) {
  document.getElementById("summaryVideos").textContent = summary.videos;
  document.getElementById("summaryComments").textContent = summary.comments;
  document.getElementById("summaryLeads").textContent = summary.leads;
  document.getElementById("summaryHighIntent").textContent = summary.high_intent_leads;
  document.getElementById("summaryTasks").textContent = summary.outreach_tasks;
  document.getElementById("summarySentTasks").textContent = summary.sent_tasks;
}

function setKeywordValue(value) {
  const normalized = String(value ?? "");
  const quickKeywords = document.getElementById("quickKeywords");
  const discoverForm = document.getElementById("discoverVideosForm");
  if (quickKeywords && quickKeywords.value !== normalized) {
    quickKeywords.value = normalized;
  }
  if (discoverForm?.elements?.keywords && discoverForm.elements.keywords.value !== normalized) {
    discoverForm.elements.keywords.value = normalized;
  }
}

function formatDiscoveryFilters(result) {
  const sortBy = DISCOVERY_FILTER_LABELS.sort_by[result.sort_by] || result.sort_by || "综合排序";
  const publishTime = DISCOVERY_FILTER_LABELS.publish_time[result.publish_time] || result.publish_time || "不限";
  const videoDuration = DISCOVERY_FILTER_LABELS.video_duration[result.video_duration] || result.video_duration || "不限";
  const searchScope = DISCOVERY_FILTER_LABELS.search_scope[result.search_scope] || result.search_scope || "不限";
  return `排序 ${sortBy} / 时间 ${publishTime} / 时长 ${videoDuration} / 范围 ${searchScope}`;
}

function renderCollectResult(result) {
  const panel = document.getElementById("collectResultPanel");
  if (!result) {
    panel.classList.add("hidden");
    return;
  }

  panel.classList.remove("hidden");
  document.getElementById("collectResultTitle").textContent = result.page_title || "-";
  document.getElementById("collectResultVideoId").textContent = result.platform_video_id || "-";
  document.getElementById("collectResultCount").textContent = result.collected_count ?? 0;
  document.getElementById("collectResultRawCount").textContent = result.raw_collected_count ?? 0;
  document.getElementById("collectResultFiltered").textContent = result.filtered_out_count ?? 0;
  document.getElementById("collectResultLeads").textContent = result.imported?.created_leads ?? 0;

  const resultUrl = document.getElementById("collectResultUrl");
  resultUrl.textContent = result.video_url || "-";
  resultUrl.href = result.video_url || "#";

  document.getElementById("collectResultSnippet").textContent = result.body_snippet || "-";
  document.getElementById("collectResultProfiles").innerHTML = (result.sample_profiles || [])
    .map((profile) => `<a class="tag" href="${escapeHtml(profile)}" target="_blank" rel="noreferrer">主页</a>`)
    .join("");

  sessionStorage.setItem(STORAGE_KEYS.collect, JSON.stringify(result));
}

function renderDiscoverResult(result) {
  const panel = document.getElementById("discoverResultPanel");
  if (!result) {
    panel.classList.add("hidden");
    return;
  }

  panel.classList.remove("hidden");
  document.getElementById("discoverResultKeywords").textContent = (result.keywords || []).join(" / ") || "-";
  document.getElementById("discoverResultFilters").textContent = formatDiscoveryFilters(result);
  document.getElementById("discoverResultCount").textContent = result.discovered_count ?? 0;
  document.getElementById("discoverResultCreated").textContent = result.created_videos ?? 0;
  document.getElementById("discoverResultExisting").textContent = result.existing_videos ?? 0;

  document.getElementById("discoverResultVideos").innerHTML = (result.videos || [])
    .slice(0, 12)
    .map(
      (video) => `
        <div class="history-item">
          <strong>${escapeHtml(video.keyword)} · ${escapeHtml(video.title || video.platform_video_id)}</strong>
          <span class="hint">${escapeHtml(video.platform_video_id)}</span>
          <div class="inline-actions">
            <a class="button-link small" href="${escapeHtml(video.video_url)}" target="_blank" rel="noreferrer">打开视频</a>
            <button class="small ghost" type="button" data-action="collect-video-url" data-url="${escapeHtml(video.video_url)}">按当前规则抓评论</button>
          </div>
        </div>
      `
    )
    .join("");

  sessionStorage.setItem(STORAGE_KEYS.discover, JSON.stringify(result));
}

function queueStatusLabel(item) {
  if (item.status === "pending") {
    return "等待";
  }
  if (item.status === "running") {
    return "进行中";
  }
  if (item.status === "skipped") {
    return "跳过";
  }
  return item.success ? "成功" : "失败";
}

function renderBatchCollectResult(result) {
  const panel = document.getElementById("batchCollectResultPanel");
  if (!result) {
    panel.classList.add("hidden");
    return;
  }

  panel.classList.remove("hidden");
  document.getElementById("batchCollectRequested").textContent = result.requested_count ?? 0;
  document.getElementById("batchCollectSuccess").textContent = result.success_count ?? 0;
  document.getElementById("batchCollectComments").textContent = result.total_comments ?? 0;
  document.getElementById("batchCollectLeads").textContent = result.total_created_leads ?? 0;

  document.getElementById("batchCollectResultList").innerHTML = (result.results || [])
    .map(
      (item) => `
        <div class="history-item">
          <strong>${escapeHtml(item.page_title || item.platform_video_id || "未命名视频")}</strong>
          <span class="hint">${escapeHtml(item.detail || "-")}</span>
          <div class="tag-list">
            <span class="tag">${queueStatusLabel(item)}</span>
            <span class="tag">${escapeHtml(item.platform_video_id || "-")}</span>
            <span class="tag">原始 ${item.raw_collected_count ?? 0}</span>
            <span class="tag">评论 ${item.collected_count ?? 0}</span>
            <span class="tag">过滤 ${item.filtered_out_count ?? 0}</span>
            <span class="tag">线索 ${item.created_leads ?? 0}</span>
          </div>
        </div>
      `
    )
    .join("") || '<p class="hint">暂无批量抓评结果</p>';

  sessionStorage.setItem(STORAGE_KEYS.batch, JSON.stringify(result));
}

function clearStoredResults({ discover = false, collect = false, batch = false } = {}) {
  if (discover) {
    sessionStorage.removeItem(STORAGE_KEYS.discover);
    state.lastDiscoverResult = null;
    renderDiscoverResult(null);
  }
  if (collect) {
    sessionStorage.removeItem(STORAGE_KEYS.collect);
    state.lastCollectResult = null;
    renderCollectResult(null);
  }
  if (batch) {
    sessionStorage.removeItem(STORAGE_KEYS.batch);
    state.lastBatchCollectResult = null;
    renderBatchCollectResult(null);
  }
}

function getKeywordSourceText() {
  const quickKeywords = document.getElementById("quickKeywords");
  const discoverForm = document.getElementById("discoverVideosForm");
  const quickValue = String(quickKeywords?.value || "").trim();
  if (quickValue) {
    return quickValue;
  }
  return String(discoverForm?.elements?.keywords?.value || "").trim();
}

function readDiscoverPayload() {
  const form = document.getElementById("discoverVideosForm");
  const formData = new FormData(form);
  const keywords = getKeywordSourceText()
    .split(/[\n,，]/)
    .map((item) => item.trim())
    .filter(Boolean);

  return {
    keywords,
    max_keywords: Number(formData.get("max_keywords") || 3),
    max_videos_per_keyword: Number(formData.get("max_videos_per_keyword") || 8),
    sort_by: String(formData.get("sort_by") || "comprehensive"),
    publish_time: String(formData.get("publish_time") || "all"),
    video_duration: String(formData.get("video_duration") || "all"),
    search_scope: String(formData.get("search_scope") || "all"),
    auto_connect: formData.get("auto_connect") === "on",
    persist_videos: true,
  };
}

function readCollectPayload(videoUrl = null) {
  const form = document.getElementById("douyinCollectForm");
  return {
    video_url: videoUrl ?? String(form.elements.video_url.value || "").trim(),
    max_scrolls: Number(form.elements.max_scrolls.value || 8),
    max_comments: Number(form.elements.max_comments.value || 80),
    min_level: String(form.elements.min_level.value || "medium"),
    rule_keywords: String(form.elements.rule_keywords.value || "")
      .split(/[\n,，]/)
      .map((item) => item.trim())
      .filter(Boolean),
    auto_connect: form.elements.auto_connect.checked,
  };
}

function readBatchCollectPayload(videoIds = []) {
  const batchLimitInput = document.getElementById("quickBatchLimit");
  const onlyUningestedInput = document.getElementById("quickOnlyUningested");
  const collectPayload = readCollectPayload();
  const limit = Math.max(videoIds.length || Number(batchLimitInput.value || 5), 1);

  return {
    video_ids: videoIds,
    limit,
    only_uningested: onlyUningestedInput.checked,
    max_scrolls: collectPayload.max_scrolls,
    max_comments: collectPayload.max_comments,
    min_level: collectPayload.min_level,
    rule_keywords: collectPayload.rule_keywords,
    auto_connect: collectPayload.auto_connect,
  };
}

function readTaskFormPayload({ requireLeadId = false } = {}) {
  const form = document.getElementById("taskForm");
  const leadIdValue = String(form.elements.lead_id.value || "").trim();
  const messageContent = String(form.elements.message_content.value || "").trim();
  const templateCode = String(form.elements.template_code.value || "").trim();

  if (!messageContent) {
    throw new Error("请先填写消息内容");
  }

  const payload = {
    message_content: messageContent,
  };

  if (templateCode) {
    payload.template_code = templateCode;
  }

  if (leadIdValue) {
    const leadId = Number(leadIdValue);
    if (!Number.isInteger(leadId) || leadId <= 0) {
      throw new Error("线索 ID 格式不正确");
    }
    payload.lead_id = leadId;
  } else if (requireLeadId) {
    throw new Error("手动创建单条任务时，请填写线索 ID");
  }

  return payload;
}

function createTaskQueueProgress(tasks) {
  return {
    planned_count: tasks.length,
    completed_count: 0,
    success_count: 0,
    failed_count: 0,
    current_label: "-",
    items: tasks.map((task) => ({
      task_id: task.id,
      lead_id: task.lead_id,
      label: task.user_nickname || `Lead #${task.lead_id}`,
      message_content: task.message_content,
      status: "pending",
      success: false,
      detail: "等待执行",
    })),
  };
}

function renderTaskQueueProgress(progress) {
  const current = progress || {
    planned_count: 0,
    completed_count: 0,
    success_count: 0,
    failed_count: 0,
    current_label: "-",
    items: [],
  };

  document.getElementById("taskQueuePlanned").textContent = current.planned_count;
  document.getElementById("taskQueueCompleted").textContent = current.completed_count;
  document.getElementById("taskQueueSuccess").textContent = current.success_count;
  document.getElementById("taskQueueFailed").textContent = current.failed_count;
  document.getElementById("taskQueueCurrent").textContent = current.current_label || "-";

  document.getElementById("taskQueueProgressList").innerHTML = current.items.length
    ? current.items
      .map(
        (item) => `
          <div class="history-item">
            <strong>任务 #${item.task_id} · ${escapeHtml(item.label)}</strong>
            <span class="hint">${queueStatusLabel(item)} · ${escapeHtml(item.detail || "-")}</span>
            <div class="hint">线索 #${item.lead_id} · ${escapeHtml(item.message_content || "")}</div>
          </div>
        `
      )
      .join("")
    : '<p class="hint">还没有执行记录。</p>';
}

function scrollToPanel(panelId) {
  const panel = document.getElementById(panelId);
  if (!panel || panel.classList.contains("hidden")) {
    return;
  }
  panel.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function runQuickAction(button, pendingText, job) {
  const buttons = Array.from(new Set([...document.querySelectorAll("[data-quick-action]"), button]));
  buttons.forEach((item) => {
    if (!item.dataset.originalText) {
      item.dataset.originalText = item.textContent;
    }
    item.disabled = true;
    if (item === button) {
      item.textContent = pendingText;
    }
  });

  try {
    return await job();
  } finally {
    buttons.forEach((item) => {
      item.disabled = false;
      item.textContent = item.dataset.originalText || item.textContent;
    });
  }
}

function renderVideos(videos) {
  const tbody = document.getElementById("videosTableBody");
  tbody.innerHTML = videos
    .map(
      (video) => `
        <tr>
          <td class="col-id">${video.id}</td>
          <td class="col-title">
            <a
              class="table-link clamp-2"
              href="${escapeHtml(video.video_url)}"
              target="_blank"
              rel="noreferrer"
              title="${escapeHtml(video.title || "-")}"
            >${escapeHtml(video.title || "-")}</a>
          </td>
          <td class="col-platform-id"><code class="cell-code" title="${escapeHtml(video.platform_video_id)}">${escapeHtml(video.platform_video_id)}</code></td>
          <td class="col-status"><span class="status-pill status-${escapeHtml(video.status)}">${escapeHtml(video.status)}</span></td>
          <td class="col-time">${formatDate(video.last_ingested_at)}</td>
          <td class="col-actions">
            <div class="action-stack compact">
              <button class="small primary" type="button" data-action="collect-video" data-id="${video.id}" data-url="${escapeHtml(video.video_url)}">按当前规则抓评论</button>
            </div>
          </td>
        </tr>
      `
    )
    .join("");
}

function renderLeads(leads) {
  state.leads = leads;
  state.selectedLeadIds = new Set(
    [...state.selectedLeadIds].filter((leadId) => leads.some((lead) => lead.id === leadId))
  );
  const tbody = document.getElementById("leadsTableBody");
  tbody.innerHTML = leads
    .map(
      (lead) => `
        <tr>
          <td class="col-select">
            <input type="checkbox" data-lead-checkbox data-id="${lead.id}" ${state.selectedLeadIds.has(lead.id) ? "checked" : ""} />
          </td>
          <td class="col-id">${lead.id}</td>
          <td class="col-user">
            <div class="user-cell">
              <div class="user-name" title="${escapeHtml(lead.user_nickname)}">${escapeHtml(lead.user_nickname)}</div>
              <code class="cell-code user-code" title="${escapeHtml(lead.platform_user_id)}">${escapeHtml(truncateMiddle(lead.platform_user_id))}</code>
              ${lead.profile_url ? `<a class="button-link small user-link" href="${escapeHtml(lead.profile_url)}" target="_blank" rel="noreferrer">打开主页</a>` : ""}
            </div>
          </td>
          <td class="col-comment"><div class="cell-clamp clamp-3" title="${escapeHtml(lead.latest_comment_content || "-")}">${escapeHtml(lead.latest_comment_content || "-")}</div></td>
          <td class="col-level"><span class="level-pill level-${escapeHtml(lead.level)}">${escapeHtml(lead.level)}</span></td>
          <td class="col-score">${lead.score}</td>
          <td class="col-keywords"><div class="tag-list">${lead.hit_keywords
            .map((item) => `<span class="tag">${escapeHtml(item)}</span>`)
            .join("")}</div></td>
          <td class="col-status"><span class="status-pill status-${escapeHtml(lead.status)}">${escapeHtml(lead.status)}</span></td>
          <td class="col-actions">
            <div class="action-stack">
              <button class="small primary span-full" type="button" data-action="lead-greet" data-id="${lead.id}">代我发送“您好”</button>
              <button class="small ghost" type="button" data-action="lead-detail" data-id="${lead.id}">查看详情</button>
              <button class="small ghost" type="button" data-action="lead-qualified" data-id="${lead.id}">标记 qualified</button>
              <button class="small ghost" type="button" data-action="lead-working" data-id="${lead.id}">标记 working</button>
              <button class="small primary" type="button" data-action="prefill-task" data-id="${lead.id}">创建任务</button>
            </div>
          </td>
        </tr>
      `
    )
    .join("");
  syncLeadSelectionUi();
}

function renderTasks(tasks) {
  state.tasks = tasks;
  const tbody = document.getElementById("tasksTableBody");
  tbody.innerHTML = tasks
    .map(
      (task) => `
        <tr>
          <td class="col-id">${task.id}</td>
          <td class="col-lead-id">${task.lead_id}</td>
          <td class="col-user">
            <div class="user-cell">
              <div class="user-name" title="${escapeHtml(task.user_nickname || "-")}">${escapeHtml(task.user_nickname || "-")}</div>
              ${task.profile_url ? `<a class="button-link small user-link" href="${escapeHtml(task.profile_url)}" target="_blank" rel="noreferrer">打开主页</a>` : `<span class="hint">无主页</span>`}
            </div>
          </td>
          <td class="col-template"><code class="cell-code" title="${escapeHtml(task.template_code || "-")}">${escapeHtml(task.template_code || "-")}</code></td>
          <td class="col-status"><span class="status-pill status-${escapeHtml(task.status)}">${escapeHtml(task.status)}</span></td>
          <td class="col-time">${formatDate(task.sent_at)}</td>
          <td class="col-message">
            <div class="cell-clamp clamp-3" title="${escapeHtml(task.message_content)}">${escapeHtml(task.message_content)}</div>
            ${task.error_message ? `<div class="hint error-text" title="${escapeHtml(task.error_message)}">错误：${escapeHtml(task.error_message)}</div>` : ""}
          </td>
          <td class="col-actions">
            <div class="action-stack compact">
              <button class="small primary" type="button" data-action="task-prepare" data-id="${task.id}">打开并填入</button>
              <button class="small ghost" type="button" data-action="task-sent" data-id="${task.id}">标记 sent</button>
              <button class="small ghost" type="button" data-action="task-failed" data-id="${task.id}">标记 failed</button>
            </div>
          </td>
        </tr>
      `
    )
    .join("");
}

async function loadSummary() {
  renderSummary(await api("/api/reports/summary"));
}

async function loadVideos() {
  state.videos = await api("/api/videos");
  renderVideos(state.videos);
}

async function loadLeads() {
  const level = document.getElementById("leadLevelFilter").value;
  const status = document.getElementById("leadStatusFilter").value;
  const query = new URLSearchParams();
  if (level) {
    query.set("level", level);
  }
  if (status) {
    query.set("status", status);
  }
  const suffix = query.toString() ? `?${query.toString()}` : "";
  renderLeads(await api(`/api/leads${suffix}`));
}

async function loadTasks() {
  renderTasks(await api("/api/outreach/tasks"));
}

async function refreshAll() {
  await Promise.all([loadSummary(), loadVideos(), loadLeads(), loadTasks()]);
}

async function createVideo(event) {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);
  const payload = Object.fromEntries(formData.entries());
  await api("/api/videos", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  event.currentTarget.reset();
  showToast("视频已创建");
  await Promise.all([loadVideos(), loadSummary()]);
}

async function performDiscoverDouyinVideos(options = {}) {
  const { refresh = true } = options;
  const payload = readDiscoverPayload();
  const result = await api("/api/douyin/discover/videos", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  state.lastDiscoverResult = result;
  renderDiscoverResult(result);
  if (refresh) {
    await Promise.all([loadVideos(), loadSummary()]);
  }
  return result;
}

async function discoverDouyinVideos(event) {
  event.preventDefault();
  const result = await performDiscoverDouyinVideos();
  showToast(`已自动发现 ${result.discovered_count} 条视频链接`);
  scrollToPanel("videosPanel");
}

async function performCollectDouyinComments(videoUrl = null, options = {}) {
  const { refresh = true } = options;
  const payload = readCollectPayload(videoUrl);
  const result = await api("/api/douyin/collect/comments", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  state.lastCollectResult = result;
  renderCollectResult(result);
  if (refresh) {
    await refreshAll();
  }
  return result;
}

async function collectDouyinComments(event) {
  event.preventDefault();
  const result = await performCollectDouyinComments();
  showToast(`原始 ${result.raw_collected_count} 条，保留 ${result.collected_count} 条，新增线索 ${result.imported?.created_leads ?? 0} 条`);
  scrollToPanel("collectResultPanel");
}

async function collectVideoCommentsByUrl(videoUrl) {
  const result = await performCollectDouyinComments(videoUrl);
  showToast(`原始 ${result.raw_collected_count} 条，保留 ${result.collected_count} 条，新增线索 ${result.imported?.created_leads ?? 0} 条`);
  scrollToPanel("collectResultPanel");
}

async function performBatchCollectDouyinComments(videoIds = [], options = {}) {
  const { refresh = true } = options;
  const payload = readBatchCollectPayload(videoIds);

  state.videos = await api("/api/videos");
  let queueVideos = state.videos.filter((video) => video.video_url);
  if (payload.video_ids.length) {
    const selectedIds = new Set(payload.video_ids);
    queueVideos = queueVideos.filter((video) => selectedIds.has(video.id));
  } else if (payload.only_uningested) {
    queueVideos = queueVideos.filter((video) => !video.last_ingested_at);
  }
  queueVideos = queueVideos.slice(0, payload.limit);

  const result = {
    requested_count: queueVideos.length,
    success_count: 0,
    failed_count: 0,
    total_comments: 0,
    total_created_leads: 0,
    results: queueVideos.map((video) => ({
      video_id: video.id,
      platform_video_id: video.platform_video_id,
      video_url: video.video_url,
      page_title: video.title || "",
      collected_count: 0,
      raw_collected_count: 0,
      filtered_out_count: 0,
      created_leads: 0,
      success: false,
      status: "pending",
      detail: "等待抓取",
    })),
  };

  state.lastBatchCollectResult = result;
  renderBatchCollectResult(result);

  for (const [index, video] of queueVideos.entries()) {
    result.results[index] = {
      ...result.results[index],
      status: "running",
      detail: `正在抓取第 ${index + 1}/${queueVideos.length} 个视频`,
    };
    renderBatchCollectResult(result);

    try {
      const itemResult = await performCollectDouyinComments(video.video_url, { refresh: false });
      result.success_count += 1;
      result.total_comments += itemResult.collected_count;
      result.total_created_leads += itemResult.imported?.created_leads ?? 0;
      result.results[index] = {
        video_id: itemResult.video_id,
        platform_video_id: itemResult.platform_video_id,
        video_url: itemResult.video_url,
        page_title: itemResult.page_title || video.title || "",
        collected_count: itemResult.collected_count,
        raw_collected_count: itemResult.raw_collected_count ?? 0,
        filtered_out_count: itemResult.filtered_out_count ?? 0,
        created_leads: itemResult.imported?.created_leads ?? 0,
        success: true,
        status: "success",
        detail: `原始 ${itemResult.raw_collected_count ?? 0} 条，保留 ${itemResult.collected_count} 条，新增线索 ${itemResult.imported?.created_leads ?? 0} 条`,
      };
    } catch (error) {
      result.failed_count += 1;
      result.results[index] = {
        ...result.results[index],
        success: false,
        status: "failed",
        detail: error.message || "抓取失败",
      };
    }

    state.lastBatchCollectResult = result;
    renderBatchCollectResult(result);
    await Promise.all([loadVideos(), loadLeads(), loadSummary()]);
    if (index < queueVideos.length - 1) {
      await sleep(800);
    }
  }

  if (refresh) {
    await refreshAll();
  }
  return result;
}

async function batchCollectDouyinComments() {
  const result = await performBatchCollectDouyinComments();
  if (!result.requested_count) {
    showToast("没有可抓取的视频，请先点“抓取视频”入库", true);
  } else {
    showToast(`队列完成：成功 ${result.success_count} 个视频，共保留 ${result.total_comments} 条评论`);
  }
  scrollToPanel("batchCollectResultPanel");
}

async function clearVideoList() {
  if (!window.confirm("确认清空视频列表？这会同时删除相关评论、线索和任务。")) {
    return;
  }
  const result = await api("/api/videos/reset", { method: "DELETE" });
  clearStoredResults({ discover: true, collect: true, batch: true });
  state.videos = [];
  state.leads = [];
  state.tasks = [];
  renderVideos([]);
  renderLeads([]);
  renderTasks([]);
  await refreshAll();
  showToast(result.detail || "视频列表已清空");
}

async function clearCommentList() {
  if (!window.confirm("确认清空已抓取的评论、线索和任务？视频列表会保留。")) {
    return;
  }
  const result = await api("/api/comments/reset", { method: "DELETE" });
  clearStoredResults({ collect: true, batch: true });
  state.leads = [];
  state.tasks = [];
  renderLeads([]);
  renderTasks([]);
  await refreshAll();
  showToast(result.detail || "评论线索已清空");
}

function clearVideoCache() {
  clearStoredResults({ discover: true });
  showToast("视频缓存已清空");
}

function clearCommentCache() {
  clearStoredResults({ collect: true, batch: true });
  showToast("采集缓存已清空");
}

function bindKeywordSync() {
  const quickKeywords = document.getElementById("quickKeywords");
  const discoverForm = document.getElementById("discoverVideosForm");
  const keywordInput = discoverForm?.elements?.keywords;
  if (!quickKeywords || !keywordInput) {
    return;
  }
  if (quickKeywords === keywordInput) {
    return;
  }

  let syncing = false;
  const syncValue = (value) => {
    if (syncing) {
      return;
    }
    syncing = true;
    setKeywordValue(value);
    syncing = false;
  };

  quickKeywords.addEventListener("input", () => syncValue(quickKeywords.value));
  keywordInput.addEventListener("input", () => syncValue(keywordInput.value));
}

async function runAutoPipeline() {
  const discoverResult = await performDiscoverDouyinVideos({ refresh: false });
  const videoIds = (discoverResult.videos || [])
    .map((item) => item.video_id)
    .filter((item) => Number.isInteger(item));
  const batchResult = await performBatchCollectDouyinComments(videoIds, { refresh: false });
  await refreshAll();
  showToast(`已完成：发现 ${discoverResult.discovered_count} 条视频，保留 ${batchResult.total_comments} 条评论，新增 ${batchResult.total_created_leads} 条线索`);
  scrollToPanel("batchCollectResultPanel");
}

async function importComments(event) {
  event.preventDefault();
  const raw = document.getElementById("importPayload").value.trim();
  if (!raw) {
    showToast("请先填写评论 JSON", true);
    return;
  }

  const payload = JSON.parse(raw);
  const result = await api("/api/comments/import", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  showToast(`已导入 ${result.created_comments} 条新评论`);
  await refreshAll();
}

async function createTask(event) {
  event.preventDefault();
  const payload = readTaskFormPayload({ requireLeadId: true });
  const task = await api("/api/outreach/tasks", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  event.currentTarget.elements.lead_id.value = "";
  upsertTask(task);
  showToast("外呼任务已创建");
  await Promise.all([loadLeads(), loadSummary()]);
}

async function addTasksForLeadIds(leadIds) {
  const normalizedLeadIds = [...new Set(leadIds.filter((leadId) => Number.isInteger(leadId) && leadId > 0))];
  if (!normalizedLeadIds.length) {
    throw new Error("没有可添加的线索");
  }

  const taskPayload = readTaskFormPayload();
  const result = await api("/api/outreach/tasks/batch-create", {
    method: "POST",
    body: JSON.stringify({
      lead_ids: normalizedLeadIds,
      message_content: taskPayload.message_content,
      template_code: taskPayload.template_code,
    }),
  });

  clearLeadSelection();
  await Promise.all([loadTasks(), loadLeads(), loadSummary()]);
  showToast(`已追加 ${result.created_count} 条任务`);
}

async function prepareTask(taskId) {
  const result = await api(`/api/outreach/tasks/${taskId}/prepare`, {
    method: "POST",
  });
  upsertTask(result.task);
  return result;
}

async function runDraftTasks() {
  const draftTasks = [...state.tasks]
    .filter((task) => task.status === "draft")
    .sort((left, right) => new Date(left.created_at || 0).getTime() - new Date(right.created_at || 0).getTime());

  if (!draftTasks.length) {
    throw new Error("当前没有待处理的 draft 任务");
  }

  const progress = createTaskQueueProgress(draftTasks);
  state.taskQueueProgress = progress;
  renderTaskQueueProgress(progress);

  for (const [index, task] of draftTasks.entries()) {
    progress.current_label = `${task.user_nickname || `Lead #${task.lead_id}`} (${index + 1}/${draftTasks.length})`;
    progress.items[index] = {
      ...progress.items[index],
      status: "running",
      detail: "正在打开私信并填入文案",
    };
    renderTaskQueueProgress(progress);

    try {
      const result = await prepareTask(task.id);
      progress.completed_count += 1;
      if (result.success) {
        progress.success_count += 1;
      } else {
        progress.failed_count += 1;
      }
      progress.items[index] = {
        ...progress.items[index],
        status: result.success ? "success" : "failed",
        success: result.success,
        detail: result.detail || (result.success ? "已打开并填入" : "执行失败"),
      };
    } catch (error) {
      progress.completed_count += 1;
      progress.failed_count += 1;
      progress.items[index] = {
        ...progress.items[index],
        status: "failed",
        success: false,
        detail: error.message || "执行失败",
      };
    }

    renderTaskQueueProgress(progress);
    if (index < draftTasks.length - 1) {
      await sleep(600);
    }
  }

  progress.current_label = "队列已完成";
  renderTaskQueueProgress(progress);
  await Promise.all([loadTasks(), loadSummary()]);
  showToast(`任务队列完成：成功 ${progress.success_count} 条，失败 ${progress.failed_count} 条`);
}

async function updateLeadStatus(leadId, status) {
  await api(`/api/leads/${leadId}/status`, {
    method: "POST",
    body: JSON.stringify({ status }),
  });
  showToast(`线索 ${leadId} 已更新为 ${status}`);
  await Promise.all([loadLeads(), loadSummary()]);
}

async function updateTaskStatus(taskId, status) {
  const task = await api(`/api/outreach/tasks/${taskId}/status`, {
    method: "POST",
    body: JSON.stringify({ status }),
  });
  upsertTask(task);
  showToast(`任务 ${taskId} 已更新为 ${status}`);
  await Promise.all([loadLeads(), loadSummary()]);
}

function closeLeadDrawer() {
  document.getElementById("leadDrawer").classList.add("hidden");
}

function renderLeadDrawer(detail) {
  document.getElementById("leadDrawerContent").innerHTML = `
    <div class="detail-block">
      <h3>${escapeHtml(detail.user_nickname)}</h3>
      <div class="tag-list">
        <span class="tag">Lead #${detail.id}</span>
        <span class="tag">score ${detail.score}</span>
        <span class="tag">${escapeHtml(detail.level)}</span>
        <span class="tag">${escapeHtml(detail.status)}</span>
      </div>
    </div>
    <div class="detail-block">
      <h3>快捷操作</h3>
      <div class="inline-actions">
        <button class="small primary" type="button" data-action="lead-greet" data-id="${detail.id}">代我发送“您好”</button>
        <button class="small ghost" type="button" data-action="prefill-task" data-id="${detail.id}">创建任务</button>
        <button class="small ghost" type="button" data-action="lead-contacted" data-id="${detail.id}">标记 contacted</button>
      </div>
      <p class="hint">会尝试直接切到该用户的私信窗口，并代你发送“您好”。</p>
    </div>
    <div class="detail-block">
      <h3>来源视频</h3>
      <p>${escapeHtml(detail.video_title || "-")}</p>
      ${detail.video_url ? `<a class="button-link" href="${escapeHtml(detail.video_url)}" target="_blank" rel="noreferrer">打开视频</a>` : ""}
    </div>
    <div class="detail-block">
      <h3>用户主页</h3>
      <p>${escapeHtml(detail.platform_user_id)}</p>
      ${detail.profile_url ? `<a class="button-link" href="${escapeHtml(detail.profile_url)}" target="_blank" rel="noreferrer">打开主页</a>` : "<p>-</p>"}
    </div>
    <div class="detail-block">
      <h3>评论原文</h3>
      <pre class="snippet-box">${escapeHtml(detail.latest_comment_content || "-")}</pre>
      <p class="hint">最近评论时间：${escapeHtml(formatDate(detail.latest_comment_time))}</p>
    </div>
    <div class="detail-block">
      <h3>识别依据</h3>
      <div class="tag-list">${(detail.hit_keywords || []).map((item) => `<span class="tag">${escapeHtml(item)}</span>`).join("")}</div>
      <ul class="history-list">
        ${(detail.reasons || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("") || "<li>-</li>"}
      </ul>
    </div>
    <div class="detail-block">
      <h3>状态历史</h3>
      <div class="history-list">
        ${(detail.history || []).map(
          (item) => `
            <div class="history-item">
              <strong>${escapeHtml(item.from_status || "init")} → ${escapeHtml(item.to_status)}</strong>
              <span class="hint">${escapeHtml(formatDate(item.created_at))}</span>
              <div>${escapeHtml(item.note || "-")}</div>
            </div>
          `
        ).join("") || '<p class="hint">暂无状态历史</p>'}
      </div>
    </div>
  `;
  document.getElementById("leadDrawer").classList.remove("hidden");
}

async function openLeadDetail(leadId) {
  renderLeadDrawer(await api(`/api/leads/${leadId}`));
}

async function greetLead(leadId) {
  const result = await api(`/api/leads/${leadId}/open-dm`, {
    method: "POST",
  });
  showToast(result.detail || "已切到私信窗口，并发送“您好”", !result.sent);
}

function prefillTask(leadId) {
  const taskForm = document.getElementById("taskForm");
  taskForm.elements.lead_id.value = leadId;
  taskForm.elements.template_code.value = "hello_v1";
  taskForm.elements.message_content.value = "您好";
  taskForm.scrollIntoView({ behavior: "smooth", block: "center" });
}

async function handleLeadAction(action, leadId) {
  if (action === "lead-detail") {
    await openLeadDetail(leadId);
  } else if (action === "lead-qualified") {
    await updateLeadStatus(leadId, "qualified");
  } else if (action === "lead-working") {
    await updateLeadStatus(leadId, "working");
  } else if (action === "lead-contacted") {
    await updateLeadStatus(leadId, "contacted");
  } else if (action === "lead-greet") {
    await greetLead(leadId);
  } else if (action === "prefill-task") {
    prefillTask(leadId);
  }
}

async function handleVideoAction(action, videoUrl) {
  if (action === "collect-video" || action === "collect-video-url") {
    await collectVideoCommentsByUrl(videoUrl);
  }
}

async function handleTaskAction(action, taskId) {
  if (action === "task-prepare") {
    const result = await prepareTask(taskId);
    showToast(result.detail || (result.success ? "已打开并填入文案" : "执行失败"), !result.success);
  } else if (action === "task-sent") {
    await updateTaskStatus(taskId, "sent");
  } else if (action === "task-failed") {
    await updateTaskStatus(taskId, "failed");
  }
}

function bindEvents() {
  bindKeywordSync();

  document.getElementById("discoverVideosForm").addEventListener("submit", async (event) => {
    try {
      await discoverDouyinVideos(event);
    } catch (error) {
      showToast(error.message, true);
    }
  });

  document.getElementById("quickDiscoverBtn").addEventListener("click", async (event) => {
    try {
      await runQuickAction(event.currentTarget, "正在抓取视频...", async () => {
        const result = await performDiscoverDouyinVideos();
        showToast(`已自动发现 ${result.discovered_count} 条视频链接`);
        scrollToPanel("videosPanel");
      });
    } catch (error) {
      showToast(error.message, true);
    }
  });

  document.getElementById("quickBatchCollectBtn").addEventListener("click", async (event) => {
    try {
      await runQuickAction(event.currentTarget, "正在抓取评论...", async () => {
        await batchCollectDouyinComments();
      });
    } catch (error) {
      showToast(error.message, true);
    }
  });

  document.getElementById("quickAutoPipelineBtn").addEventListener("click", async (event) => {
    try {
      await runQuickAction(event.currentTarget, "全自动执行中...", async () => {
        await runAutoPipeline();
      });
    } catch (error) {
      showToast(error.message, true);
    }
  });

  document.getElementById("collectCurrentVideoBtn").addEventListener("click", async (event) => {
    try {
      await runQuickAction(event.currentTarget, "正在抓取当前视频...", async () => {
        const result = await performCollectDouyinComments();
        showToast(`原始 ${result.raw_collected_count} 条，保留 ${result.collected_count} 条，新增线索 ${result.imported?.created_leads ?? 0} 条`);
        scrollToPanel("collectResultPanel");
      });
    } catch (error) {
      showToast(error.message, true);
    }
  });

  document.getElementById("videoForm").addEventListener("submit", async (event) => {
    try {
      await createVideo(event);
    } catch (error) {
      showToast(error.message, true);
    }
  });

  document.getElementById("douyinCollectForm").addEventListener("submit", async (event) => {
    try {
      await collectDouyinComments(event);
    } catch (error) {
      showToast(error.message, true);
    }
  });

  document.getElementById("importForm").addEventListener("submit", async (event) => {
    try {
      await importComments(event);
    } catch (error) {
      showToast(error.message, true);
    }
  });

  document.getElementById("taskForm").addEventListener("submit", async (event) => {
    try {
      await createTask(event);
    } catch (error) {
      showToast(error.message, true);
    }
  });

  document.getElementById("addSelectedLeadsTasksBtn").addEventListener("click", async () => {
    try {
      await addTasksForLeadIds([...state.selectedLeadIds]);
    } catch (error) {
      showToast(error.message, true);
    }
  });

  document.getElementById("addVisibleLeadsTasksBtn").addEventListener("click", async () => {
    try {
      await addTasksForLeadIds(getVisibleLeadIds());
    } catch (error) {
      showToast(error.message, true);
    }
  });

  document.getElementById("clearLeadSelectionBtn").addEventListener("click", () => clearLeadSelection());

  document.getElementById("runDraftTasksBtn").addEventListener("click", async (event) => {
    try {
      await runQuickAction(event.currentTarget, "执行中...", async () => {
        await runDraftTasks();
      });
    } catch (error) {
      showToast(error.message, true);
    }
  });

  document.getElementById("loadExampleBtn").addEventListener("click", () => {
    document.getElementById("importPayload").value = JSON.stringify(examplePayload, null, 2);
  });

  document.getElementById("clearVideosBtn").addEventListener("click", async (event) => {
    try {
      await runQuickAction(event.currentTarget, "清空中...", async () => {
        await clearVideoList();
      });
    } catch (error) {
      showToast(error.message, true);
    }
  });

  document.getElementById("clearVideoCacheBtn").addEventListener("click", () => clearVideoCache());
  document.getElementById("clearCommentsBtn").addEventListener("click", async (event) => {
    try {
      await runQuickAction(event.currentTarget, "清空中...", async () => {
        await clearCommentList();
      });
    } catch (error) {
      showToast(error.message, true);
    }
  });
  document.getElementById("clearCommentCacheBtn").addEventListener("click", () => clearCommentCache());

  document.getElementById("refreshAllBtn").addEventListener("click", () => refreshAll().catch((error) => showToast(error.message, true)));
  document.getElementById("loadVideosBtn").addEventListener("click", () => loadVideos().catch((error) => showToast(error.message, true)));
  document.getElementById("loadTasksBtn").addEventListener("click", () => loadTasks().catch((error) => showToast(error.message, true)));
  document.getElementById("loadLeadsBtn").addEventListener("click", () => loadLeads().catch((error) => showToast(error.message, true)));
  document.getElementById("leadLevelFilter").addEventListener("change", () => loadLeads().catch((error) => showToast(error.message, true)));
  document.getElementById("leadStatusFilter").addEventListener("change", () => loadLeads().catch((error) => showToast(error.message, true)));
  document.getElementById("toggleAllLeads").addEventListener("change", (event) => setVisibleLeadSelection(event.currentTarget.checked));

  document.getElementById("leadsTableBody").addEventListener("click", async (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) {
      return;
    }

    const leadId = Number(button.dataset.id);
    try {
      await handleLeadAction(button.dataset.action, leadId);
    } catch (error) {
      showToast(error.message, true);
    }
  });

  document.getElementById("leadsTableBody").addEventListener("change", (event) => {
    const checkbox = event.target.closest("input[data-lead-checkbox]");
    if (!checkbox) {
      return;
    }
    toggleLeadSelection(Number(checkbox.dataset.id), checkbox.checked);
  });

  document.getElementById("videosTableBody").addEventListener("click", async (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) {
      return;
    }
    try {
      await handleVideoAction(button.dataset.action, button.dataset.url);
    } catch (error) {
      showToast(error.message, true);
    }
  });

  document.getElementById("discoverResultVideos").addEventListener("click", async (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) {
      return;
    }
    try {
      await handleVideoAction(button.dataset.action, button.dataset.url);
    } catch (error) {
      showToast(error.message, true);
    }
  });

  document.getElementById("leadDrawerContent").addEventListener("click", async (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) {
      return;
    }

    const leadId = Number(button.dataset.id);
    try {
      await handleLeadAction(button.dataset.action, leadId);
    } catch (error) {
      showToast(error.message, true);
    }
  });

  document.getElementById("tasksTableBody").addEventListener("click", async (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) {
      return;
    }

    const taskId = Number(button.dataset.id);
    try {
      await handleTaskAction(button.dataset.action, taskId);
    } catch (error) {
      showToast(error.message, true);
    }
  });

  document.getElementById("closeLeadDrawerBtn").addEventListener("click", closeLeadDrawer);
  document.getElementById("leadDrawerBackdrop").addEventListener("click", closeLeadDrawer);
}

document.addEventListener("DOMContentLoaded", async () => {
  bindEvents();
  renderTaskQueueProgress(state.taskQueueProgress);
  syncLeadSelectionUi();
  document.getElementById("importPayload").value = JSON.stringify(examplePayload, null, 2);
  const savedCollectResult = sessionStorage.getItem(STORAGE_KEYS.collect);
  if (savedCollectResult) {
    try {
      state.lastCollectResult = JSON.parse(savedCollectResult);
      renderCollectResult(state.lastCollectResult);
    } catch {
      sessionStorage.removeItem(STORAGE_KEYS.collect);
    }
  }
  const savedDiscoverResult = sessionStorage.getItem(STORAGE_KEYS.discover);
  if (savedDiscoverResult) {
    try {
      state.lastDiscoverResult = JSON.parse(savedDiscoverResult);
      renderDiscoverResult(state.lastDiscoverResult);
      setKeywordValue((state.lastDiscoverResult.keywords || []).join(", "));
    } catch {
      sessionStorage.removeItem(STORAGE_KEYS.discover);
    }
  }
  const savedBatchCollectResult = sessionStorage.getItem(STORAGE_KEYS.batch);
  if (savedBatchCollectResult) {
    try {
      state.lastBatchCollectResult = JSON.parse(savedBatchCollectResult);
      renderBatchCollectResult(state.lastBatchCollectResult);
    } catch {
      sessionStorage.removeItem(STORAGE_KEYS.batch);
    }
  }
  try {
    await refreshAll();
  } catch (error) {
    showToast(error.message, true);
  }
});
