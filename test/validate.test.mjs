import test from "node:test";
import assert from "node:assert/strict";
import { chooseFormat, chooseLayouts, chooseTopic, rolesFor } from "../src/design.mjs";
import { loadKnowledge } from "../src/knowledge.mjs";
import { buildCaption, validatePlan } from "../src/validate.mjs";

const kb = loadKnowledge();

const mkScene = () => ({ stone_material: "Dark Emperador", stone_application: "TV wall", space: "bright living room with large windows", furniture_and_materials: "warm oak sideboard and boucle armchair", light: "warm late afternoon sun", camera: "35mm lens, straight-on" });
const slide = (over = {}) => ({ eyebrow: "Muros decorativos · 5 mm", title1: "El muro que", title2: "se roba la sala.", subtitle: "Paneles de gran formato en piedra natural.", alt_text: "Sala con un muro de mármol oscuro de una sola pieza.", scene: mkScene(), ...over });
const good = () => ({
  angle: "El muro de TV como protagonista de la sala",
  fact_ids: ["app-muros", "peso-1", "peso-2"],
  caption: {
    problem: "El muro de TV casi siempre se resuelve con pintura, enchape o un panel que imita piedra.",
    solution: "Con MILLIMETER ese muro puede ser mármol natural. En 5 mm la piedra pesa entre 15 y 20 kg/m², frente a los 63–73 kg/m² de la piedra de 2 cm.",
    bullets: ["Paños de gran formato con pocas juntas", "15–20 kg/m² en 5 mm", "Sin anclajes pesados", "Mármol, cuarcita y travertino 100 % naturales"],
    cta_question: "¿Estás diseñando una sala o un espacio social?",
    hashtags: ["#TVWall", "#InteriorismoDeLujo", "#ArquitecturaColombia"],
  },
  slides: [slide(), slide({ eyebrow: "Peso", title1: "Hasta 90 % menos", title2: "de peso.", big: "90 %", bigLabel: "menos peso" }), slide({ eyebrow: "Tu proyecto", title1: "Cuéntanos qué", title2: "estás proyectando.", subtitle: "Revisamos el detalle constructivo contigo." })],
});
const ctx = (over = {}) => ({ kb, roles: ["gancho", "dato", "cta"], layouts: ["E", "C", "G"], recent: [], ...over });

test("plan válido pasa", () => {
  const r = validatePlan(good(), ctx());
  assert.deepEqual(r.problems, []);
});

test("rechaza números que no están en la base oficial", () => {
  const p = good();
  p.caption.solution = p.caption.solution.replace("15 y 20", "50 y 60");
  const r = validatePlan(p, ctx());
  assert.ok(r.problems.some((x) => x.includes("«50»")));
});

test("rechaza «sin juntas» absoluto pero acepta «casi sin juntas» y «pocas juntas»", () => {
  const p = good();
  p.slides[0].title2 = "casi sin juntas.";
  assert.ok(validatePlan(p, ctx()).ok);
  p.slides[0].title2 = "sin juntas.";
  assert.ok(!validatePlan(p, ctx()).ok);
});

test("rechaza precios, garantías y certificaciones", () => {
  for (const bad of ["con garantía de por vida", "a un precio accesible", "certificado ISO 9001", "desde $50 el metro"]) {
    const p = good();
    p.caption.solution += ` ${bad}`;
    assert.ok(!validatePlan(p, ctx()).ok, bad);
  }
});

test("rechaza escenas con personas, cantos o espesor visible", () => {
  let p = good();
  p.slides[0].scene.furniture_and_materials = "a woman sitting on the sofa";
  assert.ok(!validatePlan(p, ctx()).ok);
  p = good();
  p.slides[0].scene.camera = "close-up of the slab edge";
  assert.ok(!validatePlan(p, ctx()).ok);
});

test("las escenas que NIEGAN personas o cantos son válidas («no people», «no visible slab edges»)", () => {
  const p = good();
  p.slides[0].scene.furniture_and_materials = "warm oak sideboard, no people, no visible slab edges, nothing thick or open";
  assert.deepEqual(validatePlan(p, ctx()).problems, []);
  p.slides[0].scene.furniture_and_materials = "warm oak sideboard with a man standing nearby";
  assert.ok(!validatePlan(p, ctx()).ok);
});

test("el layout C exige dato grande y los materiales deben ser del catálogo", () => {
  let p = good();
  delete p.slides[1].big;
  assert.ok(validatePlan(p, ctx()).problems.some((x) => x.includes("layout C")));
  p = good();
  p.slides[0].scene.stone_material = "Granito Negro";
  assert.ok(!validatePlan(p, ctx()).ok);
});

test("límites de texto de las piezas", () => {
  const p = good();
  p.slides[0].title1 = "Un titular larguísimo que no cabe";
  assert.ok(!validatePlan(p, ctx()).ok);
});

test("rechaza correos, URLs y emojis ajenos", () => {
  const p = good();
  p.caption.cta_question += " ventas@otro.com www.otra-web.com 🔥";
  const r = validatePlan(p, ctx());
  assert.ok(r.problems.some((x) => x.includes("Correo")) && r.problems.some((x) => x.includes("URL")) && r.problems.some((x) => x.includes("emojis")));
});

test("el caption sigue el esqueleto del cliente", () => {
  const cap = buildCaption(good());
  const lines = cap.split("\n\n");
  assert.equal(lines[0], "El muro que se roba la sala.");
  assert.match(cap, /✦ Paños de gran formato con pocas juntas/);
  assert.match(cap, /Misma piedra\. Sin el espesor\./);
  assert.match(cap, /Escríbenos por DM, por WhatsApp o en millimetersouthamerica\.com\. Revisamos el detalle constructivo contigo, con respuesta en menos de 24 h hábiles\./);
  assert.match(cap, /Proyectos en 🇨🇴🇦🇷🇵🇪🇧🇷/);
  const tags = cap.trim().split("\n\n").pop().split(" ");
  assert.ok(tags.length <= 5 && tags[0] === "#MILLIMETER" && tags[1] === "#PiedraNatural");
  assert.ok(!/Cifras de MILLIMETER Global LLC/.test(cap));
});

test("si se menciona la sílice, se añade la nota de fuente", () => {
  const p = good();
  p.caption.bullets[3] = "Menos de 0,5 % de sílice";
  assert.match(buildCaption(p), /Cifras de MILLIMETER Global LLC\./);
});

test("formato: mezcla de posts de 1 imagen y carruseles de 3–6, estable por fecha", () => {
  const seen = new Set();
  for (let d = 1; d <= 60; d++) seen.add(chooseFormat(`2026-11-${d}`).count);
  assert.ok(seen.has(1) && [...seen].some((n) => n >= 3));
  assert.ok([...seen].every((n) => n === 1 || (n >= 3 && n <= 6)));
  assert.deepEqual(chooseFormat("2026-12-01"), chooseFormat("2026-12-01"));
});

test("layouts: sin repetir dentro del post y portada distinta a las 3 anteriores", () => {
  const posts = { a: { status: "published", date: "2026-10-01", slides: [{ layout: "E" }] }, b: { status: "published", date: "2026-10-02", slides: [{ layout: "B" }] }, c: { status: "published", date: "2026-10-03", slides: [{ layout: "D" }] } };
  for (let d = 1; d <= 40; d++) {
    const roles = rolesFor(5);
    const l = chooseLayouts(roles, posts, `2026-11-${d}`);
    assert.equal(new Set(l).size, l.length);
    assert.ok(!["E", "B", "D"].includes(l[0]));
  }
});

test("el tema elegido es el menos usado y los pendientes del cliente salen primero", () => {
  const first = chooseTopic(kb, {}, "2026-10-11").topic.id;
  assert.ok(!kb.seedPublished.includes(first), `${first} ya estaba publicado`);
});

test("hechos, temas y materiales son consistentes", () => {
  assert.equal(new Set(kb.facts.map((f) => f.id)).size, kb.facts.length);
  for (const t of kb.topics) for (const id of t.facts) assert.ok(kb.byId.has(id), `${t.id} → ${id}`);
  for (const id of kb.seedPublished) assert.ok(kb.topicById.has(id), `seed ${id}`);
  assert.equal(kb.materials.length, 9);
});
