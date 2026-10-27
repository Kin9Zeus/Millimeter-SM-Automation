import { getAccountStats, getMediaStats } from "./meta.mjs";
import { dayLabel, fmtKind } from "./format.mjs";
import { loadState, saveState } from "./state.mjs";

// Rendimiento de las publicaciones en Instagram. El análisis es código puro (sin modelo): ranking, promedios y comparación por formato y tema.

const HOUR = 3600_000;
const CACHE_TTL = 30 * 60_000; // Meta recalcula insights con retraso; consultar más seguido solo gasta cuota
const MAX_POSTS = 30;
const MATURE_HOURS = 24; // antes de 24 h las cifras aún no cuentan toda la historia: se listan pero no entran al ranking

const when = (p) => Date.parse(p.publishedAt ?? `${p.date}T12:00:00Z`);

/** Posts publicados por el bot dentro de la ventana, del más reciente al más antiguo. */
export function selectPosts(posts, days, now = Date.now()) {
  return Object.values(posts)
    .filter((p) => p.status === "published" && p.mediaId && !p.dry && now - when(p) <= days * 24 * HOUR)
    .sort((a, b) => when(b) - when(a))
    .slice(0, MAX_POSTS);
}

/** Estadísticas de cada post, con caché de 30 min en el estado. Un post que Meta ya no devuelve (borrado) se marca como no disponible. */
export async function collectPostStats(posts, { now = Date.now(), fetchMedia = getMediaStats } = {}) {
  const s = loadState();
  s.metricsCache ??= {};
  const rows = [];
  const queue = [...posts];
  const worker = async () => {
    for (let p; (p = queue.shift()); ) {
      const hit = s.metricsCache[p.mediaId];
      if (hit && now - hit.at < CACHE_TTL) { rows.push({ post: p, stats: hit.stats }); continue; }
      try {
        const stats = await fetchMedia(p.mediaId);
        s.metricsCache[p.mediaId] = { at: now, stats };
        rows.push({ post: p, stats });
      } catch (e) {
        rows.push({ post: p, stats: null, error: e.message });
      }
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  for (const [id, v] of Object.entries(s.metricsCache)) if (now - v.at > 45 * 24 * HOUR) delete s.metricsCache[id];
  saveState();
  return rows.sort((a, b) => when(b.post) - when(a.post));
}

const sum = (rows, k) => rows.reduce((n, r) => n + (r.stats[k] ?? 0), 0);
const avg = (rows, k) => (rows.length ? sum(rows, k) / rows.length : 0);
const f1 = (n) => (Math.round(n * 10) / 10).toString().replace(/\.0$/, "");

const groupLabel = (p) => (p.topicId === "idea" || p.ideaText ? "Ideas del cliente" : p.topic);

/** Resumen: totales, mejor y peor post maduro, y comparación por formato y por tema. */
export function analyze(rows, now = Date.now()) {
  const ok = rows.filter((r) => r.stats);
  const mature = ok.filter((r) => now - when(r.post) >= MATURE_HOURS * HOUR && r.stats.reach != null);
  const ranked = [...mature].sort((a, b) => b.stats.reach - a.stats.reach || (b.stats.interactions ?? 0) - (a.stats.interactions ?? 0));

  const groups = (keyFn) => {
    const m = new Map();
    for (const r of mature) m.set(keyFn(r.post), [...(m.get(keyFn(r.post)) ?? []), r]);
    return [...m].map(([key, list]) => ({ key, n: list.length, reach: avg(list, "reach"), interactions: avg(list, "interactions") })).sort((a, b) => b.reach - a.reach);
  };

  return {
    total: rows.length,
    unavailable: rows.filter((r) => !r.stats).length,
    young: ok.length - mature.length,
    matureCount: mature.length,
    insightsMissing: ok.length > 0 && ok.every((r) => r.stats.reach == null),
    insightsError: ok.find((r) => r.stats.insightsError)?.stats.insightsError ?? null,
    likes: sum(ok, "likes"), comments: sum(ok, "comments"),
    avg: { reach: avg(mature, "reach"), saved: avg(mature, "saved"), shares: avg(mature, "shares"), interactions: avg(mature, "interactions"), views: avg(mature, "views") },
    engagement: sum(mature, "reach") ? (sum(mature, "interactions") / sum(mature, "reach")) * 100 : null,
    best: ranked[0] ?? null,
    worst: ranked.length >= 3 ? ranked[ranked.length - 1] : null,
    byFormat: groups((p) => (p.format === "single" ? "Imagen única" : "Carrusel")),
    byTopic: groups(groupLabel),
  };
}

const line = (r) => `${dayLabel(r.post.date)} · ${fmtKind(r.post)} · alcance ${r.stats.reach} · guardados ${r.stats.saved ?? 0} · compartidos ${r.stats.shares ?? 0} · interacciones ${r.stats.interactions ?? 0}\n  «${(r.post.coverTitle ?? r.post.topic ?? "").slice(0, 70)}»\n  ${r.post.permalink ?? ""}`;

export function formatMetrics({ days, account, accountError, a }) {
  const L = [`📈 Métricas · últimos ${days} días`];
  if (account) {
    const bits = [`${account.followers} seguidores`];
    if (account.reach != null) bits.push(`alcance ${account.reach}`);
    if (account.views != null) bits.push(`vistas ${account.views}`);
    if (account.profileViews != null) bits.push(`visitas al perfil ${account.profileViews}`);
    if (account.accountsEngaged != null) bits.push(`cuentas que interactuaron ${account.accountsEngaged}`);
    L.push(`Cuenta @${account.username}: ${bits.join(" · ")}`);
  } else if (accountError) L.push(`Cuenta: no pude consultarla (${accountError.slice(0, 120)}).`);

  if (!a.total) return [...L, "\nNo hay publicaciones del bot en ese periodo."].join("\n");
  L.push(`\nPublicaciones: ${a.total} (❤️ ${a.likes} · 💬 ${a.comments} en total)`);

  if (a.insightsMissing) {
    L.push(`⚠️ Instagram no entregó alcance ni guardados${a.insightsError ? `: ${a.insightsError.slice(0, 160)}` : ""}. Si es un tema de permisos, hay que generar el token con el permiso de insights (instagram_business_manage_insights).`);
    return L.join("\n");
  }
  if (!a.matureCount) {
    L.push(`Aún no hay publicaciones con más de ${MATURE_HOURS} h para comparar (las cifras todavía están madurando).`);
    return L.join("\n");
  }

  L.push(`\nPromedio por publicación (${a.matureCount} con más de ${MATURE_HOURS} h):`);
  L.push(`  alcance ${f1(a.avg.reach)} · vistas ${f1(a.avg.views)} · guardados ${f1(a.avg.saved)} · compartidos ${f1(a.avg.shares)} · interacciones ${f1(a.avg.interactions)}${a.engagement != null ? ` (${f1(a.engagement)} % del alcance)` : ""}`);
  if (a.best) L.push(`\n🏆 Mejor\n${line(a.best)}`);
  if (a.worst && a.worst !== a.best) L.push(`\n🔻 Más bajo\n${line(a.worst)}`);

  if (a.byFormat.length > 1) L.push(`\nPor formato (alcance medio): ${a.byFormat.map((g) => `${g.key} ${f1(g.reach)} (${g.n})`).join(" · ")}`);
  const topics = a.byTopic.filter((g) => g.n >= 1);
  if (topics.length > 1) L.push(`Por tema (alcance medio, nº de posts): ${topics.slice(0, 3).map((g) => `${g.key.slice(0, 40)} ${f1(g.reach)} (${g.n})`).join(" · ")}`);

  if (a.young) L.push(`\n(${a.young} publicación(es) de las últimas ${MATURE_HOURS} h no entran en el ranking: sus cifras aún se están completando.)`);
  if (a.unavailable) L.push(`(${a.unavailable} no se pudo(ieron) consultar; puede que se haya(n) borrado en Instagram.)`);
  if (a.matureCount < 10) L.push(`\nOjo: son pocas publicaciones; tómalo como tendencia, no como veredicto.`);
  return L.join("\n");
}

/** Consulta completa: cuenta + posts. Cada parte falla por separado y se informa. */
export async function metricsReport(days, { now = Date.now(), fetchAccount = getAccountStats, fetchMedia } = {}) {
  let account = null, accountError = null;
  try { account = await fetchAccount(days); } catch (e) { accountError = e.message; }
  const posts = selectPosts(loadState().posts, days, now);
  const rows = await collectPostStats(posts, { now, fetchMedia });
  return formatMetrics({ days, account, accountError, a: analyze(rows, now) });
}
