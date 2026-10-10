import { dayNumber, log } from "./config.mjs";
import { generateJson } from "./gemini.mjs";
import { IMAGE_KINDS, PILLARS, loadKnowledge } from "./knowledge.mjs";
import { recentPosts } from "./state.mjs";
import { buildFinalCaption, validateContent } from "./validate.mjs";

const MAX_ROUNDS = 4;

export const pillarFor = (dateStr) => PILLARS[dayNumber(dateStr) % PILLARS.length];

const SYSTEM = (kb) => `Eres el community manager de MILLIMETER by Casanova (@casanova_southamerica), una marca de piedra natural ultrafina (1–5 mm).
Escribes en español latinoamericano, tratando de «tú».

REGLAS INQUEBRANTABLES
1. Solo puedes afirmar lo que está en la BASE OFICIAL. No inventes cifras, materiales, proyectos, clientes, acabados, certificaciones ni plazos. Si necesitas un dato que no está, no lo uses.
2. Cita en "fact_ids" TODOS los hechos en los que te apoyas. Cada número del caption debe aparecer literalmente en esos hechos.
3. Nunca menciones precios, descuentos, garantías, certificaciones, resistencia, instalación paso a paso ni formatos concretos.
4. No hables de los proyectos como si la imagen los mostrara: la imagen es generada con IA y es conceptual.
5. Un solo CTA al final, sobrio (p. ej. invitar a contar el proyecto al correo oficial).

NO AFIRMAR (lista del cliente):
${kb.noAfirmar.map((x) => `- ${x}`).join("\n")}

VOZ Y FORMATO
${kb.voice}`;

function userPrompt({ kb, pillar, date, recent, feedback }) {
  const facts = kb.facts.filter((f) => pillar.categories.includes(f.category));
  const others = kb.facts.filter((f) => !pillar.categories.includes(f.category));
  return `FECHA: ${date}
PILAR DE HOY: ${pillar.title}

BASE OFICIAL — hechos del pilar de hoy (úsalos de preferencia):
${facts.map((f) => `[${f.id}] ${f.text}`).join("\n")}

BASE OFICIAL — resto de hechos (solo si hace falta contexto):
${others.map((f) => `[${f.id}] ${f.text}`).join("\n")}

YA PUBLICADO RECIENTEMENTE (no repitas tema ni ángulo):
${recent.length ? recent.map((p) => `- (${p.date}) ${p.topic}`).join("\n") : "- (nada todavía)"}

TIPOS DE IMAGEN PERMITIDOS PARA HOY (elige uno de: ${pillar.imageKinds.join(", ")}):
${pillar.imageKinds.map((k) => `- ${k}: ${IMAGE_KINDS[k]}`).join("\n")}

${feedback ? `CORRECCIONES OBLIGATORIAS de tu intento anterior:\n${feedback}\n` : ""}
Devuelve SOLO un JSON con esta forma exacta:
{
  "topic": "etiqueta corta y específica del tema de hoy (3–8 palabras)",
  "fact_ids": ["ids de los hechos usados"],
  "caption": "texto del post: gancho ≤125 caracteres en la 1.ª línea, luego 2–4 párrafos cortos y un CTA. Sin hashtags.",
  "hashtags": ["#piedranatural", "#interiorismo"],
  "image_kind": "textura | concepto | atmosfera",
  "image_prompt": "prompt EN INGLÉS, 2–4 frases, describe composición, luz, materiales y mood del tipo de imagen elegido. Sin texto en la imagen, sin personas, sin logotipos.",
  "alt_text": "descripción accesible de la imagen en español, 1–2 frases"
}`;
}

/** Segunda opinión independiente: otro llamado a Gemini que audita el borrador contra la base oficial. */
async function critique(content, kb) {
  const verdict = await generateJson({
    temperature: 0,
    system: "Eres un auditor editorial estricto. Verificas que un post de Instagram no contenga NINGUNA afirmación ajena a la base oficial.",
    prompt: `BASE OFICIAL:\n${kb.facts.map((f) => `[${f.id}] ${f.text}`).join("\n")}\n\nNO AFIRMAR:\n${kb.noAfirmar.map((x) => `- ${x}`).join("\n")}\n\nBORRADOR DEL POST:\n"""${content.caption}"""\n\nPROMPT DE IMAGEN:\n"""${content.image_prompt}"""\n\nRevisa: (a) ¿toda afirmación factual del caption está respaldada por la base oficial, sin exagerar ni extrapolar (p. ej. generalizar a todos los materiales o aplicar un dato a otro espesor)? (b) ¿insinúa que la imagen es un proyecto real, o promete algo de la lista NO AFIRMAR? (c) ¿el prompt de imagen pide texto, logotipos, personas o un proyecto/espacio concreto reconocible?\nResponde SOLO JSON: {"approved": true|false, "issues": ["problema concreto y cómo corregirlo"]}`,
  });
  return { approved: verdict.approved === true, issues: Array.isArray(verdict.issues) ? verdict.issues : [] };
}

/** Genera el contenido del día. Lanza error si ninguna de las rondas pasa validación + auditoría (mejor no publicar que publicar mal). */
export async function createDailyContent(date) {
  const kb = loadKnowledge();
  const pillar = pillarFor(date);
  const recent = recentPosts(20);
  let feedback = "";

  for (let round = 1; round <= MAX_ROUNDS; round++) {
    const draft = await generateJson({ system: SYSTEM(kb), prompt: userPrompt({ kb, pillar, date, recent, feedback }) });
    const check = validateContent(draft, kb, { recent, imageKinds: pillar.imageKinds });
    if (!check.ok) {
      feedback = check.problems.map((p) => `- ${p}`).join("\n");
      log(`Contenido ronda ${round}: rechazado por validación →`, check.problems);
      continue;
    }
    const audit = await critique(draft, kb);
    if (!audit.approved) {
      feedback = audit.issues.map((p) => `- ${p}`).join("\n");
      log(`Contenido ronda ${round}: rechazado por el auditor →`, audit.issues);
      continue;
    }
    log(`Contenido aprobado en la ronda ${round}: «${draft.topic}»`);
    return {
      pillar: pillar.id,
      topic: draft.topic.trim(),
      factIds: draft.fact_ids,
      imageKind: draft.image_kind,
      imagePrompt: draft.image_prompt.trim(),
      altText: draft.alt_text.trim(),
      caption: buildFinalCaption(draft),
    };
  }
  throw new Error(`No se logró contenido válido tras ${MAX_ROUNDS} rondas. Último feedback:\n${feedback}`);
}
