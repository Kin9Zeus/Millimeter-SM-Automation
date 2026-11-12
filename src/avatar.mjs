import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { cfg, dayNumber } from "./config.mjs";
import { loadState, saveState } from "./state.mjs";

// Avatar de Oscar: aparece de forma esporádica en las fotos generadas, con su identidad Y su ropa tomadas de una foto real.
// Las fotos viven en el Volume (DATA_DIR, fuera de git: el repo es público):
//  - base.jpg   → foto base (la oficial, oscar_avatar.jpg del proyecto), cargada con `npm run avatar:base` (PUT /admin/avatar).
//  - oscar.jpg  → foto opcional enviada por Telegram con el pie /oscar; si existe, tiene prioridad. /oscar base la quita.

const dir = () => join(cfg.dataDir, "avatar");
export const baseAvatarFile = () => join(dir(), "base.jpg");
export const customAvatarFile = () => join(dir(), "oscar.jpg");

/** "telegram" (foto enviada por el cliente), "base" (foto oficial) o null (ninguna: Oscar no aparece). */
export const avatarSource = () => (existsSync(customAvatarFile()) ? "telegram" : existsSync(baseAvatarFile()) ? "base" : null);
export const hasAvatar = () => avatarSource() != null;
export const readAvatar = () => readFileSync(avatarSource() === "telegram" ? customAvatarFile() : baseAvatarFile());

/** Normaliza la foto de referencia (JPEG, orientación corregida, lado mayor ≤ 1536 px, sin metadatos) y la guarda. */
export async function saveAvatar(buffer, { base = false } = {}) {
  const out = await sharp(buffer).rotate().resize({ width: 1536, height: 1536, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 92 }).toBuffer();
  const meta = await sharp(out).metadata();
  if (Math.min(meta.width, meta.height) < 400) throw new Error(`La foto es muy pequeña (${meta.width}×${meta.height}); envía una de al menos 400 px de lado.`);
  mkdirSync(dir(), { recursive: true });
  writeFileSync(base ? baseAvatarFile() : customAvatarFile(), out);
  return { width: meta.width, height: meta.height };
}

/** Quita la foto enviada por Telegram: se vuelve a la foto base. Devuelve si había una. */
export function resetAvatar() {
  if (!existsSync(customAvatarFile())) return false;
  unlinkSync(customAvatarFile());
  return true;
}

// Layouts donde una persona cabe sin estorbar: fuera las texturas (C, G), el círculo de detalle central (J) y la franja horizontal (L).
export const AVATAR_LAYOUTS = new Set(["A", "B", "D", "E", "F", "H", "I", "K"]);

/** Ajustes vigentes: variables de entorno + lo que el cliente cambió desde Telegram. */
export function avatarSettings() {
  const r = loadState().runtime ?? {};
  return {
    enabled: r.avatarEnabled ?? cfg.avatar.enabled,
    chance: r.avatarChance ?? cfg.avatar.chance,
    minGapDays: cfg.avatar.minGapDays,
    forceNext: Boolean(r.avatarForceNext),
  };
}

export function setAvatarSettings(patch) {
  const s = loadState();
  const map = { enabled: "avatarEnabled", chance: "avatarChance", forceNext: "avatarForceNext" };
  s.runtime = { ...(s.runtime ?? {}) };
  for (const [k, v] of Object.entries(patch)) if (map[k]) s.runtime[map[k]] = v;
  saveState();
}

export const lastAvatarDate = (posts) =>
  posts.filter((p) => p.status === "published" && !p.dry && p.avatarUsed).map((p) => p.date).sort().pop() ?? null;

export const mentionsOscar = (text) => /(^|[^\p{L}])[oó]scar(?!\p{L})/iu.test(String(text ?? ""));

/**
 * ¿Este post lleva a Oscar, y en qué pieza? Devuelve el índice de la pieza o null.
 * - Pedido explícito (/oscar proximo o una idea que lo menciona): siempre, si hay foto y una pieza apta.
 * - Si no: solo si está activo, pasaron `minGapDays` desde su última aparición y sale el sorteo (`chance`).
 */
export function pickAvatarSlide({ slides, posts = [], date, idea, rand = Math.random, settings = avatarSettings(), available = hasAvatar() }) {
  if (!available) return null;
  const eligible = slides.map((s, i) => (AVATAR_LAYOUTS.has(s.layout) ? i : null)).filter((i) => i != null);
  if (!eligible.length) return null;
  const asked = settings.forceNext || mentionsOscar(idea);
  if (!asked) {
    if (!settings.enabled || !(settings.chance > 0)) return null;
    const last = lastAvatarDate(posts);
    if (last && dayNumber(date) - dayNumber(last) < settings.minGapDays) return null;
    if (rand() >= settings.chance) return null;
  }
  return eligible[Math.floor(rand() * eligible.length)];
}
