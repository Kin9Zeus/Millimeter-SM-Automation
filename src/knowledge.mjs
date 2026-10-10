import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const dir = resolve(dirname(fileURLToPath(import.meta.url)), "..", "knowledge");
const read = (f) => readFileSync(resolve(dir, f), "utf8");

export function loadKnowledge() {
  const raw = JSON.parse(read("facts.json"));
  const topics = JSON.parse(read("topics.json"));
  const materials = JSON.parse(read("materiales.json")).materiales;
  return {
    facts: raw.facts,
    byId: new Map(raw.facts.map((f) => [f.id, f])),
    corpus: raw.facts.map((f) => f.text).join("\n"),
    noAfirmar: raw.no_afirmar,
    guide: read("guia-editorial.md"),
    topics: topics.temas,
    topicById: new Map(topics.temas.map((t) => [t.id, t])),
    seedPublished: topics.seed_publicados,
    materials,
    materialByName: new Map(materials.map((m) => [m.nombre, m])),
  };
}
