import test from "node:test";
import assert from "node:assert/strict";
import { AVATAR_LAYOUTS, mentionsOscar, pickAvatarSlide } from "../src/avatar.mjs";
import { PERSON_RULES, buildPhotoPrompt, qaPrompt } from "../src/photo.mjs";

const slides = (...layouts) => layouts.map((layout) => ({ layout }));
const on = { enabled: true, chance: 0.2, minGapDays: 4, forceNext: false };
const seq = (...vals) => { let i = 0; return () => vals[i++ % vals.length]; };

test("Oscar: sin foto de referencia nunca aparece", () => {
  assert.equal(pickAvatarSlide({ slides: slides("A"), date: "2026-11-11", rand: () => 0, settings: { ...on, forceNext: true }, available: false }), null);
});

test("Oscar: aparece solo si sale el sorteo y en una pieza apta", () => {
  assert.equal(pickAvatarSlide({ slides: slides("A", "C"), date: "2026-11-11", rand: seq(0.5), settings: on, available: true }), null);
  assert.equal(pickAvatarSlide({ slides: slides("C", "B", "G"), date: "2026-11-11", rand: seq(0.1, 0.99), settings: on, available: true }), 1);
  assert.equal(pickAvatarSlide({ slides: slides("C", "G", "J", "L"), date: "2026-11-11", rand: () => 0, settings: { ...on, forceNext: true }, available: true }), null);
  for (const l of ["C", "G", "J", "L"]) assert.ok(!AVATAR_LAYOUTS.has(l));
});

test("Oscar: respeta el intervalo mínimo y el apagado, salvo pedido explícito", () => {
  const posts = [{ date: "2026-11-09", status: "published", avatarUsed: true }];
  const args = { slides: slides("A"), posts, date: "2026-11-11", rand: () => 0, available: true };
  assert.equal(pickAvatarSlide({ ...args, settings: on }), null); // 2 días < 4
  assert.equal(pickAvatarSlide({ ...args, date: "2026-11-13", settings: on }), 0);
  assert.equal(pickAvatarSlide({ ...args, date: "2026-11-20", settings: { ...on, enabled: false } }), null);
  assert.equal(pickAvatarSlide({ ...args, settings: { ...on, enabled: false, forceNext: true } }), 0);
  assert.equal(pickAvatarSlide({ ...args, settings: { ...on, enabled: false }, idea: "Un post con Óscar mostrando una chimenea" }), 0);
  assert.ok(mentionsOscar("con oscar") && !mentionsOscar("Oscaraje"));
});

test("Oscar: el prompt pide su identidad solo en su pieza y el inspector compara el parecido", () => {
  const kb = { materialByName: new Map([["Crema", { nombre: "Crema", tipo: "marmol", look: "warm cream" }]]) };
  const slide = { layout: "A", scene: { stone_material: "Crema", space: "living room", furniture_and_materials: "oak", light: "soft", stone_application: "fireplace wall", camera: "eye level" } };
  const withP = buildPhotoPrompt(slide, kb, { person: true });
  const without = buildPhotoPrompt(slide, kb);
  assert.ok(withP.includes(PERSON_RULES) && !withP.includes("No people, no hands."));
  assert.ok(!without.includes("PERSON:") && without.includes("No people, no hands."));
  assert.match(qaPrompt("A", { person: true }), /MISMA persona/);
  assert.match(qaPrompt("A"), /Hay personas/);
});
