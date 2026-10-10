import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { trimSideBars } from "../src/photo.mjs";

const noisy = (w, h, lo, spread) => {
  const b = Buffer.alloc(w * h * 3);
  for (let i = 0; i < b.length; i++) b[i] = lo + Math.floor(Math.random() * spread);
  return sharp(b, { raw: { width: w, height: h, channels: 3 } });
};

test("recorta franjas laterales uniformes (letterbox) y no toca fotos normales", async () => {
  const w = 1000, h = 1200, bar = 120;
  const inner = await noisy(w - 2 * bar, h, 110, 70).png().toBuffer();
  const boxed = await sharp({ create: { width: w, height: h, channels: 3, background: "#F4F1EA" } }).composite([{ input: inner, left: bar, top: 0 }]).jpeg({ quality: 95 }).toBuffer();
  const r = await trimSideBars(boxed);
  assert.ok(r.trimmed);
  assert.ok((await sharp(r.buffer).metadata()).width <= w - 2 * bar + 2);
  assert.equal((await trimSideBars(await noisy(w, h, 110, 70).jpeg({ quality: 95 }).toBuffer())).trimmed, false);
});
