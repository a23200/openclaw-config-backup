export type BuildStep = "analysis" | "codegen" | "compile" | "complete" | "failed";
export type BuildStatus = "draft" | "generating" | "building" | "ready" | "failed";
export type BuildStreamState = "idle" | "streaming" | "fallback" | "complete";

import { analyzeGeneratedCode } from "./generatedCodeParser.js";

export interface BuildState {
  projectId: string;
  status: BuildStatus;
  step: BuildStep;
  logs: string[];
  apkUrl?: string | null;
  error?: string;
  updatedAt: string;
  activeFile: string | null;
  codePreview: string;
  generatedFiles: string[];
  generatedFileCount: number;
  streamState: BuildStreamState;
  rawCodeOutput: string;
}

export interface BuildSnapshot {
  projectId: string;
  status: BuildStatus;
  step: BuildStep;
  logs: string[];
  apkUrl?: string | null;
  error?: string;
  updatedAt: string;
  activeFile: string | null;
  codePreview: string;
  generatedFiles: string[];
  generatedFileCount: number;
  streamState: BuildStreamState;
}

type BuildListener = (snapshot: BuildSnapshot) => void;

const store = new Map<string, BuildState>();
const listeners = new Map<string, Set<BuildListener>>();

function timestamp() {
  return new Date().toISOString();
}

function createEmptyBuild(projectId: string): BuildState {
  return {
    projectId,
    status: "generating",
    step: "analysis",
    logs: [`[${timestamp()}] 已开始构建任务`],
    updatedAt: timestamp(),
    activeFile: null,
    codePreview: "",
    generatedFiles: [],
    generatedFileCount: 0,
    streamState: "idle",
    rawCodeOutput: "",
  };
}

function toSnapshot(state: BuildState): BuildSnapshot {
  return {
    projectId: state.projectId,
    status: state.status,
    step: state.step,
    logs: [...state.logs],
    apkUrl: state.apkUrl ?? null,
    error: state.error,
    updatedAt: state.updatedAt,
    activeFile: state.activeFile,
    codePreview: state.codePreview,
    generatedFiles: [...state.generatedFiles],
    generatedFileCount: state.generatedFileCount,
    streamState: state.streamState,
  };
}

function emit(projectId: string) {
  const state = store.get(projectId);
  if (!state) {
    return;
  }

  const snapshot = toSnapshot(state);
  for (const listener of listeners.get(projectId) ?? []) {
    listener(snapshot);
  }
}

function updateState(projectId: string, updater: (state: BuildState) => void) {
  const state = store.get(projectId);
  if (!state) {
    return;
  }

  updater(state);
  state.updatedAt = timestamp();
  emit(projectId);
}

function trimPreview(content: string, maxLines = 160, maxChars = 18000) {
  const lines = content.split("\n");
  const tail = lines.slice(-maxLines).join("\n");
  return tail.slice(-maxChars);
}

function analyzeCodeOutput(rawCodeOutput: string) {
  const analyzed = analyzeGeneratedCode(rawCodeOutput, {
    includeOpenFile: true,
  });

  return {
    activeFile: analyzed.activeFile,
    codePreview: trimPreview(analyzed.activeContent),
    generatedFiles: analyzed.generatedFiles,
    generatedFileCount: analyzed.generatedFileCount,
  };
}

export function initBuild(projectId: string) {
  const state = createEmptyBuild(projectId);
  store.set(projectId, state);
  emit(projectId);
  return state;
}

export function getBuild(projectId: string) {
  return store.get(projectId);
}

export function subscribeBuild(projectId: string, listener: BuildListener) {
  const group = listeners.get(projectId) ?? new Set<BuildListener>();
  group.add(listener);
  listeners.set(projectId, group);

  const existing = store.get(projectId);
  if (existing) {
    listener(toSnapshot(existing));
  }

  return () => {
    const currentGroup = listeners.get(projectId);
    if (!currentGroup) {
      return;
    }

    currentGroup.delete(listener);
    if (currentGroup.size === 0) {
      listeners.delete(projectId);
    }
  };
}

export function appendLog(projectId: string, message: string) {
  updateState(projectId, (state) => {
    for (const line of message.split(/\r?\n/)) {
      const normalized = line.trim();
      if (normalized) {
        state.logs.push(`[${timestamp()}] ${normalized}`);
      }
    }
  });
}

export function appendCodeChunk(projectId: string, chunk: string) {
  updateState(projectId, (state) => {
    const previousFile = state.activeFile;

    state.rawCodeOutput += chunk;
    state.streamState = "streaming";

    const analyzed = analyzeCodeOutput(state.rawCodeOutput);
    state.activeFile = analyzed.activeFile;
    state.codePreview = analyzed.codePreview;
    state.generatedFiles = analyzed.generatedFiles;
    state.generatedFileCount = analyzed.generatedFileCount;

    if (
      analyzed.activeFile &&
      analyzed.activeFile !== previousFile
    ) {
      state.logs.push(`[${timestamp()}] 正在生成文件：${analyzed.activeFile}`);
    }
  });
}

export function replaceCodeOutput(
  projectId: string,
  rawCodeOutput: string,
  streamState: BuildStreamState = "streaming",
) {
  updateState(projectId, (state) => {
    const analyzed = analyzeCodeOutput(rawCodeOutput);

    state.rawCodeOutput = rawCodeOutput;
    state.streamState = streamState;
    state.activeFile = analyzed.activeFile;
    state.codePreview = analyzed.codePreview;
    state.generatedFiles = analyzed.generatedFiles;
    state.generatedFileCount = analyzed.generatedFileCount;
  });
}

export function setCodeStreamState(projectId: string, streamState: BuildStreamState) {
  updateState(projectId, (state) => {
    state.streamState = streamState;
  });
}

export function setStep(projectId: string, step: BuildStep, status?: BuildStatus) {
  updateState(projectId, (state) => {
    state.step = step;
    if (status) {
      state.status = status;
    }
  });
}

export function setBuildSuccess(projectId: string, apkUrl: string) {
  updateState(projectId, (state) => {
    state.status = "ready";
    state.step = "complete";
    state.apkUrl = apkUrl;
    state.error = undefined;
    state.streamState = "complete";
  });
}

export function setBuildError(projectId: string, error: string) {
  updateState(projectId, (state) => {
    state.status = "failed";
    state.error = error;
    state.streamState = "complete";
  });
  appendLog(projectId, `构建失败：${error}`);
}

export function markCodeStreamComplete(projectId: string) {
  updateState(projectId, (state) => {
    state.streamState = "complete";
  });
}
