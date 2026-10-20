import sharp from "sharp";
import { PHOTO_BRIEF } from "./compose.mjs";
import { cfg, log, logError } from "./config.mjs";
import { generateImage, generateJson } from "./gemini.mjs";
import { saveRejected } from "./image.mjs";

// Bloque REALISM RULES del prompt maestro del cliente: va en TODOS los prompts de imagen.
const REALISM_RULES =
  "REALISM RULES: The stone reads as one monolithic surface, never tiles or multiple slabs, no visible lines, seams, joints or divisions. " +
  "Flat, rigid, perfectly installed stone with no visible stone edges, no cut edges and no thickness visible anywhere. " +
  "No bending, folding, peeling, rolling, paper-like or floating stone. Doors and cabinet fronts are closed. No people, no hands.";

const NO_TEXT = "ABSOLUTELY NO text, letters, numbers, logos, watermarks, captions, labels or signage anywhere in the image. The photograph is full-bleed: it fills the entire frame edge to edge with NO white or cream borders, margins, bars, letterboxing or frames.";
const STYLE = "Photorealistic luxury architectural photograph for a high-end natural stone brand, vertical 3:4, quiet luxury, editorial minimalist style, generous negative space, Architectural Digest style, true-to-life materials, reflections and physics.";
const PALETTE = "Palette: beige, sand, travertine, cream, warm oak and brushed brass accents.";

export function buildPhotoPrompt(slide, kb) {
  const mat = kb.materialByName.get(slide.scene.stone_material);
  const brief = slide.macroFallback ? PHOTO_BRIEF.C : PHOTO_BRIEF[slide.layout];
  if (slide.layout === "C" || slide.layout === "G" || slide.macroFallback) {
    return [
      `${STYLE}`,
      `SUBJECT: extreme close-up of ${mat.nombre} natural ${mat.tipo === "travertino" ? "travertine" : "marble"}: ${mat.look}. One continuous surface filling the entire frame. Only the stone itself: no room, no furniture, no fixtures, no objects, no surroundings.`,
      `COMPOSITION: ${brief}`,
      REALISM_RULES, NO_TEXT, PALETTE,
    ].join("\n\n");
  }
  const s = slide.scene;
  // Último intento antes del primer plano: misma idea, composición más sencilla (un solo mueble, plano frontal) para que sea más fácil de lograr sin juntas.
  const camera = slide.simplified ? "straight-on medium shot at eye level, simple uncluttered composition with one main piece of furniture" : s.camera;
  return [
    `${STYLE}`,
    `COMPOSITION: ${brief} Camera: ${camera}.`,
    `SCENE: ${s.space}. ${s.furniture_and_materials}. Light: ${s.light}. The ${s.stone_application} is ONE single giant continuous panel of ${mat.nombre} (${mat.look}), floor to ceiling and side to side, veining uninterrupted: absolutely no joints, seams or divisions. Every other surface (floor, ceiling, remaining walls) is NOT stone: use warm oak wood and smooth plaster, so no stone joints or tile grids appear anywhere in the frame.`,
    REALISM_RULES, NO_TEXT, PALETTE,
  ].join("\n\n");
}

const QA_SYSTEM = "Eres un inspector de calidad de fotografía de arquitectura para una marca de piedra natural de lujo. Rechazas solo fallas que un espectador notaría claramente al ver la publicación en el feed: los detalles menores de herrajes, texturas o sombras NO son motivo de rechazo.";

function qaPrompt(layout) {
  return `Inspecciona esta imagen (será la base de una publicación de Instagram). Rechaza (ok=false) si ocurre CUALQUIERA de estas fallas:
1. Hay texto, letras, números, logotipos o marcas de agua visibles.
2. Las superficies de piedra muestran juntas, líneas de unión, baldosas, retículas o varias placas (las vetas naturales NO son juntas, ni las rendijas finas entre puertas o cajones cerrados de un mueble, ni el encuentro pared-suelo; sí lo son las líneas rectas que dividen una superficie continua de piedra).
3. La piedra se ve gruesa: cantos de placa visibles, puertas o frentes abiertos mostrando espesor, bordes con grosor.
4. La piedra aparece doblada, plegada, enrollada, levantada como papel o flotando.
5. Hay personas, manos o figuras deformes.
8. La foto NO ocupa todo el cuadro: tiene márgenes, franjas o bordes blancos/crema/oscuros a los lados, arriba o abajo (letterboxing) o está enmarcada.
6. Objetos claramente deformes o físicamente imposibles (muebles fusionados, geometría rota, perspectiva imposible, reflejos incoherentes). Detalles menores NO cuentan.
${layout === "C" || layout === "G" ? "7. NO es una textura pura de piedra a cuadro completo (se ve una habitación, mueble, grifo, objeto, borde o fondo).\n" : ""}${layout === "E" ? "7. La franja superior (30 % de la altura) NO es una zona clara, despejada y lisa donde pueda ponerse texto oscuro.\n" : ""}${layout === "A" ? "7. El tercio inferior tiene detalles importantes o muy cargados (se cubrirá con un degradado oscuro y texto).\n" : ""}Responde SOLO JSON: {"ok": true|false, "issues": ["falla concreta y cómo corregirla en el prompt, en inglés"]}`;
}

export async function inspectPhoto(buffer, layout) {
  try {
    const v = await generateJson({ system: QA_SYSTEM, prompt: qaPrompt(layout), temperature: 0, images: [buffer] });
    return { ok: v.ok === true, issues: Array.isArray(v.issues) ? v.issues.map(String) : [] };
  } catch (e) {
    logError(`Inspección de imagen no disponible (${e.message}); se acepta con advertencia.`);
    return { ok: true, issues: [], skipped: true };
  }
}

export class BudgetError extends Error {}

/**
 * Red de seguridad contra el letterbox: si la IA entrega la foto con franjas laterales perfectamente uniformes
 * (desviación ≈ 0 en toda la altura), se recortan. Una pared real siempre tiene ruido > 1,2, así que no se toca contenido.
 */
export async function trimSideBars(buffer, { maxFraction = 0.15, maxStd = 1.2 } = {}) {
  const { data, info } = await sharp(buffer).greyscale().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  const colStd = (x) => {
    let sum = 0, sq = 0;
    for (let y = 0; y < h; y++) { const v = data[y * w + x]; sum += v; sq += v * v; }
    const mean = sum / h;
    return Math.sqrt(Math.max(0, sq / h - mean * mean));
  };
  const limit = Math.floor(w * maxFraction);
  let left = 0, right = 0;
  while (left < limit && colStd(left) < maxStd) left++;
  while (right < limit && colStd(w - 1 - right) < maxStd) right++;
  if (left < 8 && right < 8) return { buffer, trimmed: false };
  const pad = 4; // pequeño margen extra para quitar el borde suavizado
  const x0 = left ? left + pad : 0, x1 = w - (right ? right + pad : 0);
  const out = await sharp(buffer).extract({ left: x0, top: 0, width: x1 - x0, height: h }).jpeg({ quality: 95 }).toBuffer();
  return { buffer: out, trimmed: true, removed: { left: x0, right: w - x1 } };
}

/**
 * Genera la foto de una pieza y la inspecciona; si falla, regenera con correcciones concretas (como pide el prompt
 * maestro: «correcciones puntuales en lugar de regenerar a ciegas»). `budget` = { used, max } compartido por el post.
 */
export async function generateCheckedPhoto({ slide, kb, refs = [], budget, index = 0, date = "x", maxAttempts = cfg.maxGenerationsPerSlide }) {
  let base = buildPhotoPrompt(slide, kb);
  // La referencia solo aporta material y lenguaje de diseño; sin esto el modelo copia la escena de la primera pieza.
  if (refs.length) base += "\n\nREFERENCE IMAGE: use it ONLY for the stone material, color palette and design language. Show a completely DIFFERENT space, different furniture, a different camera angle and a different composition. Do NOT repeat or copy the reference scene.";
  let extra = "";
  let lastIssues = [];
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (budget.used >= budget.max) throw new BudgetError(`Tope diario de imágenes alcanzado (${budget.max}).`);
    budget.used++;
    const g = await generateImage(base + extra, refs);
    const t = await trimSideBars(g.buffer);
    if (t.trimmed) { log(`Se recortaron franjas laterales de la foto (${t.removed.left}px izq., ${t.removed.right}px der.).`); g.buffer = t.buffer; }
    const qa = await inspectPhoto(g.buffer, slide.layout);
    if (qa.ok) {
      if (attempt > 1) log(`Foto aprobada tras ${attempt} intentos.`);
      return { buffer: g.buffer, model: g.model, attempts: attempt, qaSkipped: Boolean(qa.skipped) };
    }
    lastIssues = qa.issues;
    try { saveRejected(date, index + 1, g.buffer); } catch { /* diagnóstico opcional */ }
    log(`Foto rechazada por el inspector (intento ${attempt}):`, qa.issues);
    extra = `\n\nFIX THESE PROBLEMS FROM THE PREVIOUS ATTEMPT, keeping everything else: ${qa.issues.join("; ")}`;
  }
  throw new Error(`La foto de la pieza ${slide.layout} no pasó el control de calidad tras ${maxAttempts} intentos: ${lastIssues.join("; ")}`);
}
