import test from "node:test";
import assert from "node:assert/strict";
import { loadKnowledge, PILLARS } from "../src/knowledge.mjs";
import { buildFinalCaption, validateContent } from "../src/validate.mjs";

const kb = loadKnowledge();
const good = () => ({
  topic: "Peso de 5 mm frente a 2 cm",
  fact_ids: ["peso-1", "peso-2"],
  caption:
    "Cuando la estructura deja de ser el límite, el diseño respira.\n\nLa piedra tradicional de 2 cm pesa entre 63 y 73 kg/m². En MILLIMETER de 5 mm, entre 15 y 20 kg/m²: la misma piedra, con una fracción de la carga.\n\nCuéntanos qué estás diseñando: info@millimeterbycasanova.com",
  hashtags: ["#piedranatural", "#interiorismo", "#arquitectura"],
  image_kind: "concepto",
  image_prompt: "Minimal editorial illustration of a very thin sheet of pale stone next to a thick slab, warm light, soft shadows.",
  alt_text: "Ilustración minimalista de una lámina fina de piedra junto a un bloque grueso.",
});

test("contenido válido pasa", () => {
  const r = validateContent(good(), kb);
  assert.deepEqual(r.problems, []);
  assert.ok(r.ok);
});

test("rechaza números que no están en la base oficial", () => {
  const c = good();
  c.caption = c.caption.replace("63 y 73", "50 y 60");
  const r = validateContent(c, kb);
  assert.ok(!r.ok && r.problems.some((p) => p.includes("«50»")));
});

test("rechaza precios, garantías y certificaciones", () => {
  for (const bad of ["con garantía de por vida", "a un precio accesible", "certificado ISO 9001", "desde $50 el metro"]) {
    const c = good();
    c.caption += ` ${bad}`;
    assert.ok(!validateContent(c, kb).ok, bad);
  }
});

test("rechaza correos y URLs no oficiales", () => {
  const c = good();
  c.caption += "\nEscribe a ventas@otro.com o visita www.otra-web.com";
  const r = validateContent(c, kb);
  assert.ok(r.problems.some((p) => p.includes("Correo")) && r.problems.some((p) => p.includes("URL")));
});

test("rechaza fact_ids inventados, hashtags en el caption y temas repetidos", () => {
  let c = good();
  c.fact_ids = ["inventado-9"];
  assert.ok(!validateContent(c, kb).ok);
  c = good();
  c.caption += " #piedra";
  assert.ok(!validateContent(c, kb).ok);
  assert.ok(!validateContent(good(), kb, { recent: [{ topic: "peso de 5 mm frente a 2 cm" }] }).ok);
});

test("el caption final siempre lleva el hashtag base", () => {
  assert.match(buildFinalCaption(good()), /#millimeterbycasanova/);
});

test("todos los pilares apuntan a categorías que existen en la base", () => {
  const cats = new Set(kb.facts.map((f) => f.category));
  for (const p of PILLARS) for (const c of p.categories) assert.ok(cats.has(c), `${p.id} → ${c}`);
});

test("los ids de la base son únicos", () => {
  assert.equal(new Set(kb.facts.map((f) => f.id)).size, kb.facts.length);
});
