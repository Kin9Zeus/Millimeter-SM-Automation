import { cfg, localParts, log, logError, missingConfig } from "./config.mjs";
import { isPastPostTime, isPaused, markTick } from "./runtime.mjs";
import { composeSlide } from "./compose.mjs";
import { PlanError, createDailyPlan } from "./content.mjs";
import { cleanupOldImages, readRaw, saveComposed, saveRaw } from "./image.mjs";
import { loadKnowledge } from "./knowledge.mjs";
import { MetaError, createCarouselChild, createCarouselContainer, createImageContainer, ensureTokenFresh, findPublishedSince, getPermalink, publishContainer, waitForContainer } from "./meta.mjs";
import { notify } from "./notify.mjs";
import { BudgetError, generateCheckedPhoto } from "./photo.mjs";
import { ideaForDate, loadState, removeIdea, shouldAlert, updatePost } from "./state.mjs";
import { budgetAlert, spendReport } from "./spend.mjs";

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
 * Plan con la idea del cliente. Solo un PlanError (la idea no cabe en las reglas de datos oficiales) cuenta como «idea rechazada».
 * Un fallo de API o de red se propaga tal cual: la idea sigue en la cola y el intento se repite, en vez de perderse.
 * - Idea de una orden manual (/forzar, /previa): si no es viable se avisa y NO se publica otro tema.
 * - Idea de la cola (publicación programada): se avisa y se publica un tema automático para no perder el día.
 */
export async function planWithIdea({ create = createDailyPlan, date, planOpts, idea, explicit, queued, tell = notify }) {
  try {
    return { plan: await create(date, { ...planOpts, idea }), ideaRejected: false };
  } catch (e) {
    if (!idea || !(e instanceof PlanError)) throw e;
    const motivo = String(e.message).split("\n").slice(1).join(" ").slice(0, 400) || e.message.slice(0, 300);
    if (explicit) {
      await tell(`⚠️ No pude convertir tu idea en un post válido: «${idea.slice(0, 120)}».\nMotivo: ${motivo}\nNo publiqué nada. Reformúlala (sin precios, garantías ni datos que no estén en la información de MILLIMETER) y vuelve a intentarlo.`);
      e.notified = true;
      throw e;
    }
    await tell(`⚠️ No pude convertir tu idea en un post válido: «${idea.slice(0, 120)}».\nMotivo: ${motivo}\nPublico un tema automático para no perder el día.`);
    const plan = await create(date, planOpts);
    if (queued) removeIdea(queued.id);
    return { plan, ideaRejected: true };
  }
}

/** Líneas extra del aviso: qué idea se usó, qué no se pudo cumplir y si alguna foto cayó al primer plano de piedra. */
function postNotes(entry, slides) {
  const L = [];
  if (entry.ideaText) L.push(`💡 Basado en tu idea: «${entry.ideaText.slice(0, 160)}»`);
  if (entry.ideaNotes) L.push(`ℹ️ No incluido de tu idea: ${entry.ideaNotes}`);
  const fb = slides.map((s, i) => (s.macroFallback && !["C", "G"].includes(s.layout) ? i + 1 : null)).filter(Boolean);
  if (fb.length) L.push(`⚠️ En ${fb.length > 1 ? "las piezas" : "la pieza"} ${fb.join(", ")} la escena no pasó el control de calidad y se usó un primer plano de la piedra.`);
  return L.length ? `\n${L.join("\n")}` : "";
}

/**
 * Pipeline diario idempotente: cada etapa guarda su resultado en state.json, así un reinicio o reintento
 * continúa donde quedó y NUNCA regenera (ni cobra) lo ya hecho, ni publica dos veces.
 */
export async function runDaily({ dry = cfg.dryRun, force = false, count, extra = false, idea: ideaText } = {}) {
  if (running) return { skipped: "ya hay una ejecución en curso" };
  const missing = missingConfig({ forPublishing: !dry });
  if (missing.length) throw new Error(`Faltan variables de entorno: ${missing.join(", ")}`);

  running = true;
  const { date } = localParts();
  // extra = publicación adicional el mismo día (forzada a mano): clave propia, no toca la del día ni su límite.
  const key = dry ? `dry-${date}-${Date.now()}` : extra ? `${date}-extra-${Date.now()}` : date;
  try {
    const state = loadState();
    let entry = state.posts[key];
    if (entry?.status === "published") return { skipped: "hoy ya se publicó", mediaId: entry.mediaId };
    if (!force && !dry && (entry?.attempts ?? 0) >= cfg.maxAttemptsPerDay) return { skipped: "se agotaron los intentos de hoy" };

    entry = updatePost(key, { attempts: (entry?.attempts ?? 0) + 1, lastAttemptAt: new Date().toISOString(), dry, extra, date, lastError: null });
    log(`▶ Pipeline ${dry ? "(DRY RUN) " : ""}${key} · intento ${entry.attempts}`);

    if (!dry) await ensureTokenFresh();

    const kb = loadKnowledge();

    // 1) Plan del día: formato (1 imagen o carrusel de 3–6), tema, layouts, textos, escenas y caption.
    if (!entry.slides) {
      // Idea del cliente: la que viene en la orden (/forzar, /previa) o, en la publicación programada, la primera de la cola.
      const queued = !ideaText && !dry && !extra ? ideaForDate(date) : null;
      const idea = ideaText ?? queued?.text;
      const planOpts = { count: dry ? count : undefined, seed: key };
      const { plan, ideaRejected } = await planWithIdea({ date, planOpts, idea, explicit: Boolean(ideaText), queued });
      if (queued && !ideaRejected) removeIdea(queued.id);
      entry = updatePost(key, { ...plan, ideaText: idea && !ideaRejected ? idea : null, ideaRejected: ideaRejected ? idea : null, status: "plan_ready" });
    }

    // 2) Piezas: foto sin texto (Nano Banana Pro) → inspección de calidad → composición con la tipografía de marca.
    const budget = { used: entry.imageGenerations ?? 0, max: cfg.maxImagesPerDay };
    const slides = entry.slides.map((s) => ({ ...s }));
    try {
      for (let i = 0; i < slides.length; i++) {
        if (slides[i].composedFile) continue;
        const first = slides[0];
        const useRef = i > 0 && first.rawFile && !["C", "G"].includes(first.layout) && !["C", "G"].includes(slides[i].layout);
        let photo;
        const refs = useRef ? [readRaw(first.rawFile)] : [];
        try {
          photo = await generateCheckedPhoto({ slide: slides[i], kb, refs, budget, index: i, date });
        } catch (e) {
          if (e instanceof BudgetError || slides[i].macroFallback) throw e;
          // Un último intento con la misma escena pero más sencilla, antes de renunciar a la aplicación real y caer a una textura plana.
          if (!slides[i].simplified && !["C", "G"].includes(slides[i].layout)) {
            log(`Pieza ${i + 1}: la escena no pasó el control; último intento con una composición más sencilla.`);
            slides[i] = { ...slides[i], simplified: true };
            try {
              photo = await generateCheckedPhoto({ slide: slides[i], kb, refs, budget, index: i, date, maxAttempts: 1 });
            } catch (e2) {
              if (e2 instanceof BudgetError) throw e2;
            }
          }
          if (!photo) {
            // La escena arquitectónica no pasó el control: se conserva el texto y el layout, pero la foto pasa a ser un primer plano de la piedra.
            log(`Pieza ${i + 1}: la escena no pasó el control de calidad; se usa un primer plano de la piedra como alternativa.`);
            slides[i] = { ...slides[i], macroFallback: true };
            photo = await generateCheckedPhoto({ slide: slides[i], kb, refs: [], budget, index: i, date });
          }
        }
        const rawFile = saveRaw(date, i + 1, photo.buffer);
        const composed = await saveComposed(date, i + 1, await composeSlide(photo.buffer, slides[i].layout, slides[i]));
        slides[i] = { ...slides[i], rawFile, composedFile: composed.file, photoAttempts: photo.attempts, qaSkipped: photo.qaSkipped };
        entry = updatePost(key, { slides, imageGenerations: budget.used, status: "rendering" });
        log(`Pieza ${i + 1}/${slides.length} lista (layout ${slides[i].layout}, ${photo.attempts} intento/s de foto, ${(composed.bytes / 1024).toFixed(0)} KB)`);
      }
    } finally {
      updatePost(key, { imageGenerations: budget.used });
    }
    entry = updatePost(key, { status: "images_ready" });
    const urls = slides.map((s) => mediaUrl(s.composedFile));

    if (dry) {
      entry = updatePost(key, { status: "dry_run" });
      await notify(`🧪 DRY RUN — no se publicó.\nFormato: ${entry.format === "single" ? "1 imagen" : `carrusel de ${entry.count}`} · Tema: ${entry.topic}${postNotes(entry, slides)}\n\n${entry.caption}`, { photoUrls: cfg.publicBaseUrl ? urls : undefined });
      return { dryRun: true, format: entry.format, count: entry.count, topic: entry.topic, layouts: slides.map((s) => s.layout), caption: entry.caption, files: slides.map((s) => s.composedFile) };
    }

    // 3) Publicación en Instagram
    for (const u of urls) await assertPubliclyReachable(u);

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
    if (stale) entry = updatePost(key, { containerId: null, childIds: [], containerCreatedAt: null });

    if (!entry.containerId) {
      if (entry.format === "single") {
        const containerId = await createImageContainer({ imageUrl: urls[0], caption: entry.caption, altText: slides[0].altText });
        entry = updatePost(key, { containerId, containerCreatedAt: new Date().toISOString(), status: "container_created" });
      } else {
        const childIds = [...(entry.childIds ?? [])];
        for (let i = childIds.length; i < urls.length; i++) {
          childIds.push(await createCarouselChild({ imageUrl: urls[i], altText: slides[i].altText }));
          entry = updatePost(key, { childIds, containerCreatedAt: entry.containerCreatedAt ?? new Date().toISOString() });
        }
        for (const id of childIds) await waitForContainer(id);
        const containerId = await createCarouselContainer({ childIds, caption: entry.caption });
        entry = updatePost(key, { containerId, status: "container_created" });
      }
    }
    await waitForContainer(entry.containerId);

    updatePost(key, { publishStartedAt: new Date().toISOString() });
    const mediaId = await publishContainer(entry.containerId);
    const permalink = await getPermalink(mediaId);
    entry = updatePost(key, { status: "published", mediaId, permalink, publishedAt: new Date().toISOString() });

    await notify(`✅ Publicado en Instagram (${entry.format === "single" ? "1 imagen" : `carrusel de ${entry.count}`})\nTema: ${entry.topic}${postNotes(entry, slides)}\n${permalink ?? mediaId}`, { photoUrls: urls });
    return { published: true, mediaId, permalink, format: entry.format, count: entry.count };
  } catch (err) {
    const entry = loadState().posts[key];
    const attempts = entry?.attempts ?? 1;
    logError(`✖ Pipeline falló (intento ${attempts}): ${err.message}`);
    updatePost(key, { lastError: String(err.message).slice(0, 500) });
    const transient = err instanceof MetaError ? err.transient : false;
    if (err instanceof BudgetError) await notify(`⚠️ ${err.message} No se publicará más hoy para no gastar de más; revisa los logs.`);
    if (!err.notified && (attempts === 1 || attempts >= cfg.maxAttemptsPerDay)) {
      await notify(`⚠️ Falló la publicación diaria (intento ${attempts}/${cfg.maxAttemptsPerDay}${transient ? ", error transitorio" : ""}).\n${String(err.message).slice(0, 500)}`);
    }
    throw err;
  } finally {
    running = false;
  }
}

/** Latido del scheduler: renueva el token si toca y dispara el pipeline cuando corresponde. */
export async function tick() {
  markTick();
  try {
    const alert = budgetAlert(spendReport());
    if (alert && shouldAlert(alert.key, 24 * 31)) await notify(alert.text);
    if (cfg.meta.token) {
      const t = await ensureTokenFresh();
      if (t.error && t.daysLeft == null && shouldAlert("token-sin-renovar", 24)) {
        await notify(`⚠️ No pude renovar el token de Instagram y no conozco su vencimiento. Si ya pasaron ~60 días desde que lo generaste, genera uno nuevo y actualiza META_ACCESS_TOKEN.\n${t.error}`);
      } else if (t.daysLeft != null && t.daysLeft < 10 && shouldAlert("token-por-vencer", 24)) {
        await notify(`⚠️ El token de Instagram vence en ${t.daysLeft} días y la renovación automática no ha funcionado. Genera uno nuevo y actualiza META_ACCESS_TOKEN.`);
      }
    }
    if (isPaused()) return;
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
