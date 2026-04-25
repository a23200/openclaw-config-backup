export async function fetchJsonOrThrow(url, init = {}, fallbackMessage = "") {
  const response = await fetch(url, init);
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || fallbackMessage || `请求失败：${response.status}`);
  }

  return data;
}

function parseEventStreamBlock(block) {
  const lines = block.split(/\r?\n/);
  let event = "message";
  const dataLines = [];

  lines.forEach((line) => {
    if (!line || line.startsWith(":")) return;
    if (line.startsWith("event:")) {
      event = line.slice(6).trim() || "message";
      return;
    }
    if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).replace(/^ /, ""));
    }
  });

  if (!dataLines.length) return null;

  const rawData = dataLines.join("\n");
  let data = rawData;

  try {
    data = JSON.parse(rawData);
  } catch {}

  return { event, data };
}

export async function fetchEventStream(url, init = {}, handlers = {}) {
  const response = await fetch(url, init);

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || handlers.fallbackMessage || `请求失败：${response.status}`);
  }

  if (!response.body) {
    throw new Error("当前浏览器不支持流式读取。");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    for (;;) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value || new Uint8Array(), { stream: !done });

      const blocks = buffer.split(/\r?\n\r?\n/);
      buffer = blocks.pop() || "";

      blocks.forEach((block) => {
        const parsed = parseEventStreamBlock(block);
        if (parsed) {
          handlers.onEvent?.(parsed.event, parsed.data);
        }
      });

      if (done) break;
    }

    if (buffer.trim()) {
      const parsed = parseEventStreamBlock(buffer);
      if (parsed) {
        handlers.onEvent?.(parsed.event, parsed.data);
      }
    }
  } finally {
    reader.releaseLock();
  }
}
