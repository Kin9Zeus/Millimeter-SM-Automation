import { readdirSync, statSync, statfsSync } from "node:fs";
import { join } from "node:path";
import { cfg, localParts, missingConfig } from "./config.mjs";
import { pingGemini } from "./gemini.mjs";
import { dayLabel } from "./format.mjs";
import { imagesDir } from "./image.mjs";
import { getQuota, whoami } from "./meta.mjs";
import { isPaused, lastTick } from "./runtime.mjs";
import { linkedChats } from "./telegram.mjs";
import { loadState } from "./state.mjs";

// Chequeo de salud bajo demanda (/salud). Cada comprobación es independiente y nunca lanza: un fallo se reporta como ❌ y el resto sigue.
// Las comprobaciones externas son gratuitas (no generan imágenes ni texto).

const HOUR = 3600_000;
const MB = 1024 * 1024;
const ok = (name, detail) => ({ name, level: "ok", detail });
const warn = (name, detail) => ({ name, level: "warn", detail });
const fail = (name, detail) => ({ name, level: "fail", detail });
const ago = (ms) => ((ms = Math.max(0, ms)) < 90_000 ? `${Math.round(ms / 1000)} s` : ms < 90 * 60_000 ? `${Math.round(ms / 60_000)} min` : ms < 48 * HOUR ? `${Math.round(ms / HOUR)} h` : `${Math.round(ms / (24 * HOUR))} días`);

/** Sondas externas reemplazables en pruebas. */
export const defaultProbes = {
  instagram: async () => ({ me: await whoami(), quota: await getQuota().catch((e) => ({ error: e.message })) }),
  gemini: pingGemini,
  publicUrl: async (url) => {
    const res = await fetch(`${url}/health`, { signal: AbortSignal.timeout(8000) });
    return res.ok;
  },
  disk: () => {
    const fs = statfsSync(cfg.dataDir);
    let images = 0, imageBytes = 0;
    try { for (const f of readdirSync(imagesDir())) { images++; imageBytes += statSync(join(imagesDir(), f)).size; } } catch { /* carpeta aún no creada */ }
    return { freeBytes: fs.bavail * fs.bsize, totalBytes: fs.blocks * fs.bsize, images, imageBytes };
  },
};

async function guarded(name, fn) {
  try { return await fn(); } catch (e) { return fail(name, String(e.message ?? e).slice(0, 200)); }
}

export async function collectHealth({ probes = defaultProbes, now = Date.now() } = {}) {
  const state = loadState();
  const out = [];

  // Programador: el latido corre cada 5 min.
  out.push(await guarded("Programador", () => {
    const t = lastTick();
    if (t == null) return warn("Programador", "arrancando (aún sin latido)");
    const age = now - t;
    return age > 3 * cfg.tickEveryMs ? fail("Programador", `sin latido desde hace ${ago(age)}`) : ok("Programador", `latido hace ${ago(age)}${isPaused() ? " · ⏸ PAUSADO" : ""}`);
  }));

  out.push(await guarded("Configuración", () => {
    const miss = missingConfig();
    return miss.length ? fail("Configuración", `faltan variables: ${miss.join(", ")}`) : ok("Configuración", "variables obligatorias presentes");
  }));

  // Publicaciones: última publicada y errores recientes.
  out.push(await guarded("Publicaciones", () => {
    const posts = Object.values(state.posts).filter((p) => !p.dry);
    const last = posts.filter((p) => p.status === "published").sort((a, b) => Date.parse(b.publishedAt ?? b.date) - Date.parse(a.publishedAt ?? a.date))[0];
    if (!last) return warn("Publicaciones", "aún no hay ninguna publicada");
    const age = now - Date.parse(last.publishedAt ?? `${last.date}T12:00:00Z`);
    const errs = posts.filter((p) => p.lastError && p.status !== "published" && now - Date.parse(p.lastAttemptAt ?? `${p.date}T00:00:00Z`) < 3 * 24 * HOUR);
    const base = `última hace ${ago(age)}`;
    if (!isPaused() && age > 54 * HOUR) return fail("Publicaciones", `${base}: se saltó al menos un día`);
    if (errs.length) return warn("Publicaciones", `${base}; error reciente (${dayLabel(errs[0].date)}): ${errs[0].lastError.slice(0, 140)}`);
    if (!isPaused() && age > 30 * HOUR) return warn("Publicaciones", `${base}: revisa si hoy ya toca`);
    return ok("Publicaciones", base);
  }));

  // Instagram: cuenta, token y cuota de publicación.
  out.push(await guarded("Instagram", async () => {
    const { me, quota } = await probes.instagram();
    const days = state.token?.expiresAt ? Math.floor((Date.parse(state.token.expiresAt) - now) / (24 * HOUR)) : null;
    const used = quota?.data?.[0]?.quota_usage;
    const bits = [`@${me.username}`, days != null ? `token vence en ${days} días` : "vencimiento del token desconocido", used != null ? `cuota ${used}/${quota.data[0].config?.quota_total ?? 100} en 24 h` : null].filter(Boolean);
    if (days != null && days < 3) return fail("Instagram", bits.join(" · "));
    if (days != null && days < 10) return warn("Instagram", `${bits.join(" · ")} (la renovación automática no ha funcionado)`);
    return ok("Instagram", bits.join(" · "));
  }));

  out.push(await guarded("Gemini", async () => {
    const g = await probes.gemini();
    return ok("Gemini", `clave válida · texto ${g.text} · imagen ${g.image}`);
  }));

  out.push(await guarded("URL pública", async () => {
    if (!cfg.publicBaseUrl) return fail("URL pública", "sin dominio configurado: Meta no podría descargar las imágenes");
    return (await probes.publicUrl(cfg.publicBaseUrl)) ? ok("URL pública", cfg.publicBaseUrl.replace(/^https?:\/\//, "")) : fail("URL pública", "el servicio no responde en su dominio");
  }));

  out.push(await guarded("Almacenamiento", () => {
    const d = probes.disk();
    const free = d.freeBytes / MB, pct = (d.freeBytes / d.totalBytes) * 100;
    const detail = `${free.toFixed(0)} MB libres (${pct.toFixed(0)} %) · ${d.images} imágenes publicadas (${(d.imageBytes / MB).toFixed(0)} MB)`;
    return free < 50 ? fail("Almacenamiento", detail) : free < 200 || pct < 10 ? warn("Almacenamiento", detail) : ok("Almacenamiento", detail);
  }));

  out.push(await guarded("Telegram", () => {
    const n = Object.keys(linkedChats()).length;
    return n ? ok("Telegram", `${n} chat(s) vinculado(s)`) : warn("Telegram", "ningún chat vinculado: nadie recibe avisos");
  }));

  return out;
}

const ICON = { ok: "✅", warn: "⚠️", fail: "❌" };

export function formatHealth(checks, { now = Date.now() } = {}) {
  const { date, hour, minute } = localParts(new Date(now));
  const L = [`🩺 Salud del bot · ${date} ${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`, ""];
  for (const c of checks) L.push(`${ICON[c.level]} ${c.name}: ${c.detail}`);
  const f = checks.filter((c) => c.level === "fail").length, w = checks.filter((c) => c.level === "warn").length;
  L.push("", f ? `Resultado: ❌ ${f} fallo(s)${w ? ` y ${w} aviso(s)` : ""}. Hay algo que atender.` : w ? `Resultado: ⚠️ ${w} aviso(s), sin fallos.` : "Resultado: ✅ todo en orden.");
  const sha = process.env.RAILWAY_GIT_COMMIT_SHA;
  L.push(`Versión: ${sha ? `${sha.slice(0, 7)} (Railway)` : "local"} · Node ${process.versions.node} · activo hace ${ago(process.uptime() * 1000)}`);
  return L.join("\n");
}
