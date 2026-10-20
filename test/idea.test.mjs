import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "mm-bot-idea-"));
process.env.TELEGRAM_BOT_TOKEN = "";
process.env.PAUSED = "false";

const { planWithIdea } = await import("../src/pipeline.mjs");
const { PlanError } = await import("../src/content.mjs");
const { nextPublication } = await import("../src/commands.mjs");
const { buildPhotoPrompt } = await import("../src/photo.mjs");
const { loadKnowledge } = await import("../src/knowledge.mjs");
const { addIdea, listIdeas } = await import("../src/state.mjs");
const { setPaused } = await import("../src/runtime.mjs");

const IDEA = "Muestra mobiliario con el producto aplicado en un salón";

test("un fallo de API NO consume la idea ni publica un tema automático", async () => {
  const queued = addIdea(IDEA, "test");
  const told = [];
  let calls = 0;
  const create = async () => { calls++; throw new Error("429 RESOURCE_EXHAUSTED"); };
  await assert.rejects(planWithIdea({ create, date: "2026-10-21", planOpts: {}, idea: IDEA, explicit: false, queued, tell: async (t) => told.push(t) }), /429/);
  assert.equal(calls, 1, "no debe reintentar con un tema automático");
  assert.equal(told.length, 0);
  assert.equal(listIdeas().length, 1, "la idea sigue en la cola");
});

test("idea de la cola inviable (PlanError): avisa, publica tema automático y la retira de la cola", async () => {
  const queued = listIdeas()[0];
  const told = [];
  const seen = [];
  const create = async (_d, opts) => {
    seen.push(opts.idea);
    if (opts.idea) throw new PlanError("No se logró un plan válido tras 4 rondas. Último feedback:\n- precio no permitido");
    return { topic: "auto" };
  };
  const r = await planWithIdea({ create, date: "2026-10-21", planOpts: {}, idea: IDEA, explicit: false, queued, tell: async (t) => told.push(t) });
  assert.equal(r.ideaRejected, true);
  assert.deepEqual(r.plan, { topic: "auto" });
  assert.deepEqual(seen, [IDEA, undefined]);
  assert.match(told[0], /tema automático/);
  assert.equal(listIdeas().length, 0);
});

test("idea explícita (/forzar, /previa) inviable: avisa y NO publica otro tema", async () => {
  const told = [];
  let calls = 0;
  const create = async () => { calls++; throw new PlanError("No se logró un plan válido tras 4 rondas. Último feedback:\n- garantía no permitida"); };
  await assert.rejects(planWithIdea({ create, date: "2026-10-21", planOpts: {}, idea: IDEA, explicit: true, queued: null, tell: async (t) => told.push(t) }), (e) => e.notified === true);
  assert.equal(calls, 1);
  assert.match(told[0], /No publiqué nada/);
});

test("sin idea el error se propaga sin tocar nada", async () => {
  const create = async () => { throw new PlanError("x"); };
  await assert.rejects(planWithIdea({ create, date: "d", planOpts: {}, idea: undefined, explicit: false, queued: null, tell: async () => {} }), PlanError);
});

test("el prompt de foto simplifica la cámara y prohíbe piedra fuera del panel", () => {
  const kb = loadKnowledge();
  const mat = kb.materials[0].nombre;
  const slide = { layout: "A", scene: { stone_material: mat, stone_application: "wall behind sideboard", space: "living room", furniture_and_materials: "oak sideboard", light: "warm", camera: "35mm wide angle from the corner" } };
  const normal = buildPhotoPrompt(slide, kb);
  const simple = buildPhotoPrompt({ ...slide, simplified: true }, kb);
  assert.match(normal, /35mm wide angle/);
  assert.doesNotMatch(simple, /35mm wide angle/);
  assert.match(simple, /straight-on medium shot/);
  assert.match(normal, /NOT stone/);
});

test("nextPublication refleja pausa y hora vencida", () => {
  setPaused(false);
  const out = nextPublication();
  assert.match(out, /^(hoy a las|mañana a las|en los próximos minutos)/);
  setPaused(true);
  assert.match(nextPublication(), /PAUSADAS/);
  setPaused(false);
});

test("con idea del cliente la portada nunca es una textura pura (C/G)", async () => {
  const { chooseLayouts, rolesFor } = await import("../src/design.mjs");
  for (let n = 0; n < 300; n++) {
    const [l] = chooseLayouts(rolesFor(1), {}, `seed-${n}`, { sceneCover: true });
    assert.ok(!["C", "G"].includes(l), `seed-${n} → ${l}`);
  }
});
