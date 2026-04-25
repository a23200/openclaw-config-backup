export interface Project {
  id: string;
  name: string;
  description?: string | null;
  prd: string;
  apkUrl?: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface BuildStatusPayload {
  projectId: string;
  status: string;
  step: "analysis" | "codegen" | "compile" | "complete" | "failed";
  logs: string[];
  apkUrl?: string | null;
  error?: string;
  updatedAt?: string;
  activeFile?: string | null;
  codePreview?: string;
  generatedFiles?: string[];
  generatedFileCount?: number;
  streamState?: "idle" | "streaming" | "fallback" | "complete";
}

export interface BuildLogPayload {
  exists: boolean;
  content: string;
}

async function request<T>(input: RequestInfo, init?: RequestInit) {
  let response: Response;
  try {
    response = await fetch(input, {
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
      ...init,
    });
  } catch {
    throw new Error("无法连接后端服务，请确认 API 服务 http://localhost:5237 已启动");
  }

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const fallbackMessage =
      response.status >= 500
        ? `后端服务异常或未启动（HTTP ${response.status}）`
        : `请求失败（HTTP ${response.status}）`;
    throw new Error(payload?.message ?? fallbackMessage);
  }

  return payload as T;
}

export function createProject(body: { name: string; description: string }) {
  return request<Project>("/api/projects", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function getProject(id: string) {
  return request<Project>(`/api/projects/${id}`);
}

export function updateProject(id: string, body: { prd: string }) {
  return request<Project>(`/api/projects/${id}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export function assistProject(
  id: string,
  body: { action: "regenerate" | "optimize" | "add-feature"; feature?: string },
) {
  return request<Project>(`/api/projects/${id}/assist`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function startBuild(id: string, options: { skipCodegen?: boolean } = {}) {
  const query = options.skipCodegen ? "?skipCodegen=1" : "";
  return request<{ projectId: string; message: string }>(
    `/api/builds/${id}${query}`,
    {
      method: "POST",
    },
  );
}

export function getBuildStatus(id: string) {
  return request<BuildStatusPayload>(`/api/builds/${id}/status`);
}

export function getBuildLog(id: string) {
  return request<BuildLogPayload>(`/api/builds/${id}/build-log`);
}
