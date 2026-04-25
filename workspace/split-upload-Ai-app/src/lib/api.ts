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
  streamState?: "idle" | "streaming" | "complete";
}

async function request<T>(input: RequestInfo, init?: RequestInit) {
  const response = await fetch(input, {
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.message ?? "请求失败");
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

export function startBuild(id: string) {
  return request<{ projectId: string; message: string }>(`/api/builds/${id}`, {
    method: "POST",
  });
}

export function getBuildStatus(id: string) {
  return request<BuildStatusPayload>(`/api/builds/${id}/status`);
}
