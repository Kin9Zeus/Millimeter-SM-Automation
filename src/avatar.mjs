import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import sharp from "sharp";
import { cfg, dayNumber } from "./config.mjs";
import { loadState, saveState } from "./state.mjs";

// Avatar de Oscar: aparece de forma esporádica en las fotos generadas, con su identidad tomada de una foto real.
// La foto vive en el Volume (DATA_DIR, fuera de git: el repo es público) y se carga/cambia enviándola por Telegram con /oscar.

export const avatarFile = () => join(cfg.dataDir, "avatar", "oscar.jpg");
export const hasAvatar = () => existsSync(avatarFile());
export const readAvatar = () => readFileSync(avatarFile());

/** Normaliza la foto de referencia (JPEG, orientación corregida, lado mayor ≤ 1536 px, sin metadatos) y la guarda. */
export async function saveAvatar(buffer) {
  const out = await sharp(buffer).rotate().resize({ width: 1536, height: 1536, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 92 }).toBuffer();
  const meta = await sharp(out).metadata();
  if (Math.min(meta.width, meta.height) < 400) throw new Error(`La foto es muy pequeña (${meta.width}×${meta.height}); envía una de al menos 400 px de lado.`);
  mkdirSync(dirname(avatarFile()), { recursive: true });
  writeFileSync(avatarFile(), out);
  return { width: meta.width, height: meta.height };
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
