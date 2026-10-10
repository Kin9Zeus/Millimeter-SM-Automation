import { mkdirSync, readdirSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { join } from "node:path";
import sharp from "sharp";
import { cfg, log } from "./config.mjs";
import { generateImage } from "./gemini.mjs";

const PALETTE = "ivory #F3EEE6, stone #E2D7CD, travertine #C7AE88, taupe #8F7D6A, bronze #765F4D, graphite #3A342E, deep noir #161411";

// Sufijo fijo: refuerza la política de IA sin depender de que el modelo de texto lo recuerde.
const GUARDRAILS =
  "Editorial luxury architecture-magazine aesthetic, warm natural light, generous negative space, calm and refined. " +
  `Color palette: ${PALETTE}. ` +
  "STRICT: absolutely no text, letters, numbers, logos, watermarks or captions anywhere in the image; no people or hands; " +
  "do not depict any specific real project, building, room, staircase, furniture or product; no metal fixtures, handrails, hardware, windows or doors; tight crop on the stone surface itself, no architectural context; generic natural stone only.";

export const imagesDir = () => {
  const d = join(cfg.dataDir, "images");
  mkdirSync(d, { recursive: true });
  return d;
};

const MAX_BYTES = 7.5 * 1024 * 1024; // Meta acepta hasta 8 MB

/** Genera con Nano Banana Pro (2K); Instagram solo acepta JPEG, que es lo que entrega la API. Devuelve el nombre del archivo servido. */
export async function createDailyImage(date, imagePrompt) {
  const { buffer, model } = await generateImage(`${imagePrompt}\n\n${GUARDRAILS}`);
  let quality = 92;
  let jpeg = buffer;
  const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8;
  if (!isJpeg || buffer.length > MAX_BYTES) do {
    jpeg = await sharp(buffer).flatten({ background: "#F3EEE6" }).jpeg({ quality, mozjpeg: true, chromaSubsampling: "4:4:4" }).toBuffer();
    quality -= 8;
  } while (jpeg.length > MAX_BYTES && quality > 50);

  const meta = await sharp(jpeg).metadata();
  const ratio = meta.width / meta.height;
  if (ratio < 0.8 - 0.01 || ratio > 1.91) throw new Error(`Proporción ${meta.width}x${meta.height} fuera del rango de Instagram (4:5 a 1.91:1).`);

  // Nombre impredecible: la URL es pública y no queremos que se pueda enumerar la carpeta.
  const file = `${date}-${randomBytes(9).toString("hex")}.jpg`;
  writeFileSync(join(imagesDir(), file), jpeg);
  log(`Imagen lista: ${file} (${meta.width}x${meta.height}, ${(jpeg.length / 1024).toFixed(0)} KB, ${model})`);
  return { file, width: meta.width, height: meta.height, bytes: jpeg.length, model };
}

export function cleanupOldImages() {
  const limit = Date.now() - cfg.keepImagesDays * 86400000;
  for (const f of readdirSync(imagesDir())) {
    const p = join(imagesDir(), f);
    try { if (statSync(p).mtimeMs < limit) unlinkSync(p); } catch { /* ignorar */ }
  }
}
