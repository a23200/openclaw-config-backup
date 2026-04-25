// ============================================================
// Jimeng Studio — Front-end app
// ============================================================

const noCache = { cache: 'no-store' };

const api = {
  meta: () => fetch('/api/meta', noCache).then(r => r.json()),
  list: () => fetch('/api/jobs', noCache).then(r => r.json()),
  detail: (id) => fetch(`/api/jobs/${id}`, noCache).then(r => r.json()),
  create: (formData) => fetch('/api/jobs', { method: 'POST', body: formData }),
  retry: (id) => fetch(`/api/jobs/${id}/retry`, { method: 'POST' }),
  remove: (id) => fetch(`/api/jobs/${id}`, { method: 'DELETE' }),
  hot: () => fetch(`/api/hot?_=${Date.now()}`, noCache).then(r => r.json()),
  hotRandom: () => fetch(`/api/hot/random?_=${Date.now()}`, noCache).then(r => r.ok ? r.json() : Promise.reject(r)),
  generate: (topic) => {
    const fd = new FormData();
    fd.set('topic', topic);
    return fetch('/api/generate', { method: 'POST', body: fd }).then(r => r.ok ? r.json() : Promise.reject(r));
  },
  preflight: () => fetch('/api/publish/preflight', noCache).then(r => r.json()),
  publish: (id, cover) => {
    const fd = new FormData();
    fd.set('cover', cover || 'auto');
    return fetch(`/api/jobs/${id}/publish`, { method: 'POST', body: fd });
  },
  publishLog: (id) => fetch(`/api/jobs/${id}/files/douyin_publish.log?_=${Date.now()}`, noCache)
    .then(r => r.ok ? r.text() : ''),
  browserStatus: () => fetch('/api/browser/status', noCache).then(r => r.json()),
  browserTest: () => fetch('/api/browser/test', { method: 'POST' }).then(r => r.json()),
  browserLaunch: () => fetch('/api/browser/launch', { method: 'POST' }).then(r => r.json()),
};

const STATE_LABELS = {
  submitted: '已提交',
  first_frame_generating: '首帧生成',
  first_frame_querying: '首帧下载',
  last_frame_generating: '尾帧生成',
  last_frame_querying: '尾帧下载',
  video_submitted: '视频已投递',
  video_queued: '视频排队',
  video_querying: '视频轮询',
  video_ready: '视频就绪',
  post_processing: '后处理',
  mastered: '成片',
  publishing: '发布中',
  published: '已发布',
  failed: '失败',
};

const POST_MODE_LABELS = {
  auto: '自动判断',
  visual_only: '纯画面',
  title_card: '点题字幕',
  narrated: '解说模式',
};

let TIMELINE = [];
let cachedJobs = [];
let currentDetailId = null;
let currentDetailJob = null;
let detailTimer = null;
let preflightCache = null;

// ---------- helpers ----------
const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];

const fmtTime = (ts) => {
  if (!ts) return '—';
  const d = new Date(ts * 1000);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};
const fmtSize = (bytes) => {
  if (bytes == null) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1048576).toFixed(1)} MB`;
  return `${(bytes / 1073741824).toFixed(2)} GB`;
};
const classifyStatus = (status) => {
  if (status === 'failed') return 'failed';
  if (status === 'published') return 'published';
  if (status === 'mastered') return 'done';
  return 'running';
};
const statusTagClass = (status) => {
  if (status === 'failed') return 'err';
  if (status === 'published') return 'gold';
  if (status === 'mastered') return 'ok';
  return 'warn';
};
const toast = (msg, type = '') => {
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'toast show ' + type;
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => t.classList.remove('show'), 2600);
};

// ---------- segmented + strategy selectors ----------
function bindSegments() {
  $$('.seg, .strategy-grid').forEach((group) => {
    const field = group.dataset.field;
    const hidden = document.querySelector(`input[name="${field}"]`);
    group.addEventListener('click', (e) => {
      const btn = e.target.closest('.seg-item, .strategy');
      if (!btn) return;
      $$('.seg-item, .strategy', group).forEach(el => el.classList.remove('active'));
      btn.classList.add('active');
      hidden.value = btn.dataset.value;
      onFieldChange(field, btn.dataset.value);
    });
  });
}
function onFieldChange(field, value) {
  if (field === 'video_mode') {
    $('#audio-ref-field').hidden = (value !== 'multimodal2video');
  } else if (field === 'post_mode') {
    $('#title-card-field').hidden = (value !== 'title_card');
  }
}

// ---------- form submit ----------
function bindForm() {
  $('#job-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button.primary');
    btn.disabled = true; btn.style.opacity = 0.7;
    try {
      const fd = new FormData(e.target);
      if (!fd.get('auto_publish')) fd.set('auto_publish', '');
      const res = await api.create(fd);
      if (!res.ok) throw new Error(await res.text());
      e.target.reset();
      // Reset segmented controls back to defaults
      $$('.seg, .strategy-grid').forEach(group => {
        const items = $$('.seg-item, .strategy', group);
        items.forEach(it => it.classList.remove('active'));
        items[0]?.classList.add('active');
        const field = group.dataset.field;
        document.querySelector(`input[name="${field}"]`).value = items[0]?.dataset.value || '';
      });
      $('#audio-ref-field').hidden = true;
      $('#title-card-field').hidden = true;
      toast('任务已提交，开始即梦之旅 ✨', 'ok');
      loadJobs();
    } catch (err) {
      toast('提交失败：' + err.message, 'err');
    } finally {
      btn.disabled = false; btn.style.opacity = 1;
    }
  });
}

// ---------- sidebar list ----------
function renderSidebar(jobs) {
  const list = $('#joblist');
  const searchText = $('#search').value.trim().toLowerCase();
  const filter = $('#status-filter').value;

  let filtered = jobs;
  if (searchText) {
    filtered = filtered.filter(j =>
      (j.title || '').toLowerCase().includes(searchText) ||
      (j.id || '').toLowerCase().includes(searchText)
    );
  }
  if (filter) {
    filtered = filtered.filter(j => {
      if (filter === 'active') return !['mastered', 'published', 'failed'].includes(j.status);
      return j.status === filter;
    });
  }

  $('#job-count').textContent = filtered.length;

  if (!filtered.length) {
    list.innerHTML = `<div class="empty-state"><div class="empty-icon">✦</div><div>${jobs.length ? '没有匹配的任务' : '等待第一个任务被点亮'}</div></div>`;
    return;
  }

  list.innerHTML = filtered.map(j => {
    const cls = classifyStatus(j.status);
    const tag = statusTagClass(j.status);
    const shortId = (j.id || '').slice(-10);
    const total = TIMELINE.length || 13;
    let idx = TIMELINE.indexOf(j.status);
    if (j.status === 'failed') idx = total;
    const pct = idx < 0 ? 0 : Math.min(100, Math.round((idx + (cls === 'running' ? 1 : 1)) / total * 100));
    const stepLabel = j.status === 'failed'
      ? '失败'
      : (idx >= 0 ? `步骤 ${Math.min(idx + 1, total)}/${total}` : '');
    return `
      <div class="job-card status-${cls}" data-id="${j.id}">
        <div class="job-card-title">${escapeHtml(j.title || '(无标题)')}</div>
        <div class="job-card-id">${shortId}</div>
        <div class="job-progress" aria-label="进度"><span class="bar" style="width:${pct}%"></span></div>
        <div class="job-card-foot">
          <span class="status-tag ${tag}">${STATE_LABELS[j.status] || j.status}</span>
          <span class="job-card-step">${stepLabel}</span>
          <span class="job-card-time">${relTime(j.updated_at)}</span>
        </div>
      </div>`;
  }).join('');

  $$('.job-card', list).forEach(card => {
    card.addEventListener('click', () => openDetail(card.dataset.id));
  });
}

function relTime(ts) {
  if (!ts) return '—';
  const diff = Date.now() / 1000 - ts;
  if (diff < 60) return '刚刚';
  if (diff < 3600) return `${Math.floor(diff / 60)}分前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}小时前`;
  return `${Math.floor(diff / 86400)}天前`;
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

// ---------- stats ----------
function renderStats(jobs) {
  const total = jobs.length;
  const running = jobs.filter(j => !['mastered', 'published', 'failed'].includes(j.status)).length;
  const done = jobs.filter(j => ['mastered', 'published'].includes(j.status)).length;
  const failed = jobs.filter(j => j.status === 'failed').length;
  $('#stat-total').textContent = total;
  $('#stat-running').textContent = running;
  $('#stat-done').textContent = done;
  $('#stat-failed').textContent = failed;
}

// ---------- load jobs ----------
async function loadJobs() {
  try {
    const jobs = await api.list();
    cachedJobs = jobs;
    renderSidebar(jobs);
    renderStats(jobs);
  } catch (e) {
    // ignore transient network
  }
}

// ---------- detail drawer ----------
async function openDetail(jobId) {
  currentDetailId = jobId;
  const drawer = $('#drawer');
  drawer.hidden = false;
  await refreshDetail();
  if (detailTimer) clearInterval(detailTimer);
  detailTimer = setInterval(() => {
    if (!currentDetailId) return;
    refreshDetail();
  }, 4000);
}

function closeDetail() {
  currentDetailId = null;
  currentDetailJob = null;
  if (detailTimer) { clearInterval(detailTimer); detailTimer = null; }
  $('#drawer').hidden = true;
}

async function refreshDetail() {
  if (!currentDetailId) return;
  let job;
  try {
    job = await api.detail(currentDetailId);
  } catch {
    return;
  }
  currentDetailJob = job;

  $('#d-id').textContent = job.id;
  $('#d-title').textContent = job.title || '(无标题)';
  $('#d-status').textContent = STATE_LABELS[job.status] || job.status;
  $('#d-created').textContent = fmtTime(job.created_at);
  $('#d-updated').textContent = fmtTime(job.updated_at);
  const pm = job.post?.resolved_mode || job.post?.mode;
  $('#d-postmode').textContent = POST_MODE_LABELS[pm] || pm || '—';

  // error
  if (job.error) {
    $('#d-error-section').hidden = false;
    $('#d-error').textContent = job.error;
  } else {
    $('#d-error-section').hidden = true;
  }

  // timeline
  renderTimeline(job);

  // submit ids
  $('#d-sid1').textContent = job.first_submit_id || '—';
  $('#d-sid2').textContent = job.last_submit_id || '—';
  $('#d-sid3').textContent = job.video_submit_id || '—';

  // prompts
  $('#d-p1').textContent = job.input?.first_prompt || '—';
  $('#d-p2').textContent = job.input?.last_prompt || '—';
  $('#d-p3').textContent = job.input?.video_prompt || '—';

  // previews & files
  renderPreviews(job);
  renderFiles(job);
  renderPublishSection(job);
}

// ---------- publish section ----------
function renderPublishSection(job) {
  const pf = preflightCache || { ready: false, port_open: false, cdp_ok: false };
  const dot = $('#d-pf-dot');
  const txt = $('#d-pf-text');
  if (pf.ready) {
    dot.className = 'pf-dot ok';
    txt.textContent = `CDP 就绪 · ${pf.cdp_endpoint} · ${pf.chrome_version || 'Chrome'}`;
  } else if (pf.port_open && !pf.cdp_ok) {
    dot.className = 'pf-dot warn';
    txt.textContent = `端口 ${pf.debug_port} 有监听但不是 CDP（被其他进程占用？）`;
  } else {
    dot.className = 'pf-dot err';
    txt.textContent = `调试 Chrome 未运行 · 请点右侧"启动调试 Chrome"`;
  }

  // browser row
  const brDot = $('#d-br-dot');
  const brTxt = $('#d-br-text');
  const brBtn = $('#d-browser-btn');
  if (pf.ready) {
    brDot.className = 'pf-dot ok';
    brTxt.textContent = '已连接你的调试 Chrome · 发布将在该窗口新开标签（复用登录态）';
    brBtn.hidden = false;
    brBtn.textContent = '🔧 测试连接';
    brBtn.dataset.mode = 'test';
  } else {
    brDot.className = 'pf-dot err';
    brTxt.textContent = `没有调试 Chrome 实例 · user-data-dir=${pf.user_data_dir || '~/.jimeng-publish-chrome'}`;
    brBtn.hidden = false;
    brBtn.textContent = '🌐 启动调试 Chrome';
    brBtn.dataset.mode = 'launch';
  }

  // cover select: reflect saved choice
  const saved = job.publish?.cover || 'auto';
  const sel = $('#d-cover-choice');
  if (sel.value !== saved) sel.value = saved;

  // button enable rules
  const btn = $('#d-publish-btn');
  const status = job.status;
  const canPublish = pf.ready && ['mastered', 'failed', 'published'].includes(status);
  const isPublishing = status === 'publishing';
  btn.disabled = !canPublish || isPublishing;
  btn.classList.toggle('loading', isPublishing);
  if (isPublishing) {
    btn.querySelector('span:last-child').textContent = '发布中…';
  } else if (status === 'published') {
    btn.querySelector('span:last-child').textContent = '🔁 重新发布';
  } else if (status === 'failed') {
    btn.querySelector('span:last-child').textContent = '🔁 重试发布';
  } else {
    btn.querySelector('span:last-child').textContent = '📮 准备发布';
  }

  // result
  const pr = job.publish_result;
  const resultBox = $('#d-publish-result');
  if (pr) {
    resultBox.hidden = false;
    const prStatus = $('#pr-status');
    prStatus.textContent = pr.status === 'ok' ? '成功' : (pr.status === 'failed' ? '失败' : pr.status);
    prStatus.className = pr.status === 'ok' ? 'ok' : (pr.status === 'failed' ? 'err' : '');
    $('#pr-elapsed').textContent = pr.elapsed_sec != null ? `${pr.elapsed_sec} s` : '—';
    if (pr.link) {
      $('#pr-link-row').hidden = false;
      const a = $('#pr-link');
      a.href = pr.link;
      a.textContent = pr.link;
    } else {
      $('#pr-link-row').hidden = true;
    }
    if (pr.status === 'failed' && pr.error) {
      $('#pr-error-row').hidden = false;
      $('#pr-error').textContent = pr.error;
    } else {
      $('#pr-error-row').hidden = true;
    }
  } else {
    resultBox.hidden = true;
  }

  // log tail (only if log artifact exists)
  const hasLog = (job.artifacts || []).some(a => a.name === 'douyin_publish.log');
  const logBox = $('#d-publish-log-box');
  if (hasLog) {
    logBox.hidden = false;
    loadPublishLog(job.id);
  } else {
    logBox.hidden = true;
    $('#d-publish-log').textContent = '';
  }
}

async function loadPublishLog(id) {
  try {
    const txt = await api.publishLog(id);
    const pre = $('#d-publish-log');
    const tail = txt.length > 4000 ? txt.slice(-4000) : txt;
    pre.textContent = tail;
    pre.scrollTop = pre.scrollHeight;
  } catch {}
}

async function refreshPreflight(silent) {
  try {
    preflightCache = await api.preflight();
  } catch {
    preflightCache = { ready: false, node: '', script_exists: false };
  }
  renderTopPreflight();
  if (!silent && currentDetailJob) renderPublishSection(currentDetailJob);
}

function renderTopPreflight() {
  const pf = preflightCache;
  const dot = $('#pf-dot');
  const txt = $('#pf-text');
  const btn = $('#top-browser-btn');
  if (!dot || !txt) return;
  if (!pf) {
    dot.className = 'pf-dot';
    txt.textContent = '正在检测发布环境…';
    if (btn) btn.hidden = true;
    return;
  }
  if (pf.ready) {
    dot.className = 'pf-dot ok';
    txt.textContent = `发布环境就绪 · CDP ✓ · ${pf.cdp_endpoint} · ${pf.chrome_version || 'Chrome'}`;
  } else if (pf.port_open && !pf.cdp_ok) {
    dot.className = 'pf-dot warn';
    txt.textContent = `${pf.debug_port} 端口有监听但不是 CDP`;
  } else {
    dot.className = 'pf-dot err';
    txt.textContent = '调试 Chrome 未运行 · 点右侧按钮启动专用调试 Chrome';
  }
  if (btn) {
    btn.hidden = false;
    btn.textContent = pf.ready ? '测试连接' : '启动 Chrome';
    btn.dataset.mode = pf.ready ? 'test' : 'launch';
  }
}

async function testBrowserConnection(btn) {
  const mode = btn?.dataset.mode === 'launch' ? 'launch' : 'test';
  const original = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = mode === 'launch' ? '启动中…' : '测试中…'; }
  try {
    if (mode === 'launch') {
      const res = await api.browserLaunch();
      if (res.ok) {
        toast(res.already_running ? '✓ 调试 Chrome 已在运行' : '✓ 调试 Chrome 已启动 · 首次请在打开的窗口里登录抖音', 'ok');
      } else {
        toast('启动失败：' + (res.error || '未知原因'), 'err');
      }
    } else {
      const res = await api.browserTest();
      if (res.ok) {
        const loginMsg = res.logged_in ? '已登录抖音' : '⚠️ 未登录抖音(请在调试 Chrome 里登录)';
        toast(`✓ CDP 连通 · ${loginMsg} · ${res.pages_after || '?'} 个标签`, res.logged_in ? 'ok' : 'warn');
      } else {
        toast('连接失败：' + (res.error || '未知原因'), 'err');
      }
    }
  } catch {
    toast('请求失败', 'err');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = original; }
    await refreshPreflight(false);
  }
}

function renderTimeline(job) {
  const ol = $('#d-timeline');
  if (job.status === 'failed') {
    // show up to last known + a failed marker
    ol.innerHTML = TIMELINE.map((s, i) => {
      return `<li class="done"><span class="tn">${i + 1}</span>${STATE_LABELS[s] || s}</li>`;
    }).join('') + `<li class="failed"><span class="tn">!</span>失败</li>`;
    return;
  }
  const curIdx = TIMELINE.indexOf(job.status);
  ol.innerHTML = TIMELINE.map((s, i) => {
    let cls = '';
    if (curIdx >= 0 && i < curIdx) cls = 'done';
    else if (i === curIdx) cls = 'current';
    return `<li class="${cls}"><span class="tn">${i + 1}</span>${STATE_LABELS[s] || s}</li>`;
  }).join('');
}

const VIDEO_INFLIGHT_STATES = new Set([
  'video_submitted', 'video_queued', 'video_querying', 'video_ready',
]);

function renderPreviews(job) {
  const host = $('#d-preview');
  const artifacts = job.artifacts || [];
  const byName = Object.fromEntries(artifacts.map(a => [a.name, a]));

  const wanted = [
    { name: 'first_frame.png', label: '首帧', type: 'image' },
    { name: 'last_frame.png', label: '尾帧', type: 'image' },
    { name: 'final_mastered.mp4', label: '成片', type: 'video' },
    { name: 'final.mp4', label: '原始', type: 'video' },
  ];

  const items = [];
  const seenVideo = new Set();
  let videoFound = false;
  for (const w of wanted) {
    const a = byName[w.name];
    if (!a) continue;
    if (w.type === 'video' && seenVideo.has('v')) continue;
    if (w.type === 'video') { seenVideo.add('v'); videoFound = true; }
    const url = `/api/jobs/${job.id}/preview/${encodeURIComponent(w.name)}?v=${Math.floor(a.modified)}`;
    const dl = `/api/jobs/${job.id}/files/${encodeURIComponent(w.name)}`;
    if (w.type === 'image') {
      items.push(`
        <div class="preview-item">
          <div class="ph"><img src="${url}" alt="${w.label}" loading="lazy" /></div>
          <div class="cap"><span>${w.label}</span><a href="${dl}" download>下载</a></div>
        </div>`);
    } else {
      items.push(`
        <div class="preview-item">
          <div class="ph"><video src="${url}" controls playsinline preload="metadata"></video></div>
          <div class="cap"><span>${w.label}</span><a href="${dl}" download>下载</a></div>
        </div>`);
    }
  }

  // Video is still queueing/rendering — show live queue card in slot 3.
  if (!videoFound && VIDEO_INFLIGHT_STATES.has(job.status)) {
    items.push(`
      <div class="preview-item queue-card" id="d-queue-card" data-job="${job.id}">
        <div class="ph queue-ph">
          <div class="queue-status">${STATE_LABELS[job.status] || job.status}</div>
          <div class="queue-rank"><span id="qc-idx">—</span><em>/ <span id="qc-len">—</span></em></div>
          <div class="queue-bar"><span id="qc-bar" style="width:0%"></span></div>
          <div class="queue-meta">
            <span>已等待 <b id="qc-elapsed">—</b></span>
            <span>credit <b id="qc-credit">—</b></span>
          </div>
          <div class="queue-sub" id="qc-sub">查询队列中…</div>
        </div>
        <div class="cap"><span>视频 · 生成中</span><span class="mini-hint" id="qc-updated">—</span></div>
      </div>`);
    videoFound = true;
  }

  host.innerHTML = items.length ? items.join('') : `<div class="preview-empty">还没有产物，稍等即梦出片…</div>`;

  if ($('#d-queue-card')) refreshQueueCard(job);
}

async function refreshQueueCard(job) {
  try {
    const r = await fetch(`/api/jobs/${job.id}/files/video_query.log?_=${Date.now()}`, noCache);
    if (!r.ok) return;
    const raw = await r.text();
    let q;
    try { q = JSON.parse(raw); } catch { return; }
    const info = q.queue_info || {};
    const idx = info.queue_idx;
    const len = info.queue_length;
    const idxEl = $('#qc-idx'); if (idxEl && Number.isFinite(idx)) idxEl.textContent = idx.toLocaleString();
    const lenEl = $('#qc-len'); if (lenEl && Number.isFinite(len)) lenEl.textContent = len.toLocaleString();
    const bar = $('#qc-bar');
    if (bar && Number.isFinite(idx) && Number.isFinite(len) && len > 0) {
      const pct = Math.max(1, Math.min(100, Math.round((1 - idx / len) * 100)));
      bar.style.width = pct + '%';
    }
    const elapsed = $('#qc-elapsed');
    if (elapsed && job.created_at) {
      const secs = Math.max(0, Math.floor(Date.now() / 1000 - job.created_at));
      elapsed.textContent = fmtDuration(secs);
    }
    const credit = $('#qc-credit');
    if (credit && Number.isFinite(q.credit_count)) credit.textContent = String(q.credit_count);
    const sub = $('#qc-sub');
    if (sub) sub.textContent = `${info.queue_status || q.gen_status || '排队中'} · 优先级 ${info.priority ?? '—'}`;
    const upd = $('#qc-updated');
    if (upd) upd.textContent = '刚刷新 · ' + new Date().toLocaleTimeString();
  } catch {
    /* transient */
  }
}

function fmtDuration(secs) {
  secs = Math.max(0, Math.floor(secs));
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h) return `${h}时${m}分`;
  if (m) return `${m}分${s}秒`;
  return `${s}秒`;
}

function renderFiles(job) {
  const host = $('#d-files');
  const arts = job.artifacts || [];
  if (!arts.length) { host.innerHTML = `<div class="preview-empty">暂无文件</div>`; return; }
  host.innerHTML = arts.map(a => {
    const icon = iconForSuffix(a.suffix);
    const url = `/api/jobs/${job.id}/files/${encodeURIComponent(a.name)}`;
    return `
      <div class="file-row">
        <div class="file-icon">${icon}</div>
        <div class="file-name">${escapeHtml(a.name)}</div>
        <div class="file-meta">${fmtSize(a.size)}</div>
        <a class="file-dl" href="${url}" download>下载</a>
      </div>`;
  }).join('');
}

function iconForSuffix(s) {
  if (['.mp4', '.mov', '.mkv'].includes(s)) return '▶';
  if (['.png', '.jpg', '.jpeg', '.webp'].includes(s)) return '◉';
  if (['.mp3', '.wav', '.m4a'].includes(s)) return '♪';
  if (['.srt', '.ass', '.vtt'].includes(s)) return '❝';
  if (['.json'].includes(s)) return '{ }';
  if (['.log', '.txt'].includes(s)) return '≡';
  return '•';
}

// ---------- actions ----------
function bindDrawerActions() {
  $('#d-retry').addEventListener('click', async () => {
    if (!currentDetailId) return;
    if (!confirm('重新投递当前任务？现有产物不会被清理。')) return;
    try {
      await api.retry(currentDetailId);
      toast('已加入重跑队列', 'ok');
      refreshDetail();
      loadJobs();
    } catch (e) {
      toast('重试失败', 'err');
    }
  });

  $('#d-delete').addEventListener('click', async () => {
    if (!currentDetailId) return;
    if (!confirm('确定删除这个任务及其所有产物文件？此操作不可恢复。')) return;
    try {
      await api.remove(currentDetailId);
      toast('已删除', 'ok');
      closeDetail();
      loadJobs();
    } catch (e) {
      toast('删除失败', 'err');
    }
  });

  $$('[data-close]').forEach(el => el.addEventListener('click', closeDetail));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !$('#drawer').hidden) closeDetail();
  });

  $('#d-browser-btn').addEventListener('click', (e) => testBrowserConnection(e.currentTarget));

  $('#d-publish-btn').addEventListener('click', async () => {
    if (!currentDetailId) return;
    const cover = $('#d-cover-choice').value || 'auto';
    if (!confirm(`确认触发抖音发布？\n封面来源：${coverLabel(cover)}\n会调用本机 Node 脚本并打开浏览器自动化。`)) return;
    const btn = $('#d-publish-btn');
    btn.disabled = true;
    try {
      const res = await api.publish(currentDetailId, cover);
      if (!res.ok) {
        const msg = await res.text();
        throw new Error(msg);
      }
      toast('已触发发布，正在打开抖音…', 'ok');
      setTimeout(refreshDetail, 800);
    } catch (err) {
      toast('发布启动失败：' + (err.message || ''), 'err');
      btn.disabled = false;
    }
  });
}

function coverLabel(v) {
  return v === 'last' ? '尾帧' : v === 'first' ? '首帧' : '自动';
}

// ---------- search/filter ----------
function bindFilters() {
  $('#search').addEventListener('input', () => renderSidebar(cachedJobs));
  $('#status-filter').addEventListener('change', () => renderSidebar(cachedJobs));
  $('#refresh-btn').addEventListener('click', () => {
    loadJobs();
    if (currentDetailId) refreshDetail();
    toast('已刷新', 'ok');
  });
}

// ---------- AI assist (topic → prompts) ----------
function setFieldValue(name, value) {
  if (value == null) return;
  const el = document.querySelector(`[name="${name}"]`);
  if (!el) return;
  el.value = value;
  el.classList.add('autofilled');
  setTimeout(() => el.classList.remove('autofilled'), 1200);
}

function selectStrategy(field, value) {
  const group = document.querySelector(`[data-field="${field}"]`);
  if (!group) return;
  const items = $$('.seg-item, .strategy', group);
  items.forEach(el => el.classList.remove('active'));
  const hit = items.find(el => el.dataset.value === value);
  if (hit) hit.classList.add('active');
  const hidden = document.querySelector(`input[name="${field}"]`);
  if (hidden) hidden.value = value;
  onFieldChange(field, value);
}

function applyGeneratedPrompts(data) {
  setFieldValue('title', data.title);
  setFieldValue('first_prompt', data.first_prompt);
  setFieldValue('last_prompt', data.last_prompt);
  setFieldValue('video_prompt', data.video_prompt);
  setFieldValue('title_card_text', data.title_card_text);
  setFieldValue('publish_title', data.publish_title);
  setFieldValue('publish_description', data.publish_description);
  if (data.suggested_post_mode) selectStrategy('post_mode', data.suggested_post_mode);
}

async function runGenerate(topic) {
  const btn = $('#ai-generate');
  const hint = $('#ai-hint');
  if (!topic || !topic.trim()) {
    toast('先输入一个题目或从热榜抽一个', 'err');
    return;
  }
  btn.disabled = true;
  btn.classList.add('loading');
  hint.textContent = 'Claude 正在构思提示词…';
  try {
    const data = await api.generate(topic.trim());
    applyGeneratedPrompts(data);
    const engineLabel = data.engine === 'fallback' ? '模板兜底' : `模型 ${data.engine}`;
    toast(`已生成（${engineLabel}）：${data.title}`, 'ok');
    hint.textContent = `✓ 当前题目：${data.topic}（${engineLabel}）`;
  } catch (err) {
    toast('生成失败，请稍后再试', 'err');
    hint.textContent = '生成失败，请检查网络或 API KEY';
  } finally {
    btn.disabled = false;
    btn.classList.remove('loading');
  }
}

function bindAIAssist() {
  $('#ai-generate').addEventListener('click', () => runGenerate($('#ai-topic').value));
  $('#ai-topic').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); runGenerate(e.target.value); }
  });
  $('#ai-random').addEventListener('click', async () => {
    const btn = $('#ai-random');
    btn.disabled = true;
    try {
      const pick = await api.hotRandom();
      $('#ai-topic').value = pick.title;
      toast(`已抽中：${pick.title}`, 'ok');
      await runGenerate(pick.title);
    } catch {
      toast('抽题失败，热榜暂不可用', 'err');
    } finally {
      btn.disabled = false;
    }
  });
  $('#ai-hot-open').addEventListener('click', openHotDrawer);
  $('#hot-refresh').addEventListener('click', () => loadHotList(true));
  $$('[data-hot-close]').forEach(el => el.addEventListener('click', closeHotDrawer));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !$('#hot-drawer').hidden) closeHotDrawer();
  });
}

async function openHotDrawer() {
  $('#hot-drawer').hidden = false;
  await loadHotList(false);
}
function closeHotDrawer() {
  $('#hot-drawer').hidden = true;
}

async function loadHotList(force) {
  const host = $('#hot-list');
  const hint = $('#hot-hint');
  if (force || !host.dataset.loaded) {
    host.innerHTML = `<div class="hot-loading">正在获取抖音热榜…</div>`;
  }
  try {
    const data = await api.hot();
    const items = data.items || [];
    if (!items.length) {
      host.innerHTML = `<div class="hot-empty">暂时拿不到抖音热榜，稍后再试。</div>`;
      hint.textContent = '聚合接口暂不可用';
      return;
    }
    host.dataset.loaded = '1';
    hint.textContent = `共 ${items.length} 条 · 来源 ${items[0].source || '未知'} · 点一条自动填入`;
    host.innerHTML = items.map((it, i) => `
      <div class="hot-item" data-title="${escapeHtml(it.title)}">
        <div class="hot-idx">${String(i + 1).padStart(2, '0')}</div>
        <div class="hot-body">
          <div class="hot-title">${escapeHtml(it.title)}</div>
          <div class="hot-meta">${it.hot ? '热度 ' + escapeHtml(it.hot) : ''}${it.url ? ' · <a href="'+it.url+'" target="_blank" rel="noopener">原链接</a>' : ''}</div>
        </div>
        <button type="button" class="hot-pick">使用</button>
      </div>`).join('');
    $$('.hot-item', host).forEach(row => {
      row.addEventListener('click', async (e) => {
        if (e.target.closest('a')) return;
        const title = row.dataset.title;
        $('#ai-topic').value = title;
        closeHotDrawer();
        await runGenerate(title);
      });
    });
  } catch {
    host.innerHTML = `<div class="hot-empty">网络错误，无法获取热榜。</div>`;
  }
}

// ---------- topnav (visual-only tabs for now) ----------
function bindTabs() {
  $$('.nav-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      $$('.nav-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      const view = chip.dataset.view;
      if (view === 'docs') {
        toast('工作流：text2image → image2image → frames2video → 后处理 → 发布');
      }
    });
  });
}

// ---------- init ----------
(async function init() {
  try {
    const meta = await api.meta();
    TIMELINE = meta.timeline || [];
  } catch {
    TIMELINE = [
      'submitted', 'first_frame_generating', 'first_frame_querying',
      'last_frame_generating', 'last_frame_querying',
      'video_submitted', 'video_queued', 'video_querying', 'video_ready',
      'post_processing', 'mastered', 'publishing', 'published',
    ];
  }
  bindSegments();
  bindForm();
  bindDrawerActions();
  bindFilters();
  bindTabs();
  bindAIAssist();
  const topBrBtn = $('#top-browser-btn');
  if (topBrBtn) topBrBtn.addEventListener('click', (e) => testBrowserConnection(e.currentTarget));
  await loadJobs();
  await refreshPreflight(true);
  setInterval(loadJobs, 5000);
  setInterval(() => refreshPreflight(true), 15000);
})();
