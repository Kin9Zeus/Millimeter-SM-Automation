import { PHOTO_BRIEF } from "./compose.mjs";
import { cfg, log, logError } from "./config.mjs";
import { generateImage, generateJson } from "./gemini.mjs";
import { saveRejected } from "./image.mjs";

// Bloque REALISM RULES del prompt maestro del cliente: va en TODOS los prompts de imagen.
const REALISM_RULES =
  "REALISM RULES: The stone reads as one monolithic surface, never tiles or multiple slabs, no visible lines, seams, joints or divisions. " +
  "Flat, rigid, perfectly installed stone with no visible stone edges, no cut edges and no thickness visible anywhere. " +
  "No bending, folding, peeling, rolling, paper-like or floating stone. Doors and cabinet fronts are closed. No people, no hands.";

const NO_TEXT = "ABSOLUTELY NO text, letters, numbers, logos, watermarks, captions, labels or signage anywhere in the image.";
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
  return [
    `${STYLE}`,
    `COMPOSITION: ${brief} Camera: ${s.camera}.`,
    `SCENE: ${s.space}. ${s.furniture_and_materials}. Light: ${s.light}. The ${s.stone_application} is ONE single giant continuous panel of ${mat.nombre} (${mat.look}), floor to ceiling and side to side, veining uninterrupted: absolutely no joints, seams or divisions.`,
    REALISM_RULES, NO_TEXT, PALETTE,
  ].join("\n\n");
}

const QA_SYSTEM = "Eres un inspector de calidad de fotografía de arquitectura para una marca de piedra natural de lujo. Rechazas solo fallas que un espectador notaría claramente al ver la publicación en el feed: los detalles menores de herrajes, texturas o sombras NO son motivo de rechazo.";

function qaPrompt(layout) {
  return `Inspecciona esta imagen (será la base de una publicación de Instagram). Rechaza (ok=false) si ocurre CUALQUIERA de estas fallas:
1. Hay texto, letras, números, logotipos o marcas de agua visibles.
2. Las superficies de piedra muestran juntas, líneas de unión, baldosas, retículas o varias placas (las vetas naturales NO son juntas; sí lo son las líneas rectas que dividen la superficie).
3. La piedra se ve gruesa: cantos de placa visibles, puertas o frentes abiertos mostrando espesor, bordes con grosor.
4. La piedra aparece doblada, plegada, enrollada, levantada como papel o flotando.
5. Hay personas, manos o figuras deformes.
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
 * Genera la foto de una pieza y la inspecciona; si falla, regenera con correcciones concretas (como pide el prompt
 * maestro: «correcciones puntuales en lugar de regenerar a ciegas»). `budget` = { used, max } compartido por el post.
 */
export async function generateCheckedPhoto({ slide, kb, refs = [], budget, index = 0, date = "x" }) {
  const base = buildPhotoPrompt(slide, kb);
  let extra = "";
  let lastIssues = [];
  for (let attempt = 1; attempt <= cfg.maxGenerationsPerSlide; attempt++) {
    if (budget.used >= budget.max) throw new BudgetError(`Tope diario de imágenes alcanzado (${budget.max}).`);
    budget.used++;
    const g = await generateImage(base + extra, refs);
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
  throw new Error(`La foto de la pieza ${slide.layout} no pasó el control de calidad tras ${cfg.maxGenerationsPerSlide} intentos: ${lastIssues.join("; ")}`);
}
