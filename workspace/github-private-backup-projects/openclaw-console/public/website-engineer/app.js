const targetInput = document.getElementById("target-url");
const statusBox = document.getElementById("status-box");
const cloneMeta = document.getElementById("clone-meta");
const cloneMetrics = document.getElementById("clone-metrics");
const cloneFrame = document.getElementById("clone-frame");
const scanMeta = document.getElementById("scan-meta");
const scanSummary = document.getElementById("scan-summary");
const headersBox = document.getElementById("headers-box");
const findingsList = document.getElementById("findings-list");
const cloneButton = document.getElementById("clone-button");
const scanButton = document.getElementById("scan-button");
const exampleButton = document.getElementById("load-example");

function setStatus(message) {
  statusBox.textContent = message;
}

function renderChips(container, items) {
  container.innerHTML = "";
  items.forEach((item) => {
    const node = document.createElement("div");
    node.className = "chip";
    node.textContent = item;
    container.appendChild(node);
  });
}

function renderSummary(summary) {
  scanSummary.innerHTML = "";
  [
    ["总计", summary.total],
    ["高危", summary.high],
    ["中危", summary.medium],
    ["低危", summary.low],
    ["提示", summary.info],
  ].forEach(([label, value]) => {
    const item = document.createElement("div");
    item.className = "summary-item";
    item.innerHTML = `<strong>${value ?? 0}</strong><span>${label}</span>`;
    scanSummary.appendChild(item);
  });
}

function renderFindings(findings) {
  findingsList.innerHTML = "";
  findings.forEach((finding) => {
    const card = document.createElement("div");
    card.className = `finding-card ${finding.level || "info"}`;
    card.innerHTML = `
      <div class="finding-top">
        <strong>${finding.title || "未命名发现"}</strong>
        <span class="level-pill ${finding.level || "info"}">${finding.level || "info"}</span>
      </div>
      <div>${finding.detail || ""}</div>
    `;
    findingsList.appendChild(card);
  });
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `请求失败：${response.status}`);
  }
  return data;
}

async function runClone() {
  const url = targetInput.value.trim();
  if (!url) {
    setStatus("请先输入要复刻的网址。");
    targetInput.focus();
    return;
  }

  cloneButton.disabled = true;
  setStatus("正在复刻页面结构，请稍候…");

  try {
    const data = await postJson("/api/website-engineer/clone", { url });
    cloneMeta.textContent = `${data.title} · ${data.finalUrl} · HTTP ${data.statusCode}`;
    renderChips(
      cloneMetrics,
      Object.entries(data.metrics || {}).map(([key, value]) => `${key}: ${value}`),
    );
    cloneFrame.srcdoc = data.previewHtml || "<p>未返回预览内容</p>";
    setStatus("复刻完成。当前预览已移除脚本，适合核对结构、样式和信息架构。");
  } catch (error) {
    setStatus(`复刻失败：${error.message}`);
  } finally {
    cloneButton.disabled = false;
  }
}

async function runScan() {
  const url = targetInput.value.trim();
  if (!url) {
    setStatus("请先输入要巡检的网址。");
    targetInput.focus();
    return;
  }

  scanButton.disabled = true;
  setStatus("正在执行被动漏洞巡检，请稍候…");

  try {
    const data = await postJson("/api/website-engineer/scan", { url });
    scanMeta.textContent = `${data.title} · ${data.finalUrl} · HTTP ${data.statusCode}`;
    renderSummary(data.summary || {});
    renderChips(
      headersBox,
      Object.entries(data.headers || {}).map(([key, value]) => `${key}: ${value}`),
    );
    renderFindings(data.findings || []);
    setStatus("巡检完成。当前结果以响应头、HTML 结构和基础安全项的被动分析为主。");
  } catch (error) {
    setStatus(`巡检失败：${error.message}`);
  } finally {
    scanButton.disabled = false;
  }
}

exampleButton.addEventListener("click", () => {
  targetInput.value = "https://example.com";
  setStatus("已填入示例网址，可以直接点击“复刻网页”或“查询漏洞”。");
});

cloneButton.addEventListener("click", runClone);
scanButton.addEventListener("click", runScan);
