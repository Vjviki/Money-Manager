import { useEffect, useState } from "react";

const categories = ["Food", "Entertainment", "Medical", "Transport", "Education", "Shopping", "Salary", "Other"];

// Preserve punctuation: distinct UPI handles must never collapse into one rule.
export function recipientKey(item) {
  const merchant = typeof item.merchant === "string" ? item.merchant.trim().replace(/\s+/g, " ").toLowerCase() : "";
  if (!merchant || /^(unknown|other|payment|transaction|detected transaction)$/.test(merchant)) return null;
  if (!["Income", "Expenses"].includes(item.type)) return null;
  return JSON.stringify([item.type, merchant]);
}

function accountKey(token) {
  try {
    const { id } = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return typeof id === "string" && id ? `money-manager:category-memory:${id}` : null;
  } catch { return null; }
}

function read(key) {
  if (!key) return {};
  try {
    const data = JSON.parse(localStorage.getItem(key) || "{}");
    if (!data || typeof data !== "object" || Array.isArray(data)) return {};
    return Object.fromEntries(Object.entries(data).filter(([id, rule]) =>
      rule && categories.includes(rule.category) && recipientKey(rule) === id));
  } catch { return {}; }
}

export default function useCategoryMemory(token) {
  const key = accountKey(token);
  const [cache, setCache] = useState(() => ({ key, rules: read(key) }));
  const [storageError, setStorageError] = useState(false);
  useEffect(() => {
    setCache(current => current.key === key ? current : { key, rules: read(key) });
  }, [key]);
  useEffect(() => {
    if (!key || cache.key !== key) return;
    try {
      if (Object.keys(cache.rules).length) localStorage.setItem(key, JSON.stringify(cache.rules));
      else localStorage.removeItem(key);
      setStorageError(false);
    } catch { setStorageError(true); }
  }, [key, cache]);
  const rules = cache.key === key ? cache.rules : {};
  const remember = (item, category) => {
    const id = recipientKey(item);
    if (!key || !id || !categories.includes(category)) return;
    setCache(current => ({ key, rules: {
      ...(current.key === key ? current.rules : read(key)),
      [id]: { merchant: item.merchant.trim(), type: item.type, category },
    } }));
  };
  const forget = (id) => setCache(current => {
    if (current.key !== key) return current;
    const next = { ...current.rules };
    delete next[id];
    return { key, rules: next };
  });
  return { rules, remember, forget, storageError, available: Boolean(key),
    categoryFor: item => rules[recipientKey(item)]?.category };
}
