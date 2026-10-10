import { GoogleGenAI } from "@google/genai";
import { cfg, log } from "./config.mjs";

let client;
const getClient = () => (client ??= new GoogleGenAI({ apiKey: cfg.gemini.apiKey }));

let workingTextModel = cfg.gemini.textModel || null;

const isModelMissing = (err) => err?.status === 404 || /not found|NOT_FOUND|is not supported|no longer available/i.test(String(err?.message ?? err));

/** Texto → JSON. Prueba los modelos candidatos hasta que la API acepte uno y recuerda el que funcionó. */
export async function generateJson({ system, prompt, temperature = 0.9 }) {
  const candidates = workingTextModel ? [workingTextModel] : cfg.gemini.textModelCandidates;
  let lastErr;
  for (const model of candidates) {
    try {
      const res = await getClient().models.generateContent({
        model,
        contents: prompt,
        config: { systemInstruction: system, responseMimeType: "application/json", temperature },
      });
      if (workingTextModel !== model) log(`Modelo de texto en uso: ${model}`);
      workingTextModel = model;
      return parseJson(res.text);
    } catch (err) {
      lastErr = err;
      if (!isModelMissing(err)) throw err;
    }
  }
  throw new Error(`Ningún modelo de texto disponible (${candidates.join(", ")}). Define GEMINI_TEXT_MODEL. Último error: ${lastErr?.message}`);
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

/** Imagen con Nano Banana Pro (la API solo entrega image/jpeg; misma API «interactions» que usa scripts/gemini-image.mjs del estudio). */
export async function generateImage(prompt) {
  const { imageModel, imageAspect, imageSize } = cfg.gemini;
  const interaction = await getClient().interactions.create({
    model: imageModel,
    input: prompt,
    response_format: { type: "image", mime_type: "image/jpeg", aspect_ratio: imageAspect, image_size: imageSize },
  });
  const data = interaction.output_image?.data;
  if (!data) throw new Error(`Gemini no devolvió imagen: ${JSON.stringify(interaction).slice(0, 400)}`);
  return { buffer: Buffer.from(data, "base64"), model: imageModel, interactionId: interaction.id };
}
