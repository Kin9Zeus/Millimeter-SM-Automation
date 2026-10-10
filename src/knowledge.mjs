import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const dir = resolve(dirname(fileURLToPath(import.meta.url)), "..", "knowledge");

export function loadKnowledge() {
  const raw = JSON.parse(readFileSync(resolve(dir, "facts.json"), "utf8"));
  const voice = readFileSync(resolve(dir, "voice.md"), "utf8");
  const byId = new Map(raw.facts.map((f) => [f.id, f]));
  const corpus = raw.facts.map((f) => f.text).join("\n");
  return { facts: raw.facts, byId, corpus, noAfirmar: raw.no_afirmar, voice };
}

// Pilares: cada día de la semana rota uno (determinista), así la cuenta tiene variedad sin depender del azar.
export const PILLARS = [
  { id: "concepto", title: "Concepto: un milímetro de piedra natural", categories: ["concepto", "contraste"], imageKinds: ["concepto", "textura"] },
  { id: "peso", title: "Peso y estructura: la estructura deja de ser el límite", categories: ["peso", "contraste"], imageKinds: ["concepto", "atmosfera"] },
  { id: "aplicacion", title: "Aplicaciones: una de las ocho (elige solo UNA)", categories: ["aplicacion"], imageKinds: ["atmosfera", "textura"] },
  { id: "material", title: "Materiales: la misma piedra sin el espesor", categories: ["material", "concepto"], imageKinds: ["textura", "atmosfera"] },
  { id: "salud", title: "Salud y seguridad: menos de 0,5 % de sílice", categories: ["salud"], imageKinds: ["concepto", "textura"] },
  { id: "huella", title: "Menos espesor, menos huella", categories: ["huella", "peso"], imageKinds: ["concepto", "atmosfera"] },
  { id: "proyecto", title: "Obra y siguiente paso: invitación a contar el proyecto", categories: ["proyecto", "contacto"], imageKinds: ["textura", "atmosfera"] },
];

export const IMAGE_KINDS = {
  textura: "Macro abstracto de una superficie de piedra natural clara: vetas, luz rasante, grano. Genérica; NO intenta reproducir ningún mármol o travertino del catálogo por nombre.",
  concepto: "Ilustración editorial minimalista y limpia que muestra visualmente la idea de «delgado vs. grueso» (una lámina finísima de piedra frente a un bloque grueso, secciones, curvas suaves). Sin texto, sin números, sin etiquetas.",
  atmosfera: "Primer plano o recorte cerrado de una superficie continua de piedra clara con curvas suaves y luz cálida rasante. SOLO la superficie de piedra y su luz: sin habitación, escalera, ventanas, muebles, herrajes, metales ni ningún contexto arquitectónico reconocible.",
};
