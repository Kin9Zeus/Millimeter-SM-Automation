import { FLIPPABLE, THEMED, THEME_IDS } from "./compose.mjs";
import { rng } from "./design.mjs";

// Variedad visual y editorial DETERMINISTA. El modelo de lenguaje tiende a repetir «salón con roble y latón, plano frontal» y los mismos
// ganchos de texto; por eso la aplicación, el espacio, el plano, la luz, el ambiente, la arquitectura, el decorado, la estructura editorial
// y el aspecto gráfico (color y espejo) se eligen aquí, evitando lo usado en los últimos posts, y el modelo solo completa los detalles.
// Todas las aplicaciones salen de las ocho oficiales (hecho app-1); no se inventa ninguna.
//
// Reglas de realismo que todo elemento del catálogo debe respetar: frentes y puertas CERRADOS, ningún canto ni espesor visible,
// ninguna otra superficie de piedra en la escena (suelo, techo y muros restantes son madera o yeso), sin personas.

export const APPLICATIONS = [
  // ---- Muros decorativos ----
  { id: "tv-wall", cat: "muros", en: "feature wall behind a low media console", spaces: ["a calm family living room", "a spacious lounge with large windows"] },
  { id: "cabecero", cat: "muros", en: "full-height headboard wall behind the bed", spaces: ["a primary bedroom", "a boutique hotel suite"] },
  { id: "recibidor", cat: "muros", en: "entrance feature wall behind a slim console table", spaces: ["a double-height entry hall", "a quiet private foyer"] },
  { id: "recepcion", cat: "muros", en: "reception backdrop wall behind a minimalist desk", spaces: ["a boutique hotel lobby", "an architecture studio reception"] },
  { id: "comedor", cat: "muros", en: "dining room feature wall behind the table", spaces: ["a formal dining room", "an open-plan dining area"] },
  { id: "escalera", cat: "muros", en: "stairwell feature wall alongside the staircase", spaces: ["a stair hall with a timber staircase"] },
  { id: "nicho", cat: "muros", en: "niche clad in stone framing one sculptural object", spaces: ["a gallery-like corridor", "a living room"] },
  { id: "sofa-wall", cat: "muros", en: "feature wall behind a large sofa", spaces: ["a spacious living room", "a quiet lounge"] },
  { id: "bano-banera", cat: "muros", en: "feature wall behind a freestanding bathtub", spaces: ["a spa-like bathroom", "a primary bathroom"] },
  { id: "escritorio", cat: "muros", en: "feature wall behind a work desk", spaces: ["a home office", "a design studio"] },
  { id: "bar-trasera", cat: "muros", en: "back wall of a bar behind slim floating shelves", spaces: ["a lounge bar", "a hotel restaurant"] },
  { id: "banqueta", cat: "muros", en: "wall behind a restaurant banquette", spaces: ["a restaurant dining room", "a hotel brasserie"] },
  { id: "pasillo-galeria", cat: "muros", en: "long gallery wall running along a corridor", spaces: ["a gallery corridor", "a hotel corridor"] },
  { id: "ascensor", cat: "muros", en: "elevator lobby feature wall", spaces: ["a residential elevator lobby", "a hotel elevator lobby"] },
  { id: "boutique", cat: "muros", en: "display wall of a high-end boutique", spaces: ["a luxury boutique", "a design showroom"] },
  { id: "vestidor", cat: "muros", en: "end wall of a walk-in dressing room", spaces: ["a walk-in dressing room"] },
  { id: "ventana-flanco", cat: "muros", en: "wall flanking a large floor-to-ceiling window", spaces: ["a living room with floor-to-ceiling windows", "a quiet library"] },
  { id: "cocina-muro", cat: "muros", en: "kitchen wall running up to the ceiling behind the worktop", spaces: ["a modern kitchen"] },
  { id: "lavabo-muro", cat: "muros", en: "wall behind a sculptural basin", spaces: ["a powder room", "a guest bathroom"] },
  // ---- Chimeneas ----
  { id: "chimenea", cat: "chimeneas", en: "fireplace surround clad in thin stone with a slim metal frame around the opening", spaces: ["a cozy living room", "a library lounge", "a primary bedroom sitting area"] },
  { id: "chimenea-lineal", cat: "chimeneas", en: "wide linear fireplace wall with a slim metal frame around a long low opening", spaces: ["a modern living room", "a hotel lounge"] },
  { id: "chimenea-esquina", cat: "chimeneas", en: "corner fireplace surround clad in thin stone", spaces: ["a cozy reading corner", "a primary bedroom sitting area"] },
  { id: "chimenea-altura", cat: "chimeneas", en: "floor-to-ceiling chimney breast clad in thin stone", spaces: ["a double-height living room", "a great room with high ceilings"] },
  // ---- Elementos arquitectónicos ----
  { id: "arco", cat: "elementos", en: "arched passage lined in one continuous curve of stone", spaces: ["a gallery corridor", "a hallway between living and dining areas"] },
  { id: "columna", cat: "elementos", en: "round column clad in stone", spaces: ["a hotel lobby", "a double-height living room", "a restaurant dining room"] },
  { id: "arco-nicho", cat: "elementos", en: "arched niche clad in one continuous curve of stone, framing a single object", spaces: ["a hallway", "a living room"] },
  { id: "pilares-par", cat: "elementos", en: "pair of round columns clad in stone flanking an opening", spaces: ["a hotel lobby", "a grand living room"] },
  // ---- Superficies curvas ----
  { id: "barra-curva", cat: "curvas", en: "curved reception counter front clad in stone", spaces: ["a hotel reception", "a lounge bar"] },
  { id: "muro-curvo", cat: "curvas", en: "gently curved stone wall with a large-radius curve", spaces: ["a spa relaxation area", "an art gallery space"] },
  { id: "bar-curvo", cat: "curvas", en: "curved bar counter front clad in stone", spaces: ["a hotel bar", "a cocktail lounge"] },
  { id: "nicho-curvo", cat: "curvas", en: "concave curved niche wall clad in stone", spaces: ["an art gallery space", "a living room"] },
  { id: "cabecero-curvo", cat: "curvas", en: "softly curved headboard wall clad in stone", spaces: ["a boutique hotel suite", "a primary bedroom"] },
  { id: "escalera-curva", cat: "curvas", en: "curved stone wall following a sweeping staircase", spaces: ["a stair hall with a timber staircase", "a hotel lobby with a staircase"] },
  // ---- Grandes duchas ----
  { id: "ducha", cat: "duchas", en: "walk-in shower back wall clad in stone", spaces: ["a primary bathroom", "a spa-like wet room"] },
  { id: "ducha-nicho", cat: "duchas", en: "walk-in shower wall with a recessed shelf niche, all clad in stone", spaces: ["a primary bathroom", "a luxury wet room"] },
  { id: "ducha-doble", cat: "duchas", en: "large double shower enclosure with the back wall clad in stone", spaces: ["a luxury primary bathroom"] },
  // ---- Mobiliario a medida ----
  { id: "aparador", cat: "mobiliario", en: "closed sideboard with stone fronts", spaces: ["a dining room", "a living room"] },
  { id: "isla", cat: "mobiliario", en: "kitchen island front with closed stone fronts", spaces: ["a modern kitchen"] },
  { id: "vanity", cat: "mobiliario", en: "bathroom vanity with closed stone fronts", spaces: ["a powder room", "a primary bathroom"] },
  { id: "biblioteca", cat: "mobiliario", en: "built-in cabinetry with closed stone fronts", spaces: ["a home library", "a study"] },
  { id: "consola", cat: "mobiliario", en: "console cabinet with closed stone fronts", spaces: ["an entry hall", "a long hallway"] },
  { id: "mesitas", cat: "mobiliario", en: "pair of bedside cabinets with closed stone fronts", spaces: ["a primary bedroom"] },
  { id: "mueble-bar", cat: "mobiliario", en: "bar cabinet with closed stone fronts", spaces: ["a lounge", "a dining room"] },
  { id: "armario", cat: "mobiliario", en: "full-height wardrobe wall with closed stone doors", spaces: ["a bedroom", "a dressing room"] },
  { id: "mueble-tv", cat: "mobiliario", en: "low media unit with closed stone fronts", spaces: ["a living room"] },
  { id: "despensa", cat: "mobiliario", en: "tall pantry wall of closed stone cabinet fronts", spaces: ["a modern kitchen"] },
  // ---- Puertas y paneles ----
  { id: "panel-puerta", cat: "puertas", en: "full-height closed stone door panel set flush in the wall", spaces: ["a study", "a corridor", "a bedroom"] },
  { id: "puerta-doble", cat: "puertas", en: "pair of closed full-height stone doors set flush in the wall", spaces: ["a grand foyer", "a study"] },
  // ---- Techos ----
  { id: "techo", cat: "techos", en: "recessed ceiling coffer clad in stone", spaces: ["a living room", "a dining room", "a hotel lobby"] },
  { id: "techo-comedor", cat: "techos", en: "stone ceiling feature panel above the dining table", spaces: ["a dining room"] },
  { id: "techo-recepcion", cat: "techos", en: "stone ceiling feature above a reception desk", spaces: ["a hotel lobby", "a boutique reception"] },
  { id: "techo-curvo", cat: "techos", en: "gently curved stone ceiling vault", spaces: ["a hallway", "a spa lounge"] },
];

export const SHOTS = [
  "straight-on symmetrical frontal view at eye level",
  "three-quarter angle view that shows the depth of the room",
  "wide establishing shot of the whole room with the stone as the hero",
  "medium shot with a styled foreground object (vase, books or lamp) softly out of focus",
  "slightly low angle that emphasises height",
  "tight composition on the stone feature with part of the furniture and one decor object",
  "corner view looking diagonally across the room with strong perspective",
  "elevated three-quarter view from a few steps up, looking slightly down at the room",
  "long one-point perspective toward the stone feature at the end of the room",
  "close detail shot where the stone meets the floor line and one piece of furniture, shallow depth of field",
  "view through a doorway that frames the stone feature",
  "wide symmetrical shot with generous negative space around the stone feature",
  "side view along the stone surface so the light travels across its veining",
  "medium-wide shot from slightly to the side with a plant in the foreground",
  "low-height shot near seat level that shows the furniture and the stone together",
  "centered medium shot with the furniture in sharp focus and the stone softly graded by light",
];

export const LIGHTS = [
  "soft morning sun through sheer curtains",
  "warm golden-hour sunlight",
  "soft diffused overcast daylight",
  "warm evening ambience with lamps and wall washers",
  "gentle side light from a large window",
  "blue-hour twilight outside with a warm glowing interior",
  "dramatic grazing light from a window that reveals the veining and texture of the stone",
  "soft candlelight and warm lamp glow in a dim evening room",
  "bright midday light filtered by a linen blind",
  "late-afternoon sun casting long soft shadows across the floor",
  "cool north-facing daylight, calm and neutral",
  "warm sunset glow through large glass doors",
  "dappled light from a tree outside the window",
  "recessed downlights washing the wall from above at night",
];

// Ambiente por post: sigue siendo «quiet luxury», pero ya no es siempre beige + roble + latón. `style` se añade al prompt de imagen.
export const MOODS = [
  { id: "neutro-calido", name: "neutros cálidos", style: "quiet-luxury contemporary", palette: "beige, sand, travertine, cream, warm oak and brushed brass accents" },
  { id: "claro-aireado", name: "claro y aireado", style: "airy Scandinavian-inspired minimalism", palette: "soft white, pale oak, linen, light grey and satin chrome accents" },
  { id: "oscuro-envolvente", name: "oscuro y envolvente", style: "moody dark contemporary", palette: "charcoal, deep bronze, smoked oak, dark walnut and muted brass accents" },
  { id: "botanico", name: "botánico", style: "biophilic modern", palette: "sage green, warm white, natural wood, lush plants and matte black accents" },
  { id: "terroso", name: "terroso", style: "warm earthy modern", palette: "terracotta, clay, sand, walnut and aged brass accents" },
  { id: "gris-sereno", name: "grises serenos", style: "urban gallery minimalism", palette: "greys, slate, black steel, glass and pale concrete accents" },
  { id: "joya", name: "tonos joya", style: "classic-contemporary", palette: "deep navy or emerald upholstery, walnut, ivory and soft gold accents" },
  { id: "japandi", name: "japandi", style: "calm Japandi minimalism", palette: "pale ash wood, warm white, charcoal black, natural linen and paper lamp accents" },
  { id: "blanco-monocromo", name: "blanco monocromo", style: "monochrome white gallery", palette: "ivory, bone white, pale plaster, translucent glass and polished nickel accents" },
  { id: "chocolate", name: "marrones profundos", style: "rich warm modern", palette: "espresso brown, caramel leather, cream and smoked bronze accents" },
  { id: "azul-petroleo", name: "azul petróleo", style: "deep teal modern", palette: "deep teal, ink blue, warm oak, ivory and brass accents" },
  { id: "rosa-polvo", name: "rosa empolvado", style: "soft blush contemporary", palette: "dusty blush, warm white, pale oak and champagne gold accents" },
  { id: "verde-oliva", name: "verde oliva", style: "olive and linen modern", palette: "olive green, sand-coloured linen, walnut and black iron accents" },
  { id: "art-deco-suave", name: "art déco suave", style: "soft art deco", palette: "ivory, black lacquer, champagne brass and deep burgundy velvet accents" },
  { id: "industrial-refinado", name: "industrial refinado", style: "refined industrial loft", palette: "raw steel, smoked glass, warm oak, charcoal and cognac leather accents" },
  { id: "rustico-contemporaneo", name: "rústico contemporáneo", style: "contemporary rustic", palette: "weathered oak, plaster, wool, wrought iron, terracotta and straw accents" },
];

// Arquitectura del post (una por post: las piezas de un carrusel comparten lenguaje arquitectónico). `key` es una palabra distintiva.
export const ARCHITECTURES = [
  { id: "mediterranea", key: "Mediterranean", en: "Mediterranean villa architecture with thick whitewashed plaster walls and arched openings" },
  { id: "colonial", key: "colonial", en: "restored colonial house with whitewashed plaster walls, high ceilings and exposed timber beams" },
  { id: "brutalista", key: "brutalist", en: "soft brutalist architecture with board-formed concrete and deep openings" },
  { id: "loft", key: "loft", en: "converted industrial loft with steel-framed windows and tall ceilings" },
  { id: "preguerra", key: "prewar", en: "classic prewar apartment with tall ceilings, mouldings and herringbone floors" },
  { id: "tropical", key: "tropical", en: "tropical modern house with deep eaves, timber screens and garden views" },
  { id: "montana", key: "mountain", en: "mountain retreat with timber beams and panoramic windows" },
  { id: "costera", key: "coastal", en: "coastal modern house flooded with sea light and pale timber" },
  { id: "vidrio", key: "modernist", en: "modernist glass-and-steel house with floor-to-ceiling windows" },
  { id: "penthouse", key: "penthouse", en: "high-rise penthouse with skyline views and clean white ceilings" },
  { id: "hotel", key: "boutique hotel", en: "boutique hotel interior with custom millwork and layered lighting" },
  { id: "japonesa", key: "Japanese", en: "Japanese-inspired minimal architecture with timber slats and soft partitions" },
  { id: "hacienda", key: "hacienda", en: "Latin American hacienda-style house with a courtyard, clay floors and timber doors" },
  { id: "deco", key: "art deco", en: "art deco building with elegant geometric detailing" },
  { id: "tierra", key: "rammed-earth", en: "desert modern house with rammed-earth walls and warm light" },
];

// Objetos de decorado (por pieza). Se AÑADEN a la escena por código; ninguno es de piedra (la piedra solo está en la aplicación).
export const DECOR = [
  "a sculptural ceramic vase with dried branches",
  "a stack of art books with a small bronze bowl",
  "a tall leafy plant in a terracotta pot",
  "an arc floor lamp with a linen shade",
  "a pair of low lounge chairs in boucle fabric",
  "a bouquet of white flowers in a glass vase",
  "a round oak side table with a ceramic lamp",
  "a leather armchair with a wool throw",
  "a large framed abstract artwork leaning on the floor",
  "a woven pendant lamp",
  "a bench with wool cushions",
  "a pair of brass candlesticks and a small tray",
  "an olive tree in a clay pot",
  "a wooden sculpture on a timber plinth",
  "sheer linen curtains moving slightly",
  "a glass carafe and two glasses on a wooden tray",
];

/** Estructuras editoriales (cómo se cuenta la idea). `topics`: tipos de tema donde tiene sentido; vacío = cualquiera. */
export const NARRATIVES = [
  { id: "pregunta", name: "Pregunta y respuesta", rule: "La portada plantea una pregunta concreta (titular en forma de pregunta o gancho que la formule) y el resto de piezas y el caption la responden con datos de la base.", topics: [], free: true },
  { id: "dato", name: "Un dato protagonista", rule: "Abre con UNA cifra de la base como gancho (en el titular o en el dato grande) y construye todo el post alrededor de ese número.", topics: ["dato", "peso", "huella", "salud", "concepto"], free: false },
  { id: "contraste", name: "Antes y después", rule: "Contrasta cómo se hacía con piedra tradicional (2–3 cm, pesada, instalación lenta) con lo que permite MILLIMETER; la portada plantea el contraste.", topics: ["dato", "concepto", "aplicacion", "huella"], free: false },
  { id: "afirmacion", name: "Afirmación breve", rule: "Titulares muy cortos y rotundos (máx. 3–4 palabras por línea) y subtítulos mínimos: menos texto, más imagen.", topics: [], free: true },
  { id: "invitacion", name: "Invitación al profesional", rule: "Háblale directamente al arquitecto o diseñador («tú»): qué puede proyectar ahora; la portada abre con una invitación a imaginar o a proyectar.", topics: [], free: true },
  { id: "escena", name: "La escena habla", rule: "Una sola idea visual: el titular describe lo que se ve (el espacio, el gesto) y el subtítulo lo respalda con un dato; poco texto.", topics: ["aplicacion", "material", "concepto"], free: true },
  { id: "mito", name: "Creencia y realidad", rule: "Plantea una creencia común sobre la piedra natural que la base desmiente (demasiado pesada, imposible de curvar, instalación lenta y costosa) y respóndela con los hechos. No inventes creencias que la base no respalde.", topics: ["dato", "concepto", "aplicacion"], needsFact: "problema-1", free: false },
  { id: "detalle", name: "Detalle constructivo", rule: "Céntrate en un detalle técnico concreto de la base (espesor, peso por m², herrajes, planos) explicado con claridad para un profesional.", topics: ["dato", "aplicacion", "contacto"], free: false },
  { id: "proceso", name: "Cómo trabajamos", rule: "Cuenta el recorrido del cliente solo con los hechos de contacto: nos cuentas qué diseñas, un arquitecto revisa el detalle constructivo y la respuesta llega en menos de 24 h hábiles.", topics: ["contacto"], free: false },
  { id: "comparativa", name: "Cifras frente a frente", rule: "Pon dos cifras de la base frente a frente (por ejemplo el peso de la piedra tradicional y el de MILLIMETER) en el titular y el dato grande.", topics: ["dato", "peso"], needsFact: "peso-1", free: false },
];

export const applicationById = new Map(APPLICATIONS.map((a) => [a.id, a]));
export const narrativeById = new Map(NARRATIVES.map((n) => [n.id, n]));

/** Directivas de pieza más recientes primero (de los últimos posts publicados). */
export function directiveHistory(posts, nPosts = 10) {
  return recentPublished(posts, nPosts).flatMap((p) => p.slides.map((s) => s.directive)).filter(Boolean);
}

const recentPublished = (posts, n) => Object.values(posts)
  .filter((p) => p.status === "published" && Array.isArray(p.slides))
  .sort((a, b) => ((a.publishedAt ?? a.date) < (b.publishedAt ?? b.date) ? 1 : -1))
  .slice(0, n);

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
 * Una directiva por pieza: { material, appId, application, space, shot, light, decor, moodId, moodName, style, palette, archId, arch, archKey }.
 * - `topicApps`: ids de aplicación coherentes con el tema (solo condiciona la portada).
 * - `free`: post de una idea del cliente → aplicación, espacio y arquitectura los pone la idea (null); el resto sí varía.
 * - `materials`: nombres de piedra permitidos; si se omite (tema de material), el material lo elige el modelo.
 */
export function chooseDirectives({ count, posts, seed, topicApps = [], free = false, materials = [] }) {
  const r = rng(`variety:${seed}`);
  const history = directiveHistory(posts);
  const mood = pick(MOODS, (m) => m.id, "moodId", history, new Set(), r, 3);
  const arch = free ? null : pick(ARCHITECTURES, (a) => a.id, "archId", history, new Set(), r, 3);
  const taken = { appId: new Set(), shot: new Set(), light: new Set(), material: new Set(), decor: new Set() };
  const out = [];
  for (let i = 0; i < count; i++) {
    const past = [...out.slice().reverse(), ...history];
    let app = null, space = null;
    if (!free) {
      // Con tema, TODAS las piezas salen primero de las aplicaciones del tema (un post de baños muestra baños); agotadas, se completa con el resto.
      const own = topicApps.map((id) => applicationById.get(id)).filter((a) => a && !taken.appId.has(a.id));
      const pool = own.length ? own : APPLICATIONS;
      app = pick(pool, (a) => a.id, "appId", past, taken.appId, r, 5);
      space = pick(app.spaces, (s) => s, "space", past, new Set(), r, 2);
      taken.appId.add(app.id);
    }
    const shot = pick(SHOTS, (s) => s, "shot", past, taken.shot, r, 4);
    const light = pick(LIGHTS, (l) => l, "light", past, taken.light, r, 4);
    const decor = pick(DECOR, (d) => d, "decor", past, taken.decor, r, 4);
    const material = materials.length ? pick(materials, (m) => m, "material", past, taken.material, r, 3) : null;
    taken.shot.add(shot); taken.light.add(light); taken.decor.add(decor); if (material) taken.material.add(material);
    out.push({
      material, appId: app?.id ?? null, application: app?.en ?? null, space, shot, light, decor,
      moodId: mood.id, moodName: mood.name, style: mood.style, palette: mood.palette,
      archId: arch?.id ?? null, arch: arch?.en ?? null, archKey: arch?.key ?? null,
    });
  }
  return out;
}

/** Estructura editorial del post: evita las usadas en los últimos 6 posts y respeta qué estructuras tienen sentido para el tema. */
export function chooseNarrative({ topic, posts, seed, free = false }) {
  const r = rng(`narrative:${seed}`);
  const eligible = NARRATIVES.filter((n) => {
    if (free) return n.free;
    if (n.topics.length && !n.topics.includes(topic.tipo)) return false;
    if (n.needsFact && !(topic.facts ?? []).includes(n.needsFact)) return false;
    return true;
  });
  const history = recentPublished(posts, 6).map((p) => ({ narrativeId: p.narrativeId }));
  return pick(eligible.length ? eligible : NARRATIVES.filter((n) => n.free), (n) => n.id, "narrativeId", history, new Set(), r, 2);
}

/**
 * Aspecto gráfico de cada pieza dentro de la paleta de marca: tema de color (crema, lino, arena, travertino, café, café profundo) y espejo.
 * Evita los temas usados en las últimas piezas y que dos piezas seguidas del mismo post repitan tema.
 */
const THEME_WEIGHTS = {
  default: { cream: 3, linen: 2, sand: 2.5, travertine: 1.5, carbon: 1.5, deep: 1 },
  D: { carbon: 3, deep: 1.5, cream: 1.5, sand: 1.5, linen: 1, travertine: 1 },
  G: { carbon: 3, deep: 2, sand: 1.5, cream: 1.5, linen: 1, travertine: 1 },
};
export function chooseLooks(layouts, posts, seed) {
  const r = rng(`look:${seed}`);
  const history = recentPublished(posts, 8).flatMap((p) => p.slides.map((s) => s.look?.theme)).filter(Boolean);
  const out = [];
  for (const layout of layouts) {
    if (!THEMED.has(layout)) { out.push({ theme: null, flip: false }); continue; }
    const base = THEME_WEIGHTS[layout] ?? THEME_WEIGHTS.default;
    const prev = out.filter((l) => l.theme).at(-1)?.theme;
    const weights = THEME_IDS.map((id) => {
      const age = history.indexOf(id);
      const recency = age === -1 ? 1 : age < 3 ? 0.25 : age < 6 ? 0.6 : 1;
      return (base[id] ?? 1) * recency * (id === prev ? 0.15 : 1);
    });
    let x = r() * weights.reduce((s, w) => s + w, 0);
    let theme = THEME_IDS[THEME_IDS.length - 1];
    for (let i = 0; i < THEME_IDS.length; i++) if ((x -= weights[i]) <= 0) { theme = THEME_IDS[i]; break; }
    out.push({ theme, flip: FLIPPABLE.has(layout) ? r() < 0.5 : false });
  }
  return out;
}

