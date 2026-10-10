// Validación DETERMINISTA del plan generado por Gemini. Sostiene la política «la IA nunca inventa datos técnicos»:
// todo número, correo y URL de los textos (caption y piezas) debe existir en la base oficial.

const FORBIDDEN = [
  /\bprecios?\b/i, /\bdescuentos?\b/i, /\bofertas?\b/i, /\bpromoci[oó]n/i, /\bgarant[ií]/i, /\bcertific/i,
  /\bASTM\b/i, /\bISO\s?\d/i, /\bignífug/i, /\bresistente a\b/i, /\bimpermeab/i, /\bantibacteri/i, /\bantimancha/i,
  /\bgratis\b/i, /[$€£]/, /\bUSD\b/i, /\bCOP\b/i, /\btestimonio/i, /\bnuestros clientes dicen/i,
  /(?<!casi |pocas )\bsin juntas\b/i, /\bsin costuras?\b/i, /\bcero juntas\b/i, // «sin juntas» nunca como promesa absoluta
];

const numbersIn = (s) => (String(s).match(/\d+(?:[.,]\d+)?/g) ?? []).map((n) => n.replace(",", "."));

export function normalize(s) {
  return String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

export function jaccard(a, b) {
  const A = new Set(normalize(a).split(" ").filter((w) => w.length > 3));
  const B = new Set(normalize(b).split(" ").filter((w) => w.length > 3));
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const w of A) if (B.has(w)) inter++;
  return inter / (A.size + B.size - inter);
}

export const FIXED = {
  tagline: "Misma piedra. Sin el espesor.",
  contact: "Escríbenos por DM, por WhatsApp o en millimetersouthamerica.com. Revisamos el detalle constructivo contigo, con respuesta en menos de 24 h hábiles.",
  countries: "Proyectos en 🇨🇴🇦🇷🇵🇪🇧🇷",
  silica: "Cifras de MILLIMETER Global LLC.",
  baseTags: ["#MILLIMETER", "#PiedraNatural"],
};

const slideTexts = (s) => [s.eyebrow, s.title1, s.title2, s.subtitle, s.big, s.bigLabel].filter(Boolean);

/** plan = JSON de Gemini. ctx = { kb, roles, layouts, topic, recent, materials }. Devuelve { ok, problems[] }. */
export function validatePlan(plan, ctx) {
  const { kb, roles, layouts, recent = [] } = ctx;
  const p = [];
  const c = plan?.caption ?? {};

  if (!Array.isArray(plan?.fact_ids) || !plan.fact_ids.length) p.push("fact_ids vacío: cita los hechos oficiales en los que te apoyas.");
  else for (const id of plan.fact_ids) if (!kb.byId.has(id)) p.push(`fact_id inexistente: «${id}».`);
  if (!plan?.angle || plan.angle.length < 10) p.push("Falta angle (frase corta con el ángulo del post).");

  for (const k of ["problem", "solution", "cta_question"]) if (!c[k] || typeof c[k] !== "string") p.push(`Falta caption.${k}.`);
  if (!Array.isArray(c.bullets) || c.bullets.length !== 4) p.push("caption.bullets debe tener exactamente 4 viñetas.");
  else for (const b of c.bullets) if (String(b).length < 8 || String(b).length > 90) p.push(`Viñeta fuera de 8–90 caracteres: «${b}».`);
  if (!Array.isArray(c.hashtags) || c.hashtags.length !== 3) p.push("caption.hashtags debe tener exactamente 3 hashtags específicos.");
  else if (c.hashtags.some((h) => !/^#[\p{L}\p{N}_]+$/u.test(String(h).trim()))) p.push("Hashtags inválidos (# + letras/números).");

  if (!Array.isArray(plan?.slides) || plan.slides.length !== roles.length) {
    p.push(`slides debe tener exactamente ${roles.length} elementos (en el orden de los roles dados).`);
    return { ok: false, problems: p };
  }

  plan.slides.forEach((s, i) => {
    const tag = `Pieza ${i + 1} (${roles[i]}, layout ${layouts[i]})`;
    if (!s.title1 || !s.title2) p.push(`${tag}: el titular necesita title1 y title2.`);
    if (!s.eyebrow || s.eyebrow.length > 30) p.push(`${tag}: eyebrow obligatorio y ≤ 30 caracteres.`);
    if (s.title1 && s.title1.length > 24) p.push(`${tag}: title1 > 24 caracteres.`);
    if (s.title2 && s.title2.length > 24) p.push(`${tag}: title2 > 24 caracteres.`);
    if (!s.subtitle || s.subtitle.length > 80) p.push(`${tag}: subtitle obligatorio y ≤ 80 caracteres.`);
    if (layouts[i] === "C" && (!s.big || s.big.length > 14 || !s.bigLabel || s.bigLabel.length > 28)) p.push(`${tag}: el layout C necesita big (≤14) y bigLabel (≤28).`);
    if (s.alt_text == null || String(s.alt_text).length < 20) p.push(`${tag}: falta alt_text descriptivo.`);
    const sc = s.scene ?? {};
    if (!kb.materialByName.has(sc.stone_material)) p.push(`${tag}: scene.stone_material debe ser uno de: ${kb.materials.map((m) => m.nombre).join(", ")}.`);
    if (layouts[i] !== "C" && layouts[i] !== "G") for (const k of ["space", "furniture_and_materials", "light", "camera", "stone_application"]) if (!sc[k] || String(sc[k]).length < 4) p.push(`${tag}: falta scene.${k}.`);
    if (/\b(personas?|people|man|woman|mujer|hombre|ni[ñn]os?)\b/i.test(JSON.stringify(sc))) p.push(`${tag}: la escena no debe incluir personas.`);
    if (/\b(open door|open doors|puerta abierta|edge of the slab|slab edge|thick|cantos?)\b/i.test(JSON.stringify(sc))) p.push(`${tag}: la escena no puede mostrar cantos ni espesor (regla de realismo).`);
  });

  const all = [c.problem, c.solution, c.cta_question, ...(c.bullets ?? []), ...plan.slides.flatMap(slideTexts)].filter(Boolean).join("\n");

  for (const re of FORBIDDEN) if (re.test(all)) p.push(`Término/afirmación no permitido (${re}). Revisa la lista «no_afirmar».`);
  if (/#/.test([c.problem, c.solution, c.cta_question, ...(c.bullets ?? [])].join(" "))) p.push("No pongas hashtags dentro del texto.");
  if (/!{2,}/.test(all)) p.push("Sin exclamaciones repetidas.");
  if (/✦/.test([...(c.bullets ?? [])].join(""))) p.push("Las viñetas van sin «✦»: lo añade el sistema.");
  if (/[\p{Extended_Pictographic}]/u.test(all)) p.push("Sin emojis en los textos (el sistema añade los suyos).");
  if (/\b\d+\s?m2\b/i.test(all) || /\bm\^2\b/.test(all)) p.push("Escribe «m²» con superíndice, no «m2».");
  if (/\d\.\d/.test(all)) p.push("Usa coma decimal («0,5 %»), no punto.");

  const allowed = new Set(numbersIn(kb.corpus));
  for (const n of new Set(numbersIn(all))) if (!allowed.has(n)) p.push(`El número «${n}» no figura en la base oficial.`);

  for (const m of all.match(/[\w.+-]+@[\w-]+\.[\w.-]+/g) ?? []) if (!kb.corpus.includes(m)) p.push(`Correo no oficial: ${m}`);
  for (const m of all.match(/(?:https?:\/\/|www\.)[^\s)]+/gi) ?? []) {
    const bare = m.replace(/^https?:\/\//i, "").replace(/[.,;]+$/, "");
    if (!kb.corpus.toLowerCase().includes(bare.toLowerCase())) p.push(`URL no oficial: ${m}`);
  }

  // Repetición con posts recientes (solo si el ángulo es el mismo; el tema puede repetirse con ángulo nuevo).
  const body = `${c.problem} ${c.solution}`;
  for (const r of recent) if (r.captionBody && jaccard(r.captionBody, body) > 0.5) { p.push("El texto se parece demasiado a una publicación reciente: busca otro ángulo."); break; }
  const coverTitle = `${plan.slides[0].title1} ${plan.slides[0].title2}`;
  for (const r of recent) if (r.coverTitle && normalize(r.coverTitle) === normalize(coverTitle)) { p.push("El titular de la portada ya se usó."); break; }

  return { ok: p.length === 0, problems: p };
}

/** Ensambla el caption con el esqueleto fijo del cliente (prompt maestro §8). */
export function buildCaption(plan) {
  const c = plan.caption;
  const cover = plan.slides[0];
  const headline = `${cover.title1.trim()} ${cover.title2.trim()}`.replace(/\s+/g, " ");
  const mentionsSilica = /s[ií]lice/i.test([c.problem, c.solution, ...c.bullets, ...plan.slides.flatMap(slideTexts)].join(" "));
  const tags = [...new Set([...FIXED.baseTags, ...c.hashtags.map((h) => h.trim())])].slice(0, 5);
  const parts = [
    headline,
    c.problem.trim(),
    c.solution.trim(),
    c.bullets.map((b) => `✦ ${b.trim().replace(/^[-•✦]\s*/, "")}`).join("\n"),
    ...(mentionsSilica ? [FIXED.silica] : []),
    FIXED.tagline,
    `${c.cta_question.trim()} ${FIXED.contact}`,
    FIXED.countries,
    tags.join(" "),
  ];
  return parts.join("\n\n");
}
