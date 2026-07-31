/**
 * Simple in-memory TTL cache for analytics summary/rankings.
 */
const store = new Map();

function cacheKey(parts) {
  return parts.filter((p) => p != null && p !== '').join('|');
}

function get(key) {
  const hit = store.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) {
    store.delete(key);
    return null;
  }
  return hit.value;
}

function set(key, value, ttlMs = 60000) {
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
}

function clear() {
  store.clear();
}

module.exports = { cacheKey, get, set, clear };
