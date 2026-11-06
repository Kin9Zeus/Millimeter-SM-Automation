import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { ALL_LAYOUTS, FLIPPABLE, THEMED, THEME_IDS, composeSlide } from "../src/compose.mjs";
import { withDirectives } from "../src/content.mjs";
import { chooseLayouts, rolesFor } from "../src/design.mjs";
import { loadKnowledge } from "../src/knowledge.mjs";
import { buildPhotoPrompt } from "../src/photo.mjs";
import { validatePlan } from "../src/validate.mjs";
import { APPLICATIONS, ARCHITECTURES, DECOR, LIGHTS, MOODS, NARRATIVES, SHOTS, applicationById, chooseDirectives, chooseLooks, chooseNarrative } from "../src/variety.mjs";

const kb = loadKnowledge();
const MATS = kb.materials.map((m) => m.nombre);
const numbersIn = (s) => (String(s).match(/\d+(?:[.,]\d+)?/g) ?? []).map((n) => n.replace(",", "."));
const corpusNumbers = new Set(numbersIn(kb.corpus));

test("los catálogos de variedad son amplios, sin duplicados y respetan el realismo", () => {
  assert.ok(APPLICATIONS.length >= 45, `aplicaciones: ${APPLICATIONS.length}`);
  assert.ok(SHOTS.length >= 14 && LIGHTS.length >= 12 && MOODS.length >= 14 && ARCHITECTURES.length >= 12 && DECOR.length >= 14 && NARRATIVES.length >= 9);
  for (const list of [SHOTS, LIGHTS, DECOR]) assert.equal(new Set(list).size, list.length);
  for (const list of [APPLICATIONS, MOODS, ARCHITECTURES, NARRATIVES]) assert.equal(new Set(list.map((x) => x.id)).size, list.length);
  // La piedra solo vive en la aplicación: el decorado, la arquitectura y los ambientes no pueden meter otra superficie de piedra.
  const stone = /\b(stone|marble|travertine|granite|quartz|slate)\b/i;
  for (const d of DECOR) assert.doesNotMatch(d, stone, d);
  for (const a of ARCHITECTURES) { assert.doesNotMatch(a.en, stone, a.id); assert.ok(a.en.toLowerCase().includes(a.key.toLowerCase()), `${a.id}: la clave debe aparecer en el texto`); }
  for (const m of MOODS) { assert.doesNotMatch(m.style, stone, m.id); assert.ok(m.style.length > 5); }
  // Nada de puertas ni cajones abiertos, cantos o espesor en las aplicaciones.
  for (const a of APPLICATIONS) assert.doesNotMatch(a.en, /\b(open|opened|visible edge|thick)\b/i, a.id);
});

test("el banco de temas se amplió con ángulos nuevos que solo usan hechos oficiales", () => {
  assert.ok(kb.topics.length >= 90, `temas: ${kb.topics.length}`);
  assert.equal(new Set(kb.topics.map((t) => t.id)).size, kb.topics.length);
  const forbidden = /\b(precios?|descuentos?|garant[ií]|certific|ofertas?|promoci)/i;
  for (const t of kb.topics) {
    assert.ok(t.facts.length >= 1, t.id);
    for (const id of t.facts) assert.ok(kb.byId.has(id), `${t.id} → ${id}`);
    for (const id of t.apps ?? []) assert.ok(applicationById.has(id), `${t.id} → ${id}`);
    for (const m of t.materials ?? []) assert.ok(kb.materialByName.has(m), `${t.id} → ${m}`);
    for (const n of [...t.dato_grande.flatMap(numbersIn), ...numbersIn(t.titulo)]) assert.ok(corpusNumbers.has(n), `${t.id}: el número ${n} no está en la base oficial`);
    assert.doesNotMatch(t.titulo, forbidden, t.id);
  }
  // Un tema por material autorizado, con el material fijado.
  for (const m of MATS) assert.ok(kb.topics.some((t) => t.materials?.length === 1 && t.materials[0] === m), `falta un tema para ${m}`);
});

test("un carrusel comparte arquitectura y ambiente pero no repite decorado, aplicación, plano ni luz", () => {
  for (let n = 0; n < 100; n++) {
    const d = chooseDirectives({ count: 6, posts: {}, seed: `v2-${n}`, materials: MATS });
    for (const f of ["decor", "appId", "shot", "light", "material"]) assert.equal(new Set(d.map((x) => x[f])).size, 6, `${f} seed ${n}`);
    for (const f of ["archId", "moodId", "style", "arch", "archKey"]) assert.equal(new Set(d.map((x) => x[f])).size, 1, f);
    assert.ok(d.every((x) => x.arch && x.decor && x.style));
  }
  const free = chooseDirectives({ count: 2, posts: {}, seed: "idea", free: true });
  assert.ok(free.every((x) => x.arch === null && x.archKey === null && x.decor && x.style), "una idea del cliente fija su propio espacio");
});

test("la variedad real: en 300 posts salen decenas de aplicaciones, planos, luces, ambientes y arquitecturas distintos", () => {
  const seen = { appId: new Set(), shot: new Set(), light: new Set(), moodId: new Set(), archId: new Set(), decor: new Set() };
  for (let n = 0; n < 300; n++) for (const d of chooseDirectives({ count: 1 + (n % 4), posts: {}, seed: `cov-${n}`, materials: MATS })) for (const k of Object.keys(seen)) seen[k].add(d[k]);
  assert.ok(seen.appId.size >= 40, `aplicaciones ${seen.appId.size}`);
  assert.ok(seen.shot.size >= SHOTS.length - 1 && seen.light.size >= LIGHTS.length - 1, "planos y luces");
  assert.equal(seen.moodId.size, MOODS.length);
  assert.equal(seen.archId.size, ARCHITECTURES.length);
  assert.ok(seen.decor.size >= DECOR.length - 1);
});

test("el tema fija el material cuando lo trae y la arquitectura y el decorado se añaden por código a la escena", () => {
  const d = chooseDirectives({ count: 3, posts: {}, seed: "mat", materials: ["Nero Marquina"] });
  assert.ok(d.every((x) => x.material === "Nero Marquina"));
  const scene = { stone_material: "Nero Marquina", stone_application: d[0].application, space: `${d[0].space} with a skylight`, furniture_and_materials: "a low walnut console", light: "x", camera: "y" };
  const out = withDirectives(scene, d[0]);
  assert.equal(out.camera, d[0].shot);
  assert.equal(out.light, d[0].light);
  assert.match(out.space, /Architecture: /);
  assert.ok(out.space.includes(d[0].arch));
  assert.ok(out.furniture_and_materials.endsWith(d[0].decor));
  // Si el modelo ya nombró la arquitectura, no se duplica.
  assert.equal(withDirectives({ ...scene, space: `a bedroom in a ${d[0].archKey} house` }, d[0]).space, `a bedroom in a ${d[0].archKey} house`);
  // Sin arquitectura (idea del cliente) no se toca el espacio.
  const free = chooseDirectives({ count: 1, posts: {}, seed: "f", free: true })[0];
  assert.equal(withDirectives(scene, free).space, scene.space);
  // El prompt de imagen lleva el estilo del ambiente.
  const slide = { layout: "B", directive: d[0], scene: { ...out } };
  assert.match(buildPhotoPrompt(slide, kb), new RegExp(`Interior style: ${d[0].style}`));
});

test("estructura editorial: respeta el tipo de tema, los hechos que necesita y evita las recientes", () => {
  const byId = (id) => kb.topicById.get(id);
  for (let n = 0; n < 200; n++) {
    const t = kb.topics[n % kb.topics.length];
    const nar = chooseNarrative({ topic: t, posts: {}, seed: `n-${n}` });
    if (nar.topics.length) assert.ok(nar.topics.includes(t.tipo), `${nar.id} con tema ${t.tipo}`);
    if (nar.needsFact) assert.ok(t.facts.includes(nar.needsFact), `${nar.id} necesita ${nar.needsFact}`);
    assert.ok(chooseNarrative({ topic: byId("respuesta-24h"), posts: {}, seed: `c-${n}`, free: false }).id !== "mito", "un tema de contacto nunca recibe «creencia y realidad»");
    assert.ok(chooseNarrative({ topic: t, posts: {}, seed: `f-${n}`, free: true }).free, "una idea del cliente solo recibe estructuras libres");
  }
  assert.deepEqual(chooseNarrative({ topic: byId("misma-piedra"), posts: {}, seed: "x" }), chooseNarrative({ topic: byId("misma-piedra"), posts: {}, seed: "x" }));
  // Variedad a lo largo de 60 días para un mismo tipo de tema: nunca la misma estructura dos posts seguidos y al menos 4 distintas.
  let posts = {}, last = null;
  const used = new Set();
  for (let day = 0; day < 60; day++) {
    const key = `2026-12-${String(day).padStart(3, "0")}`;
    const nar = chooseNarrative({ topic: byId("misma-piedra"), posts, seed: key });
    assert.notEqual(nar.id, last);
    last = nar.id; used.add(nar.id);
    posts[key] = { date: key, status: "published", slides: [], narrativeId: nar.id };
  }
  assert.ok(used.size >= 4, `solo ${used.size} estructuras`);
});

test("aspecto gráfico: tema y espejo válidos, solo donde el layout los admite, determinista y variado", () => {
  const layouts = ["A", "B", "D", "F", "H", "J", "K", "G"];
  const a = chooseLooks(layouts, {}, "seed-1");
  assert.deepEqual(a, chooseLooks(layouts, {}, "seed-1"));
  a.forEach((l, i) => {
    if (!THEMED.has(layouts[i])) { assert.equal(l.theme, null); assert.equal(l.flip, false); return; }
    assert.ok(THEME_IDS.includes(l.theme));
    if (!FLIPPABLE.has(layouts[i])) assert.equal(l.flip, false);
  });
  const themes = new Set(), flips = new Set();
  let sameAsPrev = 0, total = 0;
  for (let n = 0; n < 200; n++) {
    const out = chooseLooks(["B", "F", "I", "K"], {}, `l-${n}`);
    out.forEach((l, i) => { themes.add(l.theme); if (i) { total++; if (l.theme === out[i - 1].theme) sameAsPrev++; } });
    chooseLooks(["D", "H", "J", "K"], {}, `m-${n}`).forEach((l) => flips.add(l.flip));
  }
  assert.equal(themes.size, THEME_IDS.length);
  assert.equal(flips.size, 2);
  assert.ok(sameAsPrev / total < 0.1, `temas seguidos repetidos: ${sameAsPrev}/${total}`);
});

test("los layouts nuevos entran en la rotación y la cifra grande solo recae en el rol «dato»", () => {
  assert.equal(ALL_LAYOUTS.length, 12);
  const count = {};
  for (let n = 0; n < 600; n++) {
    const roles = rolesFor(6);
    chooseLayouts(roles, {}, `lay-${n}`).forEach((l, i) => {
      count[l] = (count[l] ?? 0) + 1;
      if (l === "L") assert.equal(roles[i], "dato", `L en el rol ${roles[i]}`);
    });
  }
  for (const l of ALL_LAYOUTS) assert.ok(count[l] > 0, `el layout ${l} nunca sale`);
  for (const l of ["H", "I", "J", "K"]) assert.ok(count[l] > 150, `el layout ${l} sale poco (${count[l]})`);
  assert.ok(count.L > 60, `el layout L sale poco (${count.L})`);
  assert.ok((count.C + count.G) / Object.values(count).reduce((a, b) => a + b, 0) < 0.08, "las texturas planas siguen siendo ocasionales");
});

test("el layout L exige cifra grande como el C", () => {
  const base = {
    angle: "Una cifra para empezar", fact_ids: ["peso-2"],
    caption: { problem: "La piedra tradicional pesaba demasiado.", solution: "Con MILLIMETER de 5 mm el peso baja a 15–20 kg/m².", bullets: ["Menos peso sobre la estructura", "Espesor de 5 mm", "Piedra 100 % natural", "Misma piedra, otro peso"], cta_question: "¿Qué estás proyectando?", hashtags: ["#Peso", "#Diseño", "#PiedraNatural"] },
    slides: [{ eyebrow: "Peso · 5 mm", title1: "Mucho menos peso", title2: "sobre tu estructura.", subtitle: "De 63–73 a 15–20 kg/m².", alt_text: "Comparación de peso entre piedra tradicional y MILLIMETER.", scene: { stone_material: MATS[0], stone_application: "wall", space: "living room", furniture_and_materials: "a sofa", light: "soft light", camera: "wide shot" } }],
  };
  const ctx = { kb, roles: ["dato"], layouts: ["L"], recent: [] };
  assert.ok(validatePlan(base, ctx).problems.some((p) => p.includes("layout L")));
  const ok = structuredClone(base); ok.slides[0].big = "15–20 kg/m²"; ok.slides[0].bigLabel = "por metro cuadrado";
  assert.deepEqual(validatePlan(ok, ctx).problems, []);
});

test("los 12 layouts componen con cualquier tema y espejo, con textos largos, y entregan JPEG 1440×1920", async () => {
  const photo = await sharp({ create: { width: 1440, height: 1920, channels: 3, background: "#b9a98f" } }).jpeg().toBuffer();
  const slide = { eyebrow: "Mobiliario a medida · 1 y 5 mm", title1: "Frentes de piedra que", title2: "abren y cierran.", subtitle: "Piedra natural en frentes y puertas con herrajes estándar, peso compatible.", big: "15–20 kg/m²", bigLabel: "por metro cuadrado", closing: "MILLIMETERSOUTHAMERICA.COM" };
  for (const layout of ALL_LAYOUTS) {
    const looks = THEMED.has(layout) ? THEME_IDS.flatMap((theme) => [{ theme, flip: false }, { theme, flip: true }]) : [{}];
    for (const look of looks) {
      const jpg = await composeSlide(photo, layout, { ...slide, look });
      const meta = await sharp(jpg).metadata();
      assert.deepEqual([meta.format, meta.width, meta.height], ["jpeg", 1440, 1920], `${layout} ${JSON.stringify(look)}`);
    }
  }
});

test("un look desconocido o ausente cae al tema por defecto del layout (planes guardados antes de este cambio)", async () => {
  const photo = await sharp({ create: { width: 800, height: 1000, channels: 3, background: "#888" } }).jpeg().toBuffer();
  const slide = { eyebrow: "Tema", title1: "Línea uno", title2: "línea dos", subtitle: "Subtítulo", closing: "DESLIZA →" };
  for (const layout of ["B", "D", "F", "G"]) {
    const a = await composeSlide(photo, layout, slide);
    const b = await composeSlide(photo, layout, { ...slide, look: { theme: "inexistente", flip: false } });
    assert.deepEqual(a, b, layout);
  }
});
