import { mkdirSync, readFileSync, readdirSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { join } from "node:path";
import sharp from "sharp";
import { cfg } from "./config.mjs";

const MAX_BYTES = 7.5 * 1024 * 1024; // Meta acepta hasta 8 MB por imagen

const ensure = (name) => {
  const d = join(cfg.dataDir, name);
  mkdirSync(d, { recursive: true });
  return d;
};

/** Piezas finales, servidas públicamente (nombres impredecibles: la URL es pública y no se debe poder enumerar la carpeta). */
export const imagesDir = () => ensure("images");
/** Fotos base sin texto (privadas): sirven para reanudar y como referencia de continuidad en el carrusel. */
export const rawDir = () => ensure("raw");

export function saveRaw(date, index, buffer) {
  const file = `${date}-${index}-${randomBytes(4).toString("hex")}.jpg`;
  writeFileSync(join(rawDir(), file), buffer);
  return file;
}

/** Fotos rechazadas por el inspector (diagnóstico; se borran a los 3 días). */
export const rejectedDir = () => ensure("rejected");
export function saveRejected(date, index, buffer) {
  const file = `${date}-${index}-${randomBytes(3).toString("hex")}.jpg`;
  writeFileSync(join(rejectedDir(), file), buffer);
  return file;
}

export const readRaw = (file) => readFileSync(join(rawDir(), file));

/** Guarda la pieza compuesta como JPEG (Instagram solo acepta JPEG), reduciendo calidad si pasara de 7,5 MB. */
export async function saveComposed(date, index, jpeg) {
  let buf = jpeg;
  for (let q = 88; buf.length > MAX_BYTES && q > 50; q -= 8) buf = await sharp(jpeg).jpeg({ quality: q, mozjpeg: true }).toBuffer();
  const meta = await sharp(buf).metadata();
  const ratio = meta.width / meta.height;
  if (ratio < 0.74 || ratio > 1.91) throw new Error(`Proporción ${meta.width}x${meta.height} fuera de lo aceptado por Instagram.`);
  const file = `${date}-${index}-${randomBytes(9).toString("hex")}.jpg`;
  writeFileSync(join(imagesDir(), file), buf);
  return { file, width: meta.width, height: meta.height, bytes: buf.length };
}

export function cleanupOldImages() {
  for (const [dirFn, days] of [[imagesDir, cfg.keepImagesDays], [rawDir, 7], [rejectedDir, 3]]) {
    const limit = Date.now() - days * 86400000;
    for (const f of readdirSync(dirFn())) {
      const p = join(dirFn(), f);
      try { if (statSync(p).mtimeMs < limit) unlinkSync(p); } catch { /* ignorar */ }
    }
  }
}
