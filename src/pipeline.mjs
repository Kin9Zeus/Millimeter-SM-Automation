import { cfg, isPastPostTime, localParts, log, logError, missingConfig } from "./config.mjs";
import { createDailyContent } from "./content.mjs";
import { cleanupOldImages, createDailyImage } from "./image.mjs";
import { MetaError, createImageContainer, ensureTokenFresh, findPublishedSince, getPermalink, publishContainer, waitForContainer } from "./meta.mjs";
import { notify } from "./notify.mjs";
import { loadState, shouldAlert, updatePost } from "./state.mjs";

let running = false;
export const isRunning = () => running;

const mediaUrl = (file) => `${cfg.publicBaseUrl}/media/${file}`;

async function assertPubliclyReachable(url) {
  const res = await fetch(url, { method: "GET" }).catch((e) => { throw new Error(`La URL pública de la imagen no responde (${e.cause?.code ?? e.message}). Revisa PUBLIC_BASE_URL / dominio de Railway.`); });
  const type = res.headers.get("content-type") ?? "";
  if (!res.ok || !type.includes("image/jpeg")) throw new Error(`La URL pública devolvió HTTP ${res.status} (${type}); Meta no podrá descargar la imagen.`);
  await res.arrayBuffer();
}

/**
 * Pipeline diario idempotente: cada etapa guarda su resultado en state.json, así un reinicio o reintento
 * continúa donde quedó y NUNCA regenera (ni cobra) lo ya hecho, ni publica dos veces.
 */
export async function runDaily({ dry = cfg.dryRun, force = false } = {}) {
  if (running) return { skipped: "ya hay una ejecución en curso" };
  const missing = missingConfig({ forPublishing: !dry });
  if (missing.length) throw new Error(`Faltan variables de entorno: ${missing.join(", ")}`);

  running = true;
  const { date } = localParts();
  const key = dry ? `dry-${date}-${Date.now()}` : date;
  try {
    const state = loadState();
    let entry = state.posts[key];
    if (entry?.status === "published") return { skipped: "hoy ya se publicó", mediaId: entry.mediaId };
    if (!force && !dry && (entry?.attempts ?? 0) >= cfg.maxAttemptsPerDay) return { skipped: "se agotaron los intentos de hoy" };

    entry = updatePost(key, { attempts: (entry?.attempts ?? 0) + 1, lastAttemptAt: new Date().toISOString(), dry, lastError: null });
    log(`▶ Pipeline ${dry ? "(DRY RUN) " : ""}${key} · intento ${entry.attempts}`);

    if (!dry) await ensureTokenFresh();

    // 1) Contenido (Gemini texto + validación + auditor)
    if (!entry.caption) {
      const content = await createDailyContent(date);
      entry = updatePost(key, { ...content, status: "content_ready" });
    }

    // 2) Imagen (Nano Banana Pro 2K → JPEG)
    if (!entry.imageFile) {
      const img = await createDailyImage(date, entry.imagePrompt);
      entry = updatePost(key, { imageFile: img.file, imageInfo: { width: img.width, height: img.height, bytes: img.bytes, model: img.model }, status: "image_ready" });
    }

    if (dry) {
      entry = updatePost(key, { status: "dry_run" });
      await notify(`🧪 DRY RUN — no se publicó.\nTema: ${entry.topic}\n\n${entry.caption}`, { photoUrl: cfg.publicBaseUrl ? mediaUrl(entry.imageFile) : undefined });
      return { dryRun: true, topic: entry.topic, caption: entry.caption, imageFile: entry.imageFile };
    }

    // 3) Publicación en Instagram
    const url = mediaUrl(entry.imageFile);
    await assertPubliclyReachable(url);

    // Si un intento anterior pudo haber publicado sin que lo supiéramos, lo confirmamos antes de reintentar.
    if (entry.publishStartedAt && !entry.mediaId) {
      const found = await findPublishedSince(entry.publishStartedAt, entry.caption.slice(0, 40)).catch(() => null);
      if (found) {
        entry = updatePost(key, { status: "published", mediaId: found.id, permalink: found.permalink, publishedAt: found.timestamp });
        await notify(`✅ Publicado (recuperado tras un fallo de red): ${found.permalink ?? found.id}`);
        return { published: true, mediaId: found.id, recovered: true };
      }
    }

    const stale = entry.containerCreatedAt && Date.now() - Date.parse(entry.containerCreatedAt) > 20 * 3600 * 1000;
    if (!entry.containerId || stale) {
      const containerId = await createImageContainer({ imageUrl: url, caption: entry.caption, altText: entry.altText });
      entry = updatePost(key, { containerId, containerCreatedAt: new Date().toISOString(), status: "container_created" });
    }
    await waitForContainer(entry.containerId);

    updatePost(key, { publishStartedAt: new Date().toISOString() });
    const mediaId = await publishContainer(entry.containerId);
    const permalink = await getPermalink(mediaId);
    entry = updatePost(key, { status: "published", mediaId, permalink, publishedAt: new Date().toISOString() });

    await notify(`✅ Publicado en Instagram\nTema: ${entry.topic}\n${permalink ?? mediaId}`, { photoUrl: url });
    return { published: true, mediaId, permalink };
  } catch (err) {
    const entry = loadState().posts[key];
    const attempts = entry?.attempts ?? 1;
    logError(`✖ Pipeline falló (intento ${attempts}): ${err.message}`);
    updatePost(key, { lastError: String(err.message).slice(0, 500) });
    const transient = err instanceof MetaError ? err.transient : false;
    if (attempts === 1 || attempts >= cfg.maxAttemptsPerDay) {
      await notify(`⚠️ Falló la publicación diaria (intento ${attempts}/${cfg.maxAttemptsPerDay}${transient ? ", error transitorio" : ""}).\n${String(err.message).slice(0, 500)}`);
    }
    throw err;
  } finally {
    running = false;
  }
}

/** Latido del scheduler: renueva el token si toca y dispara el pipeline cuando corresponde. */
export async function tick() {
  try {
    if (cfg.meta.token) {
      const t = await ensureTokenFresh();
      if (t.error && t.daysLeft == null && shouldAlert("token-sin-renovar", 24)) {
        await notify(`⚠️ No pude renovar el token de Instagram y no conozco su vencimiento. Si ya pasaron ~60 días desde que lo generaste, genera uno nuevo y actualiza META_ACCESS_TOKEN.\n${t.error}`);
      } else if (t.daysLeft != null && t.daysLeft < 10 && shouldAlert("token-por-vencer", 24)) {
        await notify(`⚠️ El token de Instagram vence en ${t.daysLeft} días y la renovación automática no ha funcionado. Genera uno nuevo y actualiza META_ACCESS_TOKEN.`);
      }
    }
    if (cfg.paused) return;
    const { date } = localParts();
    const entry = loadState().posts[date];
    if (!isPastPostTime() || entry?.status === "published") return;
    if ((entry?.attempts ?? 0) >= cfg.maxAttemptsPerDay) return;
    if (entry?.lastAttemptAt && Date.now() - Date.parse(entry.lastAttemptAt) < cfg.retryEveryMs) return;
    await runDaily();
  } catch (e) {
    logError(`tick: ${e.message}`);
  }
}

export function housekeeping() {
  try { cleanupOldImages(); } catch (e) { logError(`limpieza: ${e.message}`); }
}
