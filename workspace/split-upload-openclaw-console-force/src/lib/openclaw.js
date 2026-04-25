export function extractSessionKey(payload, fallback = "") {
  return (
    payload?.sessionKey ||
    payload?.session?.sessionKey ||
    payload?.session?.session?.sessionKey ||
    payload?.session?.key ||
    payload?.key ||
    payload?.session?.id ||
    fallback ||
    ""
  );
}
