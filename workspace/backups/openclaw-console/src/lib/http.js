export async function fetchJsonOrThrow(url, init = {}, fallbackMessage = "") {
  const response = await fetch(url, init);
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || fallbackMessage || `请求失败：${response.status}`);
  }

  return data;
}
