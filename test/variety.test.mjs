import test from "node:test";
import assert from "node:assert/strict";
import { rolesFor } from "../src/design.mjs";
import { loadKnowledge } from "../src/knowledge.mjs";
import { validatePlan } from "../src/validate.mjs";
import { APPLICATIONS, LIGHTS, MOODS, SHOTS, applicationById, chooseDirectives } from "../src/variety.mjs";

const kb = loadKnowledge();
const MATS = kb.materials.map((m) => m.nombre);
const OFFICIAL_CATS = new Set(["muros", "chimeneas", "elementos", "curvas", "duchas", "mobiliario", "puertas", "techos"]); // las ocho de app-1

test("catálogo de variedad: ids únicos, solo aplicaciones oficiales y temas coherentes", () => {
  assert.equal(new Set(APPLICATIONS.map((a) => a.id)).size, APPLICATIONS.length);
  for (const a of APPLICATIONS) { assert.ok(OFFICIAL_CATS.has(a.cat), a.id); assert.ok(a.spaces.length); }
  for (const t of kb.topics) {
    for (const id of t.apps ?? []) assert.ok(applicationById.has(id), `${t.id} → ${id}`);
    for (const id of t.facts) assert.ok(kb.byId.has(id), `${t.id} → ${id}`);
  }
  assert.ok(kb.topics.length >= 24, "banco de temas ampliado");
});

test("un carrusel no repite aplicación, plano, luz ni material; todas las piezas comparten ambiente", () => {
  for (let n = 0; n < 100; n++) {
    const d = chooseDirectives({ count: 6, posts: {}, seed: `c-${n}`, materials: MATS });
    for (const f of ["appId", "shot", "light", "material"]) assert.equal(new Set(d.map((x) => x[f])).size, 6, `${f} seed ${n}`);
    assert.equal(new Set(d.map((x) => x.moodId)).size, 1);
  }
});

test("es determinista por semilla y varía entre semillas", () => {
  const a = chooseDirectives({ count: 3, posts: {}, seed: "x", materials: MATS });
  assert.deepEqual(a, chooseDirectives({ count: 3, posts: {}, seed: "x", materials: MATS }));
  const covers = new Set(Array.from({ length: 60 }, (_, n) => chooseDirectives({ count: 1, posts: {}, seed: `s${n}`, materials: MATS })[0].appId));
  assert.ok(covers.size >= 10, `solo ${covers.size} aplicaciones distintas en 60 posts`);
});

test("evita repetir lo publicado en los últimos posts", () => {
  let repeats = 0, total = 0;
  let posts = {};
  for (let day = 0; day < 120; day++) {
    const key = `2026-11-${String(day).padStart(3, "0")}`;
    const d = chooseDirectives({ count: 1, posts, seed: key, materials: MATS });
    const last = Object.values(posts).sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 3).map((p) => p.slides[0].directive);
    total++;
    if (last.some((l) => l.appId === d[0].appId || l.material === d[0].material || l.moodId === d[0].moodId)) repeats++;
    posts[key] = { date: key, status: "published", slides: [{ directive: d[0] }] };
  }
  assert.ok(repeats / total < 0.12, `repite lo reciente en ${repeats}/${total} posts`);
});

test("el tema condiciona la aplicación de la portada y una idea la deja libre", () => {
  for (let n = 0; n < 40; n++) {
    assert.equal(chooseDirectives({ count: 3, posts: {}, seed: `t${n}`, topicApps: ["ducha"], materials: MATS })[0].appId, "ducha");
  }
  const free = chooseDirectives({ count: 2, posts: {}, seed: "idea", free: true });
  assert.ok(free.every((d) => d.application === null && d.space === null && d.material === null));
  assert.ok(free.every((d) => SHOTS.includes(d.shot) && LIGHTS.includes(d.light) && MOODS.some((m) => m.id === d.moodId)));
});

test("la validación exige que la escena respete la directiva", () => {
  const [d] = chooseDirectives({ count: 1, posts: {}, seed: "v", topicApps: ["ducha"], materials: MATS });
  const base = {
    angle: "Una ducha amplia con pocas juntas",
    fact_ids: ["app-duchas", "peso-2"],
    caption: { problem: "Las duchas grandes se resuelven con muchas juntas y silicona.", solution: "Con MILLIMETER en 5 mm hay menos juntas, menos filtraciones y menos silicona.", bullets: ["Duchas de gran formato", "Menos juntas y silicona", "Piedra 100 % natural", "Espesor de 5 mm"], cta_question: "¿Estás diseñando un baño principal?", hashtags: ["#Duchas", "#BañoDeLujo", "#PiedraNatural"] },
    slides: [{ eyebrow: "Grandes duchas · 5 mm", title1: "Una ducha amplia", title2: "y más sencilla.", subtitle: "Menos juntas, menos silicona.", alt_text: "Ducha amplia revestida en piedra natural.", scene: { stone_material: d.material, stone_application: d.application, space: `${d.space} with a skylight`, furniture_and_materials: "matte black fixtures", light: d.light, camera: d.shot } }],
  };
  const ctx = { kb, roles: ["unico"], layouts: ["E"], recent: [], directives: [d] };
  assert.deepEqual(validatePlan(base, ctx).problems, []);
  const wrongApp = structuredClone(base); wrongApp.slides[0].scene.stone_application = "TV wall";
  assert.ok(validatePlan(wrongApp, ctx).problems.some((p) => p.includes("stone_application")));
  const wrongMat = structuredClone(base); wrongMat.slides[0].scene.stone_material = MATS.find((m) => m !== d.material);
  assert.ok(validatePlan(wrongMat, ctx).problems.some((p) => p.includes("stone_material")));
  const wrongSpace = structuredClone(base); wrongSpace.slides[0].scene.space = "an unrelated warehouse";
  assert.ok(validatePlan(wrongSpace, ctx).problems.some((p) => p.includes("scene.space")));
});

test("los roles existentes siguen funcionando con directivas", () => {
  for (const n of [1, 3, 4, 5, 6]) assert.equal(chooseDirectives({ count: rolesFor(n).length, posts: {}, seed: `r${n}`, materials: MATS }).length, n);
});
