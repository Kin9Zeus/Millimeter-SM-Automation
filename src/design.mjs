import { createHash } from "node:crypto";

// Decisiones de diseño deterministas (semilla = fecha): así un reintento del mismo día mantiene formato y layouts,
// pero el feed varía de un día a otro. Nada de esto depende del modelo de lenguaje.

export function rng(seed) {
  const h = createHash("sha256").update(String(seed)).digest();
  let a = h.readUInt32LE(0);
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function weighted(items, r) {
  const total = items.reduce((s, [, w]) => s + w, 0);
  let x = r() * total;
  for (const [v, w] of items) if ((x -= w) <= 0) return v;
  return items[items.length - 1][0];
}

/** 35 % post de una imagen; 65 % carrusel de 3 a 6 imágenes (el número es aleatorio cada día). */
export function chooseFormat(date) {
  const r = rng(`format:${date}`);
  const count = weighted([[1, 35], [3, 24], [4, 20], [5, 13], [6, 8]], r);
  return { format: count === 1 ? "single" : "carousel", count };
}

/** Tema menos usado recientemente. Los temas «ya publicados» del cliente arrancan como los más antiguos. */
export function chooseTopic(kb, posts, date) {
  const lastUsed = new Map();
  kb.seedPublished.forEach((id, i) => lastUsed.set(id, -1000 + i)); // orden de publicación original
  const dated = Object.values(posts).filter((p) => p.topicId && p.status === "published").sort((a, b) => (a.date < b.date ? -1 : 1));
  dated.forEach((p, i) => lastUsed.set(p.topicId, i));
  const r = rng(`topic:${date}`);
  const ranked = kb.topics.map((t) => ({ t, score: (lastUsed.get(t.id) ?? -Infinity), tie: r() }));
  ranked.sort((a, b) => a.score - b.score || a.tie - b.tie);
  const used = lastUsed.has(ranked[0].t.id);
  return { topic: ranked[0].t, repeated: used };
}

/** Materiales usados en los últimos posts (para pedirle al modelo que varíe). */
export function recentMaterials(posts, n = 4) {
  return Object.values(posts)
    .filter((p) => p.status === "published" && Array.isArray(p.slides))
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, n)
    .flatMap((p) => p.slides.map((s) => s.stoneMaterial))
    .filter(Boolean);
}

export function rolesFor(count) {
  if (count === 1) return ["unico"];
  const middle = ["dato", "aplicacion", "material", "aplicacion"];
  return ["gancho", ...middle.slice(0, count - 2), "cta"];
}

const POOLS = {
  unico: [["E", 3], ["B", 3], ["D", 3], ["F", 2], ["A", 1.5], ["C", 1.5]],
  gancho: [["E", 3], ["B", 3], ["D", 3], ["F", 2], ["A", 1.5]],
  dato: [["C", 4], ["D", 2], ["B", 2], ["G", 1]],
  aplicacion: [["B", 3], ["F", 3], ["D", 2], ["E", 2], ["A", 1.5]],
  material: [["F", 3], ["B", 3], ["D", 2], ["E", 2]],
  cta: [["G", 4], ["B", 2], ["F", 2], ["D", 1]],
};

/** Layout por pieza: portada distinta a las 3 portadas anteriores y sin repetir layout dentro del post. */
export function chooseLayouts(roles, posts, date, { sceneCover = false } = {}) {
  const r = rng(`layouts:${date}`);
  const recentCovers = Object.values(posts)
    .filter((p) => p.status === "published" && Array.isArray(p.slides) && p.slides[0]?.layout)
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, 3)
    .map((p) => p.slides[0].layout);
  const used = [];
  return roles.map((role, i) => {
    let pool = POOLS[role] ?? POOLS.aplicacion;
    // sceneCover (posts de una idea del cliente): la portada nunca es una textura pura (C/G), que descartaría el mueble o espacio pedido.
    const textureOk = (l) => !(sceneCover && i === 0 && (l === "C" || l === "G"));
    let allowed = pool.filter(([l]) => !used.includes(l) && (i > 0 || !recentCovers.includes(l)) && textureOk(l));
    // Si el pool del rol se agota, se toma cualquier layout (A–G) aún no usado en este post.
    if (!allowed.length) allowed = ["A", "B", "C", "D", "E", "F", "G"].filter((l) => !used.includes(l) && (i > 0 || !recentCovers.includes(l)) && textureOk(l)).map((l) => [l, 1]);
    if (!allowed.length) allowed = ["A", "B", "C", "D", "E", "F", "G"].filter((l) => !used.includes(l) && textureOk(l)).map((l) => [l, 1]);
    const layout = weighted(allowed, r);
    used.push(layout);
    return layout;
  });
}
