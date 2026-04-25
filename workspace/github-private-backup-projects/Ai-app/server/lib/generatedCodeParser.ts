export interface GeneratedCodeFile {
  filePath: string;
  content: string;
}

export interface GeneratedCodeAnalysis {
  files: GeneratedCodeFile[];
  activeFile: string | null;
  activeContent: string;
  generatedFiles: string[];
  generatedFileCount: number;
}

const PATH_REGEX =
  /(?:\.\/)?(?:[A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+(?:\.[A-Za-z][A-Za-z0-9_-]*)+|(?:\.\/)?gradlew(?:\.bat)?/i;
const PATH_LABELED_FENCE_REGEX = /```([^\n`]+)\n([\s\S]*?)```/g;
const OPEN_PATH_LABELED_FENCE_REGEX = /```([^\n`]+)\n([\s\S]*)$/;
const ALLOWED_FILE_EXTENSIONS = new Set([
  "bat",
  "gradle",
  "java",
  "json",
  "kt",
  "kts",
  "md",
  "pro",
  "properties",
  "toml",
  "txt",
  "xml",
  "yaml",
  "yml",
]);

function cleanPathMarker(input: string) {
  return input
    .trim()
    .replace(/^\uFEFF/, "")
    .replace(/^(?:#{1,6}\s*|[-*+]\s*|\d+\.\s*)/, "")
    .replace(
      /^(?:文件路径|文件名|文件|路径|file(?:\s*path)?|filename|path)\s*[:：-]\s*/i,
      "",
    )
    .replace(/^[`"'“”‘’*_()\[\]\s]+|[`"'“”‘’*_()\[\]\s]+$/g, "");
}

function extractPathCandidate(input: string) {
  const normalized = cleanPathMarker(input);
  if (!normalized) {
    return null;
  }

  const match = normalized.match(PATH_REGEX);
  if (!match) {
    return null;
  }

  const candidate = match[0].replace(/^\.\//, "").trim();
  const basename = candidate.split("/").at(-1) ?? "";
  const extension = basename.split(".").at(-1)?.toLowerCase();

  if (
    candidate !== "gradlew" &&
    candidate !== "gradlew.bat" &&
    (!extension || !ALLOWED_FILE_EXTENSIONS.has(extension))
  ) {
    return null;
  }

  return candidate;
}

export function analyzeGeneratedCode(
  raw: string,
  options?: { includeOpenFile?: boolean },
): GeneratedCodeAnalysis {
  const normalized = raw.replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");
  const fileMap = new Map<string, string>();
  const fileOrder: string[] = [];

  let pendingPath: string | null = null;
  let currentPath: string | null = null;
  let currentContent: string[] = [];
  let ignoringFence = false;
  let lastClosedFenceEnd = 0;

  function upsertFile(filePath: string, content: string) {
    if (!fileMap.has(filePath)) {
      fileOrder.push(filePath);
    }

    fileMap.set(filePath, content.replace(/^\n+/, ""));
  }

  for (const match of normalized.matchAll(PATH_LABELED_FENCE_REGEX)) {
    const filePath = extractPathCandidate(match[1]);
    if (!filePath) {
      continue;
    }

    upsertFile(filePath, match[2] ?? "");
    lastClosedFenceEnd = Math.max(lastClosedFenceEnd, match.index + match[0].length);
  }

  if (fileOrder.length > 0) {
    const openFenceMatch = normalized.slice(lastClosedFenceEnd).match(OPEN_PATH_LABELED_FENCE_REGEX);
    if (openFenceMatch) {
      currentPath = extractPathCandidate(openFenceMatch[1]);
      currentContent = currentPath ? [openFenceMatch[2] ?? ""] : [];
    }

    if (options?.includeOpenFile && currentPath) {
      upsertFile(currentPath, currentContent.join("\n"));
    }

    const files = fileOrder.map((filePath) => ({
      filePath,
      content: fileMap.get(filePath) ?? "",
    }));
    const generatedFiles = [...new Set([...fileOrder, ...(currentPath ? [currentPath] : [])])];

    return {
      files,
      activeFile: currentPath ?? files.at(-1)?.filePath ?? null,
      activeContent: currentPath ? currentContent.join("\n") : files.at(-1)?.content ?? "",
      generatedFiles,
      generatedFileCount: generatedFiles.length,
    };
  }

  for (const line of lines) {
    const trimmed = line.trim();

    if (ignoringFence) {
      if (trimmed.startsWith("```")) {
        ignoringFence = false;
      }
      continue;
    }

    if (currentPath) {
      if (trimmed.startsWith("```")) {
        upsertFile(currentPath, currentContent.join("\n"));
        currentPath = null;
        currentContent = [];
        continue;
      }

      currentContent.push(line);
      continue;
    }

    const singleLineFenceMatch = trimmed.match(/^```([^`\n]+)```$/);
    if (singleLineFenceMatch) {
      const inlinePath = extractPathCandidate(singleLineFenceMatch[1]);
      if (inlinePath) {
        pendingPath = inlinePath;
        continue;
      }
    }

    if (trimmed.startsWith("```")) {
      const fenceLabel = trimmed.slice(3).trim();
      const inlinePath = extractPathCandidate(fenceLabel);

      if (inlinePath) {
        currentPath = inlinePath;
        pendingPath = null;
        currentContent = [];
        continue;
      }

      if (pendingPath) {
        currentPath = pendingPath;
        pendingPath = null;
        currentContent = [];
        continue;
      }

      ignoringFence = true;
      continue;
    }

    const pathCandidate = extractPathCandidate(line);
    if (pathCandidate) {
      pendingPath = pathCandidate;
    }
  }

  if (options?.includeOpenFile && currentPath) {
    upsertFile(currentPath, currentContent.join("\n"));
  }

  const files = fileOrder.map((filePath) => ({
    filePath,
    content: fileMap.get(filePath) ?? "",
  }));
  const generatedFiles = [...new Set([...fileOrder, ...(currentPath ? [currentPath] : [])])];

  return {
    files,
    activeFile: currentPath ?? files.at(-1)?.filePath ?? null,
    activeContent: currentPath ? currentContent.join("\n") : files.at(-1)?.content ?? "",
    generatedFiles,
    generatedFileCount: generatedFiles.length,
  };
}

export function parseGeneratedFiles(raw: string) {
  return analyzeGeneratedCode(raw, { includeOpenFile: false }).files;
}
