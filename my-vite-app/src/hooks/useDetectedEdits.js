import { useEffect, useState } from "react";

function accountKey(token) {
  try {
    const payload = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const { id } = JSON.parse(atob(payload));
    return typeof id === "string" && id ? `money-manager:detected-edits:${id}` : null;
  } catch { return null; }
}
function read(key) {
  if (!key) return {};
  try {
    const value = JSON.parse(localStorage.getItem(key) || "{}");
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch { return {}; }
}

/** Keep user edits separate from refreshed native detections, scoped to the signed-in user. */
export default function useDetectedEdits(token) {
  const key = accountKey(token);
  const [cache, setCache] = useState(() => ({ key, edits: read(key) }));
  const [storageError, setStorageError] = useState(false);
  useEffect(() => {
    setCache((current) => current.key === key ? current : { key, edits: read(key) });
  }, [key]);
  useEffect(() => {
    if (!key || cache.key !== key) return;
    try {
      if (Object.keys(cache.edits).length) localStorage.setItem(key, JSON.stringify(cache.edits));
      else localStorage.removeItem(key);
      setStorageError(false);
    } catch { setStorageError(true); }
  }, [cache, key]);

  const update = (id, field, value) => {
    setCache((current) => {
      const edits = current.key === key ? current.edits : read(key);
      return { key, edits: { ...edits, [id]: { ...edits[id], [field]: value } } };
    });
  };
  const remove = (id) => {
    setCache((current) => {
      if (current.key !== key || !Object.hasOwn(current.edits, id)) return current;
      const edits = { ...current.edits };
      delete edits[id];
      return { key, edits };
    });
  };
  const prune = (pending) => {
    const ids = new Set(pending.map((item) => item.id));
    setCache((current) => {
      if (current.key !== key) return current;
      const entries = Object.entries(current.edits).filter(([id]) => ids.has(id));
      return entries.length === Object.keys(current.edits).length ? current : { key, edits: Object.fromEntries(entries) };
    });
  };
  return { edits: cache.key === key ? cache.edits : {}, update, remove, prune, storageError };
}
