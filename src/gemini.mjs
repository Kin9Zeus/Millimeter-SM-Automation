import { GoogleGenAI } from "@google/genai";
import { cfg, log } from "./config.mjs";
import { recordUsage } from "./spend.mjs";

let client;
const getClient = () => (client ??= new GoogleGenAI({ apiKey: cfg.gemini.apiKey }));

let workingTextModel = cfg.gemini.textModel || null;

const isModelMissing = (err) => err?.status === 404 || /not found|NOT_FOUND|is not supported|no longer available/i.test(String(err?.message ?? err));

async function withTextModel(fn) {
  // El modelo configurado/probado va primero; si deja de existir, se cae a los candidatos en vez de romper el pipeline.
  const candidates = [...new Set([workingTextModel, ...cfg.gemini.textModelCandidates].filter(Boolean))];
  let lastErr;
  for (const model of candidates) {
    try {
      const res = await fn(model);
      if (workingTextModel !== model) log(`Modelo de texto en uso: ${model}`);
      workingTextModel = model;
      return res;
    } catch (err) {
      lastErr = err;
      if (!isModelMissing(err)) throw err;
      if (model === workingTextModel) workingTextModel = null;
    }
  }
  throw new Error(`Ningún modelo de texto disponible (${candidates.join(", ")}). Define GEMINI_TEXT_MODEL. Último error: ${lastErr?.message}`);
}

/** Texto (y opcionalmente imágenes JPEG para inspección) → JSON. */
export async function generateJson({ system, prompt, temperature = 0.9, images = [] }) {
  const parts = [{ text: prompt }, ...images.map((b) => ({ inlineData: { mimeType: "image/jpeg", data: b.toString("base64") } }))];
  return withTextModel(async (model) => {
    const res = await getClient().models.generateContent({
      model,
      contents: [{ role: "user", parts }],
      config: { systemInstruction: system, responseMimeType: "application/json", temperature },
    });
    recordUsage(images.length ? "inspect" : "text");
    return parseJson(res.text);
  });
}

/** Comprobación gratuita (sin generar nada): ¿la clave funciona y existen los modelos? Para /salud. */
export async function pingGemini() {
  const text = await withTextModel((model) => getClient().models.get({ model }).then(() => model));
  const image = await getClient().models.get({ model: cfg.gemini.imageModel }).then(() => cfg.gemini.imageModel, (e) => { throw new Error(`modelo de imagen ${cfg.gemini.imageModel}: ${e.message}`); });
  return { text, image };
}

export function parseJson(text) {
  const cleaned = String(text ?? "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    return JSON.parse(cleaned);
  } catch {
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (m) return JSON.parse(m[0]);
    throw new Error(`Gemini no devolvió JSON válido: ${cleaned.slice(0, 200)}`);
  }
}

/** Imagen con Nano Banana Pro (la API solo entrega image/jpeg). `refs` = Buffers JPEG de referencia (continuidad de carrusel). */
export async function generateImage(prompt, refs = []) {
  const { imageModel, imageAspect, imageSize } = cfg.gemini;
  const input = refs.length
    ? [{ type: "text", text: prompt }, ...refs.map((b) => ({ type: "image", mime_type: "image/jpeg", data: b.toString("base64") }))]
    : prompt;
  const interaction = await getClient().interactions.create({
    model: imageModel,
    input,
    response_format: { type: "image", mime_type: "image/jpeg", aspect_ratio: imageAspect, image_size: imageSize },
  });
  const data = interaction.output_image?.data;
  if (!data) throw new Error(`Gemini no devolvió imagen: ${JSON.stringify(interaction).slice(0, 400)}`);
  return { buffer: Buffer.from(data, "base64"), model: imageModel, interactionId: interaction.id };
}
