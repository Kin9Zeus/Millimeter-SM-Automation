// Validación DETERMINISTA del contenido generado por Gemini. Es la barrera que sostiene la política
// «la IA nunca inventa datos técnicos»: todo número, correo y URL del caption debe existir en la base oficial.

const FORBIDDEN = [
  /\bprecios?\b/i, /\bdescuentos?\b/i, /\bofertas?\b/i, /\bpromoci[oó]n/i, /\bgarant[ií]/i, /\bcertific/i,
  /\bASTM\b/i, /\bISO\s?\d/i, /\bignífug/i, /\bresistente a\b/i, /\bimpermeab/i, /\bantibacteri/i, /\bantimancha/i,
  /\bgratis\b/i, /\bcotiza(?:ci[oó]n)? (?:gratis|sin costo)/i, /[$€£]/, /\bUSD\b/i, /\bCOP\b/i,
  /\btestimonio/i, /\bnuestros clientes dicen/i,
];

const numbersIn = (s) => (String(s).match(/\d+(?:[.,]\d+)?/g) ?? []).map((n) => n.replace(",", "."));

export function normalize(s) {
  return String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function jaccard(a, b) {
  const A = new Set(normalize(a).split(" ").filter((w) => w.length > 3));
  const B = new Set(normalize(b).split(" ").filter((w) => w.length > 3));
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const w of A) if (B.has(w)) inter++;
  return inter / (A.size + B.size - inter);
}

export const BASE_HASHTAG = "#millimeterbycasanova";

/** Devuelve { ok, problems[] }. `content` = JSON de Gemini; `recent` = posts publicados recientes. */
export function validateContent(content, kb, { recent = [], imageKinds = ["textura", "concepto", "atmosfera"] } = {}) {
  const problems = [];
  const c = content ?? {};

  if (!c.caption || typeof c.caption !== "string") problems.push("Falta el caption.");
  if (!Array.isArray(c.fact_ids) || c.fact_ids.length === 0) problems.push("fact_ids vacío: cada post debe citar los hechos oficiales en los que se apoya.");
  else for (const id of c.fact_ids) if (!kb.byId.has(id)) problems.push(`fact_id inexistente: «${id}».`);
  if (!c.topic || typeof c.topic !== "string") problems.push("Falta topic (etiqueta corta del tema).");
  if (!c.image_prompt || typeof c.image_prompt !== "string" || c.image_prompt.length < 40) problems.push("image_prompt ausente o demasiado corto.");
  if (!imageKinds.includes(c.image_kind)) problems.push(`image_kind debe ser uno de: ${imageKinds.join(", ")}.`);
  if (!c.alt_text || String(c.alt_text).length < 20) problems.push("Falta alt_text descriptivo.");
  if (problems.length) return { ok: false, problems };

  const caption = c.caption.trim();
  const firstLine = caption.split("\n")[0];
  if (firstLine.length > 125) problems.push(`El gancho (primera línea) tiene ${firstLine.length} caracteres; máximo 125.`);
  if (caption.length > 1800) problems.push("Caption demasiado largo (máx. 1800 caracteres).");
  if (caption.length < 120) problems.push("Caption demasiado corto (mín. 120 caracteres).");
  if (/#/.test(caption)) problems.push("No pongas hashtags dentro del caption; van en el campo hashtags.");
  if ((caption.match(/[\p{Extended_Pictographic}]/gu) ?? []).length > 2) problems.push("Máximo 2 emojis en el caption.");
  if (/!{2,}/.test(caption)) problems.push("Sin exclamaciones repetidas.");

  for (const re of FORBIDDEN) if (re.test(caption)) problems.push(`Término/afirmación no permitido (${re}). Ver lista «no_afirmar».`);

  // Todo número del caption debe existir en la base oficial.
  const allowed = new Set(numbersIn(kb.corpus));
  for (const n of numbersIn(caption)) if (!allowed.has(n)) problems.push(`El número «${n}» no figura en la base oficial.`);

  // Correos y URLs: solo los oficiales.
  for (const m of caption.match(/[\w.+-]+@[\w-]+\.[\w.-]+/g) ?? []) if (!kb.corpus.includes(m)) problems.push(`Correo no oficial: ${m}`);
  for (const m of caption.match(/(?:https?:\/\/|www\.)[^\s)]+/gi) ?? []) {
    const bare = m.replace(/^https?:\/\//i, "").replace(/[.,;]+$/, "");
    if (!kb.corpus.toLowerCase().includes(bare.toLowerCase())) problems.push(`URL no oficial: ${m}`);
  }

  // Hashtags
  if (!Array.isArray(c.hashtags)) problems.push("hashtags debe ser una lista.");
  else {
    const tags = c.hashtags.map((h) => String(h).trim()).filter(Boolean);
    if (tags.some((h) => !/^#[\p{L}\p{N}_]+$/u.test(h))) problems.push("Hashtags inválidos (solo letras/números tras #).");
    if (tags.length < 2 || tags.length > 5) problems.push("Entre 2 y 5 hashtags (el base #millimeterbycasanova se añade solo).");
  }

  // Repetición
  if (recent.some((p) => normalize(p.topic) === normalize(c.topic))) problems.push(`El tema «${c.topic}» ya se publicó recientemente.`);
  for (const p of recent) if (p.caption && jaccard(p.caption, caption) > 0.5) { problems.push("El caption se parece demasiado a una publicación reciente."); break; }

  return { ok: problems.length === 0, problems };
}

export function buildFinalCaption(content) {
  const tags = [...new Set([BASE_HASHTAG, ...content.hashtags.map((h) => h.toLowerCase().startsWith("#millimeter") ? h.toLowerCase() : h)])].slice(0, 6);
  return `${content.caption.trim()}\n\n${tags.join(" ")}`;
}
