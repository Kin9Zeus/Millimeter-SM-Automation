import { createHash } from "node:crypto";
import { cfg, log, logError } from "./config.mjs";
import { loadState, saveState } from "./state.mjs";

// Instagram API con Instagram Login (graph.instagram.com). Los errores NUNCA incluyen la URL ni el token.
const host = () => `https://graph.instagram.com/${cfg.meta.apiVersion}`;

export class MetaError extends Error {
  constructor(message, { code, subcode, transient = false } = {}) {
    super(message);
    this.name = "MetaError";
    this.code = code;
    this.subcode = subcode;
    this.transient = transient;
  }
}

const sha = (s) => createHash("sha256").update(s).digest("hex").slice(0, 16);

/** Token vigente: el último renovado (guardado en el Volume) o, si cambió la variable de entorno, el nuevo del entorno. */
export function getToken() {
  const s = loadState();
  const envHash = sha(cfg.meta.token || "");
  if (s.token && s.token.sourceHash === envHash && s.token.value) return s.token.value;
  return cfg.meta.token;
}

async function call(path, { method = "GET", params = {}, base = host() } = {}) {
  const token = getToken();
  const body = new URLSearchParams({ ...params, access_token: token });
  let res;
  try {
    res = method === "GET" ? await fetch(`${base}${path}?${body}`) : await fetch(`${base}${path}`, { method, body });
  } catch (e) {
    throw new MetaError(`Red: no se pudo contactar a Meta (${e.cause?.code ?? e.message})`, { transient: true });
  }
  const json = await res.json().catch(() => ({}));
  if (json.error) {
    const { message, code, error_subcode: subcode, is_transient: t } = json.error;
    throw new MetaError(`Meta API ${path}: ${message} (código ${code}${subcode ? `/${subcode}` : ""})`, { code, subcode, transient: Boolean(t) || res.status >= 500 || code === 1 || code === 2 });
  }
  if (!res.ok) throw new MetaError(`Meta API ${path}: HTTP ${res.status}`, { transient: res.status >= 500 });
  return json;
}

let cachedId = null;
/** ID de la cuenta profesional, deducido del propio token (evita errores al copiar META_IG_USER_ID a mano). */
export async function igId() {
  if (cachedId) return cachedId;
  const me = await call("/me", { params: { fields: "user_id,username" } });
  if (cfg.meta.igUserId && cfg.meta.igUserId !== String(me.user_id)) logError("META_IG_USER_ID no coincide con la cuenta del token; se usa el del token (" + me.username + "). Puedes borrar esa variable.");
  return (cachedId = String(me.user_id));
}

export async function createImageContainer({ imageUrl, caption, altText }) {
  const params = { image_url: imageUrl, caption, is_ai_generated: "true" };
  if (altText) params.alt_text = altText;
  const r = await call(`/${await igId()}/media`, { method: "POST", params });
  return r.id;
}

/** Hijo de carrusel: imagen sin caption (el caption va en el contenedor padre). */
export async function createCarouselChild({ imageUrl, altText }) {
  const params = { image_url: imageUrl, is_carousel_item: "true" };
  if (altText) params.alt_text = altText;
  const r = await call(`/${await igId()}/media`, { method: "POST", params });
  return r.id;
}

/** Contenedor del carrusel (2–10 hijos). is_ai_generated va solo aquí, no en los hijos. */
export async function createCarouselContainer({ childIds, caption }) {
  const params = { media_type: "CAROUSEL", children: childIds.join(","), caption, is_ai_generated: "true" };
  const r = await call(`/${await igId()}/media`, { method: "POST", params });
  return r.id;
}

export async function waitForContainer(id, { timeoutMs = 5 * 60 * 1000 } = {}) {
  const started = Date.now();
  for (;;) {
    const r = await call(`/${id}`, { params: { fields: "status_code,status" } });
    if (r.status_code === "FINISHED") return;
    if (r.status_code === "ERROR" || r.status_code === "EXPIRED") throw new MetaError(`Contenedor ${id} en estado ${r.status_code}: ${r.status ?? "sin detalle"}`, { transient: false });
    if (Date.now() - started > timeoutMs) throw new MetaError(`Tiempo agotado esperando el contenedor ${id}`, { transient: true });
    await new Promise((r) => setTimeout(r, 5000));
  }
}

export async function publishContainer(id) {
  const r = await call(`/${await igId()}/media_publish`, { method: "POST", params: { creation_id: id } });
  return r.id;
}

export async function getPermalink(mediaId) {
  try {
    return (await call(`/${mediaId}`, { params: { fields: "permalink" } })).permalink;
  } catch {
    return null;
  }
}

export async function getQuota() {
  return call(`/${await igId()}/content_publishing_limit`, { params: { fields: "config,quota_usage" } });
}

// ---------- Renovación del token de larga duración (60 días) ----------
const DAY = 86400000;

/** Renueva si toca. Devuelve { refreshed, daysLeft|null, error? } para que el llamador decida si avisar. */
export async function ensureTokenFresh({ force = false } = {}) {
  const s = loadState();
  const envHash = sha(cfg.meta.token || "");
  if (!s.token || s.token.sourceHash !== envHash) s.token = { value: null, sourceHash: envHash, refreshedAt: null, expiresAt: null, lastAttemptAt: null };

  const t = s.token;
  const due = force || !t.refreshedAt || Date.now() - Date.parse(t.refreshedAt) > 20 * DAY;
  const recentlyTried = t.lastAttemptAt && Date.now() - Date.parse(t.lastAttemptAt) < 6 * 3600 * 1000;
  if (due && !recentlyTried) {
    t.lastAttemptAt = new Date().toISOString();
    saveState();
    try {
      const r = await call("/refresh_access_token", { base: "https://graph.instagram.com", params: { grant_type: "ig_refresh_token" } });
      t.value = r.access_token;
      t.refreshedAt = new Date().toISOString();
      t.expiresAt = new Date(Date.now() + r.expires_in * 1000).toISOString();
      saveState();
      log(`Token de Instagram renovado; vence ${t.expiresAt.slice(0, 10)}.`);
      return { refreshed: true, daysLeft: Math.floor(r.expires_in / 86400) };
    } catch (e) {
      logError(`No se pudo renovar el token: ${e.message}`);
      return { refreshed: false, daysLeft: daysLeft(t), error: e.message };
    }
  }
  return { refreshed: false, daysLeft: daysLeft(t) };
}

const daysLeft = (t) => (t.expiresAt ? Math.floor((Date.parse(t.expiresAt) - Date.now()) / DAY) : null);

/** Anti-duplicados: tras un fallo ambiguo al publicar, busca si el post ya salió (misma cabecera de caption, posterior a `sinceIso`). */
export async function findPublishedSince(sinceIso, captionHead) {
  const r = await call(`/${await igId()}/media`, { params: { fields: "id,caption,timestamp,permalink", limit: "10" } });
  const since = Date.parse(sinceIso) - 60_000;
  return (r.data ?? []).find((m) => Date.parse(m.timestamp) >= since && (m.caption ?? "").startsWith(captionHead)) ?? null;
}

/** Diagnóstico: quién es el dueño del token (sin imprimir el token). Útil para obtener META_IG_USER_ID. */
export async function whoami() {
  return call("/me", { params: { fields: "user_id,username,account_type,media_count" } });
}
