import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";
import sharp from "sharp";

// Compositor de piezas: la foto la genera Nano Banana SIN texto y aquí se montan, en código, el layout y la
// tipografía de marca. Así el nombre, las tildes y las cifras salen siempre exactos (la IA no puede deformarlos).
// Se diseña en 1080×1440 (3:4, el formato del feed de la marca) y se exporta a 1440×1920.

const FONT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..", "assets", "fonts");
const FONT_FILES = ["CormorantGaramond-Medium.ttf", "CormorantGaramond-SemiBold.ttf", "Montserrat-Regular.ttf", "Montserrat-Medium.ttf", "Montserrat-SemiBold.ttf"].map((f) => resolve(FONT_DIR, f));

export const W = 1080;
export const H = 1440;
const OUT_W = 1440;

// Paleta tomada de las capturas del feed (café carbón cálido, dorado apagado, crema).
export const C = { carbon: "#2A211B", carbonDeep: "#1C1612", gold: "#B89E78", beige: "#EADFCF", cream: "#F2EADD", ink: "#2A211B", inkSoft: "#5A4A3E" };

const SERIF = "Cormorant Garamond";
const SANS = "Montserrat";
export const URL_TEXT = "MILLIMETERSOUTHAMERICA.COM";
export const SWIPE_TEXT = "DESLIZA →";

export const LAYOUTS = {
  A: "Franja oscura: foto a sangre con degradado café carbón abajo y texto a la izquierda",
  B: "Arco crema: fondo crema, texto centrado arriba y foto en marco de arco",
  C: "Textura + dato grande: macro de piedra a sangre con una cifra enorme centrada",
  D: "Dividido: foto 55 % del ancho y panel café carbón con el texto",
  E: "Portada a sangre: foto completa con el texto oscuro arriba sobre una zona clara",
  F: "Marco tipo revista: fondo crema, foto con passe-partout y pie editorial",
  G: "Tipográfica: fondo café carbón, muestra circular de piedra y texto centrado",
  H: "Tarjeta: foto a sangre con una tarjeta de texto en la esquina inferior (izquierda o derecha)",
  I: "Mitad superior: foto ancha en los dos tercios de arriba y el texto debajo, sobre un fondo liso",
  J: "Detalle: foto rectangular con un círculo de acercamiento a caballo sobre su borde y el texto debajo",
  K: "Arco lateral: foto en arco a un lado y una columna de texto estrecha al otro",
  L: "Cifra + escena: dato grande arriba y la foto de la escena en una franja ancha abajo [necesita big y bigLabel]",
};

/** Todos los layouts, en orden. */
export const ALL_LAYOUTS = Object.keys(LAYOUTS);

// Qué debe dejar libre/componer la foto según el layout (se inyecta en el prompt de imagen).
export const PHOTO_BRIEF = {
  A: "Vertical 3:4 photo. Keep the main subject and architectural interest in the upper two thirds; the lower third should be calm, simple floor, wall or soft shadow (a dark gradient will be added there).",
  B: "Vertical portrait photo with a centered, symmetric composition (it will be cropped inside an arch-shaped frame). Subject well inside the frame, nothing important touching the edges.",
  C: "Extreme macro close-up of the natural stone surface, filling the whole frame edge to edge with its veining and grain (a texture, not an object; no edges or thickness visible). Even, soft raking light, no horizon, no objects, no space visible.",
  D: "Vertical portrait photo with the subject centered; the left 55% of the width will be shown, so keep the key element near the middle of the frame.",
  E: "Full-bleed vertical photo. The top 30% of the frame must be a large, calm, bright and uncluttered plain area (a clear light wall or ceiling) because dark text will be placed over it.",
  F: "Clean vertical editorial photo, well balanced, with breathing room around the subject (it will be framed with a cream passe-partout).",
  G: "Straight top-down macro of a flat natural stone surface that fills the ENTIRE frame edge to edge. It is a texture, NOT an object: no disc, no plate, no tabletop, no edges, no surroundings and no thickness visible anywhere.",
  H: "Full-bleed vertical photo. A card will cover the bottom-left or bottom-right corner (about 70% of the width and 30% of the height), so keep the main subject in the upper two thirds and leave the lower third calm and simple.",
  I: "Vertical photo whose top 65% will be shown as a wide crop: keep the main subject and the stone feature centered vertically within the middle 60% of the frame, nothing important in the top or bottom 20%.",
  J: "Vertical photo with the stone feature clearly visible in the CENTER of the frame (the center will also be shown enlarged inside a small circle). Keep the composition balanced and the center rich in stone texture.",
  K: "Narrow vertical composition: it will be cropped inside a tall arch roughly 1:2 (much narrower than the photo). Keep the key subject in the central 55% of the width, nothing important near the left or right edges.",
  L: "Photo that will be cropped to a wide horizontal strip (about 5:3): put the main subject and the stone feature in the middle band of the frame (from 30% to 70% of the height), nothing important in the top or bottom 25%.",
};

// ---------- utilidades de texto ----------
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// Ancho aproximado (px) de una cadena: suficiente para auto-ajustar el tamaño y evitar desbordes.
function approxWidth(text, size, { family = SERIF, spacing = 0, upper = false } = {}) {
  const base = family === SERIF ? (upper ? 0.66 : 0.46) : upper ? 0.72 : 0.56;
  return [...text].length * (size * base + spacing);
}

function fitSize(text, size, maxWidth, opts, min = 30) {
  let s = size;
  while (s > min && approxWidth(text, s, opts) > maxWidth) s -= 2;
  return s;
}

function wrap(text, size, maxWidth, opts, maxLines = 2) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let cur = "";
  for (const w of words) {
    const test = cur ? `${cur} ${w}` : w;
    if (approxWidth(test, size, opts) <= maxWidth || !cur) cur = test;
    else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  return lines.slice(0, maxLines);
}

const t = (x, y, text, { size, family = SANS, weight = 400, fill, anchor = "start", spacing = 0, opacity = 1 }) =>
  `<text x="${x}" y="${y}" font-family="${family}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}" letter-spacing="${spacing}" opacity="${opacity}">${esc(text)}</text>`;

const wordmark = (x, y, { anchor = "start", fill = C.beige, size = 30 } = {}) =>
  t(x, y, "MILLIMETER", { size, family: SERIF, weight: 500, fill, anchor, spacing: size * 0.2 });

const eyebrow = (x, y, text, { anchor = "start", size = 21, fill = C.gold } = {}) =>
  text ? t(x, y, text.toUpperCase(), { size, weight: 600, fill, anchor, spacing: size * 0.24 }) : "";

function title(x, y, l1, l2, { fill, anchor = "start", size = 78, maxWidth = 900, lead = 1.06 }) {
  const s = Math.min(fitSize(l1, size, maxWidth, { family: SERIF }), l2 ? fitSize(l2, size, maxWidth, { family: SERIF }) : size);
  return t(x, y, l1, { size: s, family: SERIF, weight: 500, fill, anchor }) + (l2 ? t(x, y + s * lead, l2, { size: s, family: SERIF, weight: 500, fill, anchor }) : "");
}

function subtitle(x, y, text, { fill, anchor = "start", size = 29, maxWidth = 900, lineH = 1.4 }) {
  if (!text) return "";
  return wrap(text, size, maxWidth, { family: SANS }, 2).map((line, i) => t(x, y + i * size * lineH, line, { size, weight: 400, fill, anchor })).join("");
}

const closing = (x, y, text, { anchor = "start", fill = C.beige, size = 20 } = {}) =>
  text ? t(x, y, text, { size, weight: 500, fill, anchor, spacing: size * 0.22, opacity: 0.9 }) : "";

const svg = (body, defs = "", bg = "none") => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><defs>${defs}</defs>${bg === "none" ? "" : `<rect width="${W}" height="${H}" fill="${bg}"/>`}${body}</svg>`;

function render(svgString, width = OUT_W) {
  return new Resvg(svgString, { fitTo: { mode: "width", value: width }, font: { fontFiles: FONT_FILES, loadSystemFonts: false, defaultFontFamily: SANS } }).render().asPng();
}

const SCALE = OUT_W / W;
const px = (n) => Math.round(n * SCALE);

async function coverPhoto(photo, w, h) {
  return sharp(photo).resize(px(w), px(h), { fit: "cover", position: "centre" }).toBuffer();
}

// ---------- temas de color y espejo (variantes dentro de la paleta de marca) ----------
// Cada layout con fondo propio acepta un tema (crema, lino, arena, travertino, café, café profundo) y algunos pueden ir en espejo.
// Así los mismos 12 layouts producen decenas de presentaciones distintas sin salirse de la paleta de la marca.
export const THEMES = {
  cream: { bg: C.cream, ink: C.ink, soft: C.inkSoft, eyebrow: "#8A6F4C", rule: C.gold, dark: false },
  linen: { bg: "#EEE8DE", ink: C.ink, soft: C.inkSoft, eyebrow: "#86694A", rule: C.gold, dark: false },
  sand: { bg: "#E3D3BA", ink: C.ink, soft: "#4E4034", eyebrow: "#74593A", rule: "#9C7F57", dark: false },
  travertine: { bg: "#D5C6AC", ink: C.ink, soft: "#463A2F", eyebrow: "#6E5436", rule: "#8F7550", dark: false },
  carbon: { bg: C.carbon, ink: C.beige, soft: "#D9CDBB", eyebrow: C.gold, rule: C.gold, dark: true },
  deep: { bg: C.carbonDeep, ink: C.beige, soft: "#D9CDBB", eyebrow: C.gold, rule: C.gold, dark: true },
};
export const THEME_IDS = Object.keys(THEMES);
/** Layouts que aceptan tema y los que aceptan espejo. */
export const THEMED = new Set(["B", "D", "F", "G", "H", "I", "J", "K", "L"]);
export const FLIPPABLE = new Set(["D", "H", "J", "K"]);
export const DEFAULT_THEME = { B: "cream", D: "carbon", F: "cream", G: "carbon", H: "cream", I: "cream", J: "cream", K: "cream", L: "cream" };

const themeOf = (s, layout) => THEMES[s.look?.theme] ?? THEMES[DEFAULT_THEME[layout]];
const flipped = (s) => Boolean(s.look?.flip);
const solid = (color) => ({ create: { width: OUT_W, height: px(H), channels: 3, background: color } });

/** Etiqueta que se reduce hasta caber en `maxWidth` (las columnas estrechas no admiten las etiquetas largas a tamaño normal). */
function eyebrowFit(x, y, text, maxWidth, { anchor = "start", size = 21, fill = C.gold } = {}) {
  if (!text) return "";
  let sz = size;
  while (sz > 12 && [...text].length * (sz * 0.72 + sz * 0.24) > maxWidth) sz -= 1;
  return eyebrow(x, y, text, { anchor, size: sz, fill });
}

const archMask = (aw, ah) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${px(aw)}" height="${px(ah)}"><path d="M0 ${px(ah)} V${px(aw / 2)} A${px(aw / 2)} ${px(aw / 2)} 0 0 1 ${px(aw)} ${px(aw / 2)} V${px(ah)} Z" fill="#fff"/></svg>`);
const circleMask = (r) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${px(r * 2)}" height="${px(r * 2)}"><circle cx="${px(r)}" cy="${px(r)}" r="${px(r)}" fill="#fff"/></svg>`);
const topVeil = (h = 260, o = 0.5) => svg(`<rect width="${W}" height="${h}" fill="url(#v)"/>`, `<linearGradient id="v" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${C.carbonDeep}" stop-opacity="${o}"/><stop offset="1" stop-color="${C.carbonDeep}" stop-opacity="0"/></linearGradient>`);

// ---------- layouts ----------
// slide = { eyebrow, title1, title2, subtitle, big, bigLabel, closing, look: { theme, flip } }
const LAYOUT_FNS = {
  async A(photo, s) {
    const defs = `<linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${C.carbonDeep}" stop-opacity="0"/><stop offset="0.38" stop-color="${C.carbon}" stop-opacity="0.82"/><stop offset="1" stop-color="${C.carbonDeep}" stop-opacity="0.98"/></linearGradient>`;
    const bg = svg(`<rect x="0" y="${H * 0.52}" width="${W}" height="${H * 0.48}" fill="url(#g)"/>`, defs);
    const body = wordmark(72, 1010) + eyebrow(72, 1062, s.eyebrow) + title(72, 1150, s.title1, s.title2, { fill: C.beige, size: 80, maxWidth: 930 }) + subtitle(72, 1292, s.subtitle, { fill: C.beige, maxWidth: 930 }) + closing(72, 1380, s.closing);
    return { base: await coverPhoto(photo, W, H), layers: [{ input: render(bg) }, { input: render(svg(body)) }] };
  },

  async B(photo, s) {
    const T = themeOf(s, "B");
    const aw = 800, ah = 860, ax = (W - aw) / 2, ay = 470;
    const masked = await sharp(await coverPhoto(photo, aw, ah)).composite([{ input: archMask(aw, ah), blend: "dest-in" }]).png().toBuffer();
    const body = wordmark(W / 2, 112, { anchor: "middle", fill: T.ink }) + eyebrow(W / 2, 168, s.eyebrow, { anchor: "middle", fill: T.eyebrow }) + title(W / 2, 262, s.title1, s.title2, { fill: T.ink, anchor: "middle", size: 74, maxWidth: 900 }) + subtitle(W / 2, 395, s.subtitle, { fill: T.soft, anchor: "middle", maxWidth: 860, size: 27 }) + closing(W / 2, 1390, s.closing, { anchor: "middle", fill: T.soft });
    return { base: await sharp(solid(T.bg)).png().toBuffer(), layers: [{ input: masked, left: px(ax), top: px(ay) }, { input: render(svg(body)) }] };
  },

  async C(photo, s) {
    const veil = svg(`<rect width="${W}" height="${H}" fill="${C.carbonDeep}" opacity="0.46"/>`);
    const big = s.big ?? "";
    const bigSize = fitSize(big, 250, 900, { family: SERIF }, 90);
    const body = wordmark(W / 2, 110, { anchor: "middle" }) + eyebrow(W / 2, 168, s.eyebrow, { anchor: "middle", fill: C.beige }) +
      t(W / 2, 700, big, { size: bigSize, family: SERIF, weight: 500, fill: C.beige, anchor: "middle" }) +
      (s.bigLabel ? t(W / 2, 700 + bigSize * 0.2 + 36, s.bigLabel.toUpperCase(), { size: 26, weight: 500, fill: C.gold, anchor: "middle", spacing: 6 }) : "") +
      (s.title1 ? title(W / 2, 1090, s.title1, s.title2, { fill: C.beige, anchor: "middle", size: 62, maxWidth: 900 }) : "") +
      subtitle(W / 2, 1230, s.subtitle, { fill: C.beige, anchor: "middle", maxWidth: 840, size: 27 }) + closing(W / 2, 1380, s.closing, { anchor: "middle" });
    return { base: await coverPhoto(photo, W, H), layers: [{ input: render(veil) }, { input: render(svg(body)) }] };
  },

  async D(photo, s) {
    const T = themeOf(s, "D"), flip = flipped(s);
    const pw = Math.round(W * 0.55);
    const px0 = flip ? 0 : pw; // x donde empieza el panel de texto
    const panel = svg(`<rect x="${px0}" y="0" width="${W - pw}" height="${H}" fill="${T.bg}"/>`);
    const x = px0 + 52, mw = W - pw - 100;
    const body = wordmark(x, 130, { size: 26, fill: T.ink }) + eyebrowFit(x, 600, s.eyebrow, mw, { size: 18, fill: T.eyebrow }) +
      wrap(`${s.title1} ${s.title2}`, 64, mw, { family: SERIF }, 4).map((l, i) => t(x, 690 + i * 70, l, { size: 64, family: SERIF, weight: 500, fill: T.ink })).join("") +
      (s.subtitle ? wrap(s.subtitle, 25, mw, { family: SANS }, 4).map((l, i) => t(x, 1010 + i * 36, l, { size: 25, fill: T.ink, weight: 400, opacity: 0.92 })).join("") : "") + closing(x, 1370, s.closing, { size: 17, fill: T.ink });
    return { base: await sharp(solid(T.bg)).png().toBuffer(), layers: [{ input: await coverPhoto(photo, pw, H), left: flip ? px(W - pw) : 0, top: 0 }, { input: render(panel) }, { input: render(svg(body)) }] };
  },

  async E(photo, s) {
    const defs = `<linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${C.cream}" stop-opacity="0.55"/><stop offset="1" stop-color="${C.cream}" stop-opacity="0"/></linearGradient>`;
    const veil = svg(`<rect width="${W}" height="520" fill="url(#g)"/>`, defs);
    const body = wordmark(72, 112, { fill: C.ink }) + eyebrow(72, 176, s.eyebrow, { fill: "#7A5F3E" }) + title(72, 262, s.title1, s.title2, { fill: C.ink, size: 82, maxWidth: 930 }) + subtitle(72, 400, s.subtitle, { fill: C.inkSoft, maxWidth: 800 }) + closing(72, 1385, s.closing, { fill: C.ink });
    return { base: await coverPhoto(photo, W, H), layers: [{ input: render(veil) }, { input: render(svg(body)) }] };
  },

  async F(photo, s) {
    const T = themeOf(s, "F");
    const fx = 96, fy = 170, fw = W - 192, fh = 860;
    const frame = svg(`<rect x="${fx - 18}" y="${fy - 18}" width="${fw + 36}" height="${fh + 36}" fill="none" stroke="${T.rule}" stroke-width="2"/>`);
    const body = wordmark(fx, 104, { fill: T.ink, size: 28 }) + eyebrow(fx, 1118, s.eyebrow, { fill: T.eyebrow }) + title(fx, 1196, s.title1, s.title2, { fill: T.ink, size: 68, maxWidth: fw }) + subtitle(fx, 1330, s.subtitle, { fill: T.soft, maxWidth: fw, size: 26 }) + closing(W - fx, 104, s.closing ? s.closing : "", { anchor: "end", fill: T.soft, size: 17 });
    return { base: await sharp(solid(T.bg)).png().toBuffer(), layers: [{ input: await coverPhoto(photo, fw, fh), left: px(fx), top: px(fy) }, { input: render(frame) }, { input: render(svg(body)) }] };
  },

  async G(photo, s) {
    const T = themeOf(s, "G");
    const r = 290, cx = W / 2, cy = 520;
    const masked = await sharp(await coverPhoto(photo, r * 2, r * 2)).composite([{ input: circleMask(r), blend: "dest-in" }]).png().toBuffer();
    const ring = svg(`<circle cx="${cx}" cy="${cy}" r="${r + 16}" fill="none" stroke="${T.rule}" stroke-width="2"/>`);
    const body = wordmark(W / 2, 112, { anchor: "middle", fill: T.ink }) + eyebrow(W / 2, 940, s.eyebrow, { anchor: "middle", fill: T.eyebrow }) + title(W / 2, 1030, s.title1, s.title2, { fill: T.ink, anchor: "middle", size: 70, maxWidth: 900 }) + subtitle(W / 2, 1180, s.subtitle, { fill: T.ink, anchor: "middle", maxWidth: 820, size: 27 }) + closing(W / 2, 1380, s.closing, { anchor: "middle", fill: T.ink });
    return { base: await sharp(solid(T.bg)).png().toBuffer(), layers: [{ input: masked, left: px(cx - r), top: px(cy - r) }, { input: render(ring) }, { input: render(svg(body)) }] };
  },

  // Tarjeta: foto a sangre y una tarjeta con el texto en la esquina inferior (izquierda o derecha).
  async H(photo, s) {
    const T = themeOf(s, "H"), flip = flipped(s);
    const cw = 740, ch = 450, cx = flip ? W - 72 - cw : 72, cy = H - 110 - ch, tx = cx + 44, tw = cw - 88;
    const card = svg(`<rect x="${cx}" y="${cy}" width="${cw}" height="${ch}" fill="${T.bg}" opacity="0.96"/><rect x="${cx + 14}" y="${cy + 14}" width="${cw - 28}" height="${ch - 28}" fill="none" stroke="${T.rule}" stroke-width="1.5" opacity="0.8"/>`);
    const body = wordmark(72, 112, { fill: C.beige }) + eyebrowFit(tx, cy + 82, s.eyebrow, tw, { size: 18, fill: T.eyebrow }) +
      title(tx, cy + 172, s.title1, s.title2, { fill: T.ink, size: 58, maxWidth: tw }) + subtitle(tx, cy + 310, s.subtitle, { fill: T.soft, size: 23, maxWidth: tw }) + closing(tx, cy + ch - 42, s.closing, { fill: T.soft, size: 15 });
    return { base: await coverPhoto(photo, W, H), layers: [{ input: render(topVeil(260, 0.5)) }, { input: render(card) }, { input: render(svg(body)) }] };
  },

  // Mitad superior: foto ancha arriba (recortada al centro) y el texto sobre el fondo del tema, alineado a la izquierda.
  async I(photo, s) {
    const T = themeOf(s, "I");
    const ph = 930;
    const rule = svg(`<rect x="72" y="${ph + 58}" width="72" height="3" fill="${T.rule}"/>`);
    const body = wordmark(72, 112, { fill: C.beige }) + eyebrow(72, ph + 122, s.eyebrow, { fill: T.eyebrow }) + title(72, ph + 214, s.title1, s.title2, { fill: T.ink, size: 70, maxWidth: 936 }) + subtitle(72, ph + 362, s.subtitle, { fill: T.soft, maxWidth: 936, size: 26 }) + closing(72, H - 44, s.closing, { fill: T.soft, size: 17 });
    return { base: await sharp(solid(T.bg)).png().toBuffer(), layers: [{ input: await coverPhoto(photo, W, ph), left: 0, top: 0 }, { input: render(topVeil(240, 0.5)) }, { input: render(rule) }, { input: render(svg(body)) }] };
  },

  // Detalle: foto rectangular y un círculo con un acercamiento de la misma foto, a caballo sobre su borde inferior.
  async J(photo, s) {
    const T = themeOf(s, "J"), flip = flipped(s);
    const x = 100, y = 150, w = 880, h = 760, r = 150;
    const cx = flip ? x + 190 : x + w - 190, cy = y + h;
    const meta = await sharp(photo).metadata();
    const side = Math.round(Math.min(meta.width, meta.height) * 0.34);
    const zoom = await sharp(photo).extract({ left: Math.round((meta.width - side) / 2), top: Math.round((meta.height - side) / 2), width: side, height: side }).resize(px(r * 2), px(r * 2)).toBuffer();
    const zoomMasked = await sharp(zoom).composite([{ input: circleMask(r), blend: "dest-in" }]).png().toBuffer();
    const disc = svg(`<circle cx="${cx}" cy="${cy}" r="${r + 10}" fill="${T.bg}"/>`);
    const ring = svg(`<circle cx="${cx}" cy="${cy}" r="${r + 18}" fill="none" stroke="${T.rule}" stroke-width="2"/>`);
    const body = wordmark(x, 104, { fill: T.ink, size: 26 }) + eyebrow(x, y + h + 200, s.eyebrow, { fill: T.eyebrow }) + title(x, y + h + 282, s.title1, s.title2, { fill: T.ink, size: 64, maxWidth: 880 }) + subtitle(x, y + h + 404, s.subtitle, { fill: T.soft, maxWidth: 880, size: 25 }) + closing(W - x, 104, s.closing, { anchor: "end", fill: T.soft, size: 16 });
    return { base: await sharp(solid(T.bg)).png().toBuffer(), layers: [{ input: await coverPhoto(photo, w, h), left: px(x), top: px(y) }, { input: render(disc) }, { input: zoomMasked, left: px(cx - r), top: px(cy - r) }, { input: render(ring) }, { input: render(svg(body)) }] };
  },

  // Arco lateral: foto en arco a un lado y columna de texto al otro.
  async K(photo, s) {
    const T = themeOf(s, "K"), flip = flipped(s);
    const aw = 520, ah = 1000, ay = 230, ax = flip ? W - 72 - aw : 72;
    const tx = flip ? 72 : ax + aw + 56, tw = W - 72 - tx - (flip ? aw + 56 : 0);
    const masked = await sharp(await coverPhoto(photo, aw, ah)).composite([{ input: archMask(aw, ah), blend: "dest-in" }]).png().toBuffer();
    const titleLines = wrap(`${s.title1} ${s.title2}`, 50, tw, { family: SERIF }, 5);
    const ty = 560;
    const subY = ty + titleLines.length * 56 + 34;
    const rule = svg(`<rect x="${tx}" y="${ty - 150}" width="56" height="3" fill="${T.rule}"/>`);
    const body = wordmark(72, 112, { fill: T.ink, size: 28 }) + eyebrowFit(tx, ty - 100, s.eyebrow, tw, { size: 17, fill: T.eyebrow }) +
      titleLines.map((l, i) => t(tx, ty + i * 56, l, { size: 50, family: SERIF, weight: 500, fill: T.ink })).join("") +
      (s.subtitle ? wrap(s.subtitle, 23, tw, { family: SANS }, 6).map((l, i) => t(tx, subY + i * 33, l, { size: 23, fill: T.soft })).join("") : "") +
      closing(W / 2, H - 52, s.closing, { anchor: "middle", fill: T.soft, size: 17 });
    return { base: await sharp(solid(T.bg)).png().toBuffer(), layers: [{ input: masked, left: px(ax), top: px(ay) }, { input: render(rule) }, { input: render(svg(body)) }] };
  },

  // Cifra: dato grande sobre el fondo del tema y la escena en una franja ancha abajo (el dato sin convertir la foto en una textura plana).
  async L(photo, s) {
    const T = themeOf(s, "L");
    const px0 = 72, py = 790, pw = W - 144, ph = 560;
    const big = s.big ?? "";
    const bigSize = fitSize(big, 210, 900, { family: SERIF }, 80);
    const frame = svg(`<rect x="${px0 - 14}" y="${py - 14}" width="${pw + 28}" height="${ph + 28}" fill="none" stroke="${T.rule}" stroke-width="2"/>`);
    const body = wordmark(W / 2, 100, { anchor: "middle", fill: T.ink, size: 28 }) + eyebrow(W / 2, 152, s.eyebrow, { anchor: "middle", fill: T.eyebrow }) +
      t(W / 2, 372, big, { size: bigSize, family: SERIF, weight: 500, fill: T.ink, anchor: "middle" }) +
      (s.bigLabel ? t(W / 2, 372 + bigSize * 0.12 + 44, s.bigLabel.toUpperCase(), { size: 22, weight: 600, fill: T.eyebrow, anchor: "middle", spacing: 5 }) : "") +
      title(W / 2, 590, s.title1, s.title2, { fill: T.ink, anchor: "middle", size: 54, maxWidth: 900 }) +
      subtitle(W / 2, 712, s.subtitle, { fill: T.soft, anchor: "middle", maxWidth: 860, size: 25 }) + closing(W / 2, H - 38, s.closing, { anchor: "middle", fill: T.soft, size: 16 });
    return { base: await sharp(solid(T.bg)).png().toBuffer(), layers: [{ input: await coverPhoto(photo, pw, ph), left: px(px0), top: px(py) }, { input: render(frame) }, { input: render(svg(body)) }] };
  },
};

/** Compone una pieza: foto (Buffer) + layout (A–L) + textos → JPEG 1440×1920. */
export async function composeSlide(photo, layout, slide) {
  const fn = LAYOUT_FNS[layout];
  if (!fn) throw new Error(`Layout desconocido: ${layout}`);
  const { base, layers } = await fn(photo, slide);
  return sharp(base).composite(layers).jpeg({ quality: 92, mozjpeg: true, chromaSubsampling: "4:4:4" }).toBuffer();
}
