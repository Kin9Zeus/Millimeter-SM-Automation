import { rng } from "./design.mjs";

// Variedad visual DETERMINISTA. El modelo de lenguaje tiende a repetir «salón con roble y latón, plano frontal»; por eso la aplicación,
// el espacio, el plano, la luz y la paleta de cada pieza se eligen aquí, evitando lo usado en los últimos posts, y el modelo solo
// completa los detalles. Todas las aplicaciones salen de las ocho oficiales (hecho app-1); no se inventa ninguna.

export const APPLICATIONS = [
  { id: "tv-wall", cat: "muros", en: "feature wall behind a low media console", spaces: ["a calm family living room", "a penthouse lounge with city views"] },
  { id: "cabecero", cat: "muros", en: "full-height headboard wall behind the bed", spaces: ["a primary bedroom", "a boutique hotel suite"] },
  { id: "recibidor", cat: "muros", en: "entrance feature wall behind a slim console table", spaces: ["a double-height entry hall", "a quiet private foyer"] },
  { id: "recepcion", cat: "muros", en: "reception backdrop wall behind a minimalist desk", spaces: ["a boutique hotel lobby", "an architecture studio reception"] },
  { id: "comedor", cat: "muros", en: "dining room feature wall behind the table", spaces: ["a formal dining room", "an open-plan dining area"] },
  { id: "escalera", cat: "muros", en: "stairwell feature wall alongside the staircase", spaces: ["a stair hall with a timber staircase"] },
  { id: "nicho", cat: "muros", en: "niche clad in stone framing one sculptural object", spaces: ["a gallery-like corridor", "a living room"] },
  { id: "chimenea", cat: "chimeneas", en: "fireplace surround clad in thin stone with a slim metal frame around the opening", spaces: ["a cozy living room", "a library lounge", "a primary bedroom sitting area"] },
  { id: "arco", cat: "elementos", en: "arched passage lined in one continuous curve of stone", spaces: ["a gallery corridor", "a hallway between living and dining areas"] },
  { id: "columna", cat: "elementos", en: "round column clad in stone", spaces: ["a hotel lobby", "a double-height living room", "a restaurant dining room"] },
  { id: "barra-curva", cat: "curvas", en: "curved reception counter front clad in stone", spaces: ["a hotel reception", "a lounge bar"] },
  { id: "muro-curvo", cat: "curvas", en: "gently curved stone wall with a large-radius curve", spaces: ["a spa relaxation area", "an art gallery space"] },
  { id: "ducha", cat: "duchas", en: "walk-in shower back wall clad in stone", spaces: ["a primary bathroom", "a spa-like wet room"] },
  { id: "aparador", cat: "mobiliario", en: "closed sideboard with stone fronts", spaces: ["a dining room", "a living room"] },
  { id: "isla", cat: "mobiliario", en: "kitchen island front with closed stone fronts", spaces: ["a modern kitchen"] },
  { id: "vanity", cat: "mobiliario", en: "bathroom vanity with closed stone fronts", spaces: ["a powder room", "a primary bathroom"] },
  { id: "biblioteca", cat: "mobiliario", en: "built-in cabinetry with closed stone fronts", spaces: ["a home library", "a study"] },
  { id: "panel-puerta", cat: "puertas", en: "full-height closed stone door panel set flush in the wall", spaces: ["a study", "a corridor", "a bedroom"] },
  { id: "techo", cat: "techos", en: "recessed ceiling coffer clad in stone", spaces: ["a living room", "a dining room", "a hotel lobby"] },
];

export const SHOTS = [
  "straight-on symmetrical frontal view at eye level",
  "three-quarter angle view that shows the depth of the room",
  "wide establishing shot of the whole room with the stone as the hero",
  "medium shot with a styled foreground object (vase, books or lamp) softly out of focus",
  "slightly low angle that emphasises height",
  "tight composition on the stone feature with part of the furniture and one decor object",
];

export const LIGHTS = [
  "soft morning sun through sheer curtains",
  "warm golden-hour sunlight",
  "soft diffused overcast daylight",
  "warm evening ambience with lamps and wall washers",
  "gentle side light from a large window",
  "blue-hour twilight outside with a warm glowing interior",
];

// Ambiente por post: sigue siendo «quiet luxury», pero ya no es siempre beige + roble + latón.
export const MOODS = [
  { id: "neutro-calido", name: "neutros cálidos", palette: "beige, sand, travertine, cream, warm oak and brushed brass accents" },
  { id: "claro-aireado", name: "claro y aireado", palette: "soft white, pale oak, linen, light grey and satin chrome accents" },
  { id: "oscuro-envolvente", name: "oscuro y envolvente", palette: "charcoal, deep bronze, smoked oak, dark walnut and muted brass accents" },
  { id: "botanico", name: "botánico", palette: "sage green, warm white, natural wood, lush plants and matte black accents" },
  { id: "terroso", name: "terroso", palette: "terracotta, clay, sand, walnut and aged brass accents" },
  { id: "gris-sereno", name: "grises serenos", palette: "greys, slate, black steel, glass and pale concrete accents" },
  { id: "joya", name: "tonos joya", palette: "deep navy or emerald upholstery, walnut, ivory and soft gold accents" },
];

export const applicationById = new Map(APPLICATIONS.map((a) => [a.id, a]));

/** Directivas de pieza más recientes primero (de los últimos posts publicados). */
export function directiveHistory(posts, nPosts = 10) {
  return Object.values(posts)
    .filter((p) => p.status === "published" && Array.isArray(p.slides))
    .sort((a, b) => ((a.publishedAt ?? a.date) < (b.publishedAt ?? b.date) ? 1 : -1))
    .slice(0, nPosts)
    .flatMap((p) => p.slides.map((s) => s.directive))
    .filter(Boolean);
}

/**
 * Elige un elemento de `items` (cada uno con `.id` o string) penalizando lo usado hace poco.
 * field = campo de la directiva que lo guarda. Nunca usado → peso máximo; usado en las últimas `block` piezas → casi excluido.
 */
function pick(items, key, field, history, taken, r, block = 3) {
  const weights = items.map((it) => {
    const k = key(it);
    if (taken.has(k)) return 0;
    const age = history.findIndex((d) => d[field] === k);
    if (age === -1) return 6;
    return age < block ? 0.15 : Math.min(age - block + 2, 5);
  });
  // Si todo está tomado (lista corta dentro de un post), se relaja la exclusión en vez de fallar.
  const usable = weights.some((w) => w > 0) ? weights : items.map(() => 1);
  let x = r() * usable.reduce((s, w) => s + w, 0);
  for (let i = 0; i < items.length; i++) if ((x -= usable[i]) <= 0) return items[i];
  return items[items.length - 1];
}

/**
 * Una directiva por pieza: { material, appId, application, space, shot, light, moodId, moodName, palette }.
 * - `topicApps`: ids de aplicación coherentes con el tema (solo condiciona la portada).
 * - `free`: post de una idea del cliente → aplicación y espacio los pone la idea (null); el resto sí varía.
 * - `materials`: nombres de piedra permitidos; si se omite (tema de material), el material lo elige el modelo.
 */
export function chooseDirectives({ count, posts, seed, topicApps = [], free = false, materials = [] }) {
  const r = rng(`variety:${seed}`);
  const history = directiveHistory(posts);
  const mood = pick(MOODS, (m) => m.id, "moodId", history, new Set(), r, 2);
  const taken = { appId: new Set(), shot: new Set(), light: new Set(), material: new Set() };
  const out = [];
  for (let i = 0; i < count; i++) {
    let app = null, space = null;
    if (!free) {
      const pool = i === 0 && topicApps.length ? topicApps.map((id) => applicationById.get(id)).filter(Boolean) : APPLICATIONS;
      app = pick(pool.length ? pool : APPLICATIONS, (a) => a.id, "appId", [...out.slice().reverse(), ...history], taken.appId, r, 3);
      const spaceHistory = [...out.slice().reverse(), ...history];
      space = pick(app.spaces, (s) => s, "space", spaceHistory, new Set(), r, 2);
      taken.appId.add(app.id);
    }
    const shot = pick(SHOTS, (s) => s, "shot", [...out.slice().reverse(), ...history], taken.shot, r, 2);
    const light = pick(LIGHTS, (l) => l, "light", [...out.slice().reverse(), ...history], taken.light, r, 2);
    const material = materials.length ? pick(materials, (m) => m, "material", [...out.slice().reverse(), ...history], taken.material, r, 3) : null;
    taken.shot.add(shot); taken.light.add(light); if (material) taken.material.add(material);
    out.push({ material, appId: app?.id ?? null, application: app?.en ?? null, space, shot, light, moodId: mood.id, moodName: mood.name, palette: mood.palette });
  }
  return out;
}
