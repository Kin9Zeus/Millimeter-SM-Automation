import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { cfg } from "./config.mjs";

// Estado persistente en el Volume (state.json). Escritura atómica: se escribe a un temporal y se renombra.
const file = () => join(cfg.dataDir, "state.json");

let cache = null;

export function loadState() {
  if (cache) return cache;
  mkdirSync(cfg.dataDir, { recursive: true });
  cache = { token: null, posts: {}, alerts: {} };
  if (existsSync(file())) {
    try {
      cache = { ...cache, ...JSON.parse(readFileSync(file(), "utf8")) };
    } catch {
      // Archivo corrupto: se conserva copia y se arranca limpio en vez de caerse.
      try { renameSync(file(), `${file()}.corrupt-${Date.now()}`); } catch { /* ignorar */ }
    }
  }
  return cache;
}

export function saveState() {
  const tmp = `${file()}.tmp`;
  writeFileSync(tmp, JSON.stringify(cache, null, 2));
  renameSync(tmp, file());
}

export function updatePost(date, patch) {
  const s = loadState();
  s.posts[date] = { ...(s.posts[date] ?? { date }), ...patch, updatedAt: new Date().toISOString() };
  saveState();
  return s.posts[date];
}

export function recentPosts(limit = 20) {
  const s = loadState();
  return Object.values(s.posts)
    .filter((p) => p.status === "published" && p.topic)
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, limit);
}

// Avisos de una sola vez por clave (p. ej. "token-por-vencer") para no spamear.
export function shouldAlert(key, minHours = 24) {
  const s = loadState();
  const last = s.alerts[key] ? Date.parse(s.alerts[key]) : 0;
  if (Date.now() - last < minHours * 3600 * 1000) return false;
  s.alerts[key] = new Date().toISOString();
  saveState();
  return true;
}
