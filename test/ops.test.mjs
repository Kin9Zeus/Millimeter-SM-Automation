import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Comandos de operación: /semana /cambiar /metricas /gasto /salud.
process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "mm-bot-ops-"));
process.env.TELEGRAM_LINK_CODE = "codigo-secreto-123";
process.env.TELEGRAM_BOT_TOKEN = "";
process.env.PAUSED = "false";
process.env.PUBLIC_BASE_URL = "https://ejemplo.test";
process.env.GEMINI_API_KEY = "x";
process.env.META_ACCESS_TOKEN = "x";

const { cfg, localParts } = await import("../src/config.mjs");
const { handleMessage, _setReply } = await import("../src/commands.mjs");
const { addIdea, ideaForDate, listIdeas, loadState, saveState, updatePost } = await import("../src/state.mjs");
const { addDays, dayLabel } = await import("../src/format.mjs");
const { upcomingDays, firstOpenDate } = await import("../src/agenda.mjs");
const { budgetAlert, recordUsage, spendReport, formatSpend } = await import("../src/spend.mjs");
const { analyze, collectPostStats, formatMetrics, metricsReport, selectPosts } = await import("../src/metrics.mjs");
const { collectHealth, defaultProbes, formatHealth } = await import("../src/health.mjs");
const { getMediaStats, MetaError } = await import("../src/meta.mjs");
const { markTick } = await import("../src/runtime.mjs");

const sent = [];
_setReply(async (chatId, text) => { sent.push(text); });
const say = async (text) => {
  sent.length = 0;
  await handleMessage({ chat: { id: 7, type: "private" }, from: { first_name: "Cliente" }, text });
  return sent.join("\n");
};
await say("/vincular codigo-secreto-123");

const today = localParts().date;
const NOW = Date.parse("2026-10-27T20:00:00Z");

// ---------- Ideas con fecha ----------
test("ideaForDate: la fijada manda sobre la cola; la vencida pasa a ser genérica", () => {
  const q = [
    { id: "a", text: "general", at: "x" },
    { id: "b", text: "fijada", at: "x", forDate: "2026-11-02" },
    { id: "c", text: "vencida", at: "x", forDate: "2026-10-01" },
  ];
  assert.equal(ideaForDate("2026-11-02", q).id, "b");
  assert.equal(ideaForDate("2026-11-03", q).id, "a");
  assert.equal(ideaForDate("2026-11-03", [q[1], q[2]]).id, "b", "una fijada que ya pasó se usa como genérica, en orden");
  assert.equal(ideaForDate("2026-11-03", [q[2]]).id, "c");
  assert.equal(ideaForDate("2026-11-01", [q[1]]), null);
});

// ---------- /semana ----------
test("la agenda tiene 7 días consecutivos, cada uno con tema o idea, y empieza hoy si no se ha publicado", () => {
  const days = upcomingDays({ n: 7 });
  assert.equal(days.length, 7);
  assert.equal(days[0].date, today);
  days.forEach((d, i) => { assert.equal(d.date, addDays(today, i)); assert.ok(d.topic || d.idea); assert.ok(d.count >= 1 && d.count <= 6); });
  assert.equal(new Set(days.map((d) => d.topicId)).size, 7, "no repite tema en la semana");
});

test("si hoy ya se publicó, la agenda empieza mañana", () => {
  updatePost(today, { status: "published", topicId: "espesores", topic: "x", mediaId: "1" });
  assert.equal(firstOpenDate(), addDays(today, 1));
  assert.equal(upcomingDays({ n: 1 })[0].date, addDays(today, 1));
});

test("la vista previa coincide con lo que decidirá el pipeline día a día", () => {
  const state = loadState();
  const before = upcomingDays({ n: 3 });
  // «Se publica» el primer día con el tema previsto: la agenda que arranca el día siguiente debe ser exactamente la ya anunciada.
  const published = { ...state, posts: { ...state.posts, [before[0].date]: { date: before[0].date, status: "published", topicId: before[0].topicId, topic: before[0].topic, mediaId: "2" } } };
  const after = upcomingDays({ n: 2, state: published, from: before[1].date });
  assert.equal(after[0].topicId, before[1].topicId);
  assert.equal(after[0].count, before[1].count);
  assert.equal(after[1].topicId, before[2].topicId);
  assert.equal(after[1].count, before[2].count);
});

test("/semana y /cambiar: fijar, reemplazar y volver al tema automático", async () => {
  const out = await say("/semana");
  assert.match(out, /Próximos 7 días/);
  assert.match(out, /^1\. /m);

  const day2 = upcomingDays()[1];
  assert.match(await say("/cambiar 2"), /Formato/);
  assert.match(await say("/cambiar 9 Un post sobre duchas amplias con poca junta"), /entre 1 y 7/);
  assert.match(await say("/cambiar 2 corta"), /entre 10 y 400/);

  assert.match(await say("/cambiar 2 Un post sobre duchas amplias con poca junta"), /Idea fijada para/);
  assert.equal(listIdeas().find((i) => i.forDate === day2.date)?.text, "Un post sobre duchas amplias con poca junta");
  assert.match(await say("/semana"), /idea fijada: «Un post sobre duchas/);
  assert.match(await say("/ideas"), /fijada para/);

  // Reemplazo: sigue habiendo una sola idea fijada para ese día.
  await say("/cambiar 2 Otra idea distinta sobre chimeneas de piedra natural");
  assert.equal(listIdeas().filter((i) => i.forDate === day2.date).length, 1);
  assert.match(listIdeas().find((i) => i.forDate === day2.date).text, /chimeneas/);

  assert.match(await say("/cambiar 2 auto"), /vuelve al tema automático/);
  assert.equal(listIdeas().length, 0);
  assert.match(await say("/cambiar 2 auto"), /ya usa un tema automático/);
});

test("una idea de la cola sin fecha ocupa el primer día y /cambiar la desplaza al siguiente", async () => {
  addIdea("Idea general sobre mobiliario con piedra natural", "t");
  const first = upcomingDays()[0];
  assert.equal(first.idea.text, "Idea general sobre mobiliario con piedra natural");
  assert.match(await say("/cambiar 1 auto"), /\/borrar_idea 1/);
  assert.match(await say("/cambiar 1 Idea fijada sobre una cocina con piedra natural"), /pasa al siguiente día libre/);
  const days = upcomingDays();
  assert.match(days[0].idea.text, /cocina/);
  assert.match(days[1].idea.text, /mobiliario/);
  for (const i of listIdeas()) await say("/borrar_idea 1");
  assert.equal(listIdeas().length, 0);
});

// ---------- /gasto ----------
test("el gasto suma imágenes de los posts y llamadas del libro diario; avisa al 80 % y 100 % del presupuesto", () => {
  const month = today.slice(0, 7);
  updatePost(`${month}-01`, { date: `${month}-01`, imageGenerations: 10, status: "published" });
  recordUsage("text", `${month}-01`);
  recordUsage("inspect", `${month}-01`);
  recordUsage("inspect", `${month}-01`);
  const r = spendReport();
  const expectedDay = 10 * cfg.pricing.imageUsd + cfg.pricing.textCallUsd + 2 * cfg.pricing.inspectCallUsd;
  assert.ok(r.month.usd >= expectedDay - 1e-9);
  assert.ok(r.month.projectedUsd >= r.month.usd);
  assert.equal(r.budget, null);
  assert.equal(budgetAlert(r), null);

  cfg.monthlyBudgetUsd = r.month.usd / 0.85;
  assert.match(budgetAlert(spendReport()).text, /8\d %/);
  assert.equal(budgetAlert(spendReport()).key, `gasto-80-${month}`);
  cfg.monthlyBudgetUsd = r.month.usd / 1.2;
  assert.equal(budgetAlert(spendReport()).key, `gasto-100-${month}`);
  cfg.monthlyBudgetUsd = r.month.usd * 10;
  assert.equal(budgetAlert(spendReport()), null);
  cfg.monthlyBudgetUsd = 0;
});

test("/gasto muestra hoy, mes, proyección y últimos 7 días", async () => {
  const out = await say("/gasto");
  assert.match(out, /Gasto estimado de Gemini/);
  assert.match(out, /Hoy \(/);
  assert.match(out, /Proyección a fin de mes/);
  assert.match(out, /Últimos 7 días/);
  assert.match(formatSpend(spendReport()), /Sin presupuesto definido/);
});

// ---------- /metricas ----------
const post = (over) => ({ status: "published", mediaId: String(Math.random()), format: "carousel", count: 4, topic: "Tema A", topicId: "a", ...over });
const hoursAgo = (h) => new Date(NOW - h * 3600_000).toISOString();
const stat = (reach, over = {}) => ({ likes: 1, comments: 0, reach, saved: 1, shares: 0, interactions: 2, views: reach * 3, insightsError: null, ...over });

test("selectPosts respeta la ventana, ignora ensayos y posts sin mediaId", () => {
  const posts = {
    a: post({ date: "2026-10-26", publishedAt: hoursAgo(20) }),
    b: post({ date: "2026-10-10", publishedAt: hoursAgo(24 * 17) }),
    c: post({ date: "2026-10-26", publishedAt: hoursAgo(5), dry: true }),
    d: post({ date: "2026-10-26", publishedAt: hoursAgo(5), mediaId: undefined }),
    e: { ...post({ date: "2026-10-25", publishedAt: hoursAgo(44) }), status: "images_ready" },
  };
  assert.deepEqual(selectPosts(posts, 7, NOW).map((p) => p.date), ["2026-10-26"]);
  assert.equal(selectPosts(posts, 30, NOW).length, 2);
});

test("analyze: ranking solo con posts de más de 24 h, comparación por formato y tema", () => {
  const rows = [
    { post: post({ date: "d1", publishedAt: hoursAgo(10), topic: "T", topicId: "t" }), stats: stat(99) }, // joven: fuera del ranking
    { post: post({ date: "d2", publishedAt: hoursAgo(50), format: "single", count: 1, topic: "B", topicId: "b" }), stats: stat(30) },
    { post: post({ date: "d3", publishedAt: hoursAgo(80) }), stats: stat(10) },
    { post: post({ date: "d4", publishedAt: hoursAgo(100) }), stats: stat(20) },
    { post: post({ date: "d5", publishedAt: hoursAgo(120), topicId: "idea", ideaText: "x" }), stats: null },
  ];
  const a = analyze(rows, NOW);
  assert.equal(a.total, 5);
  assert.equal(a.unavailable, 1);
  assert.equal(a.young, 1);
  assert.equal(a.matureCount, 3);
  assert.equal(a.best.stats.reach, 30);
  assert.equal(a.worst.stats.reach, 10);
  assert.equal(a.avg.reach, 20);
  assert.equal(a.engagement, (6 / 60) * 100);
  assert.deepEqual(a.byFormat.map((g) => [g.key, g.n]), [["Imagen única", 1], ["Carrusel", 2]]);
  const text = formatMetrics({ days: 7, account: { username: "cuenta", followers: 133, reach: 29, views: 400, profileViews: 3, accountsEngaged: 2 }, a });
  assert.match(text, /133 seguidores/);
  assert.match(text, /Mejor/);
  assert.match(text, /Ojo: son pocas publicaciones/);
});

test("sin permiso de insights se informa y se muestran likes y comentarios", () => {
  const rows = [{ post: post({ date: "d", publishedAt: hoursAgo(60) }), stats: stat(null, { reach: null, saved: null, shares: null, interactions: null, views: null, insightsError: "Meta API: permiso insuficiente (código 10)" }) }];
  const a = analyze(rows, NOW);
  assert.equal(a.insightsMissing, true);
  const text = formatMetrics({ days: 7, account: null, accountError: "x", a });
  assert.match(text, /instagram_business_manage_insights/);
  assert.match(text, /❤️ 1/);
});

test("collectPostStats usa caché de 30 min, tolera posts borrados y no repite consultas", async () => {
  const p1 = post({ date: "2026-10-26", publishedAt: hoursAgo(30), mediaId: "m1" });
  const p2 = post({ date: "2026-10-25", publishedAt: hoursAgo(50), mediaId: "m2" });
  let calls = 0;
  const fetchMedia = async (id) => { calls++; if (id === "m2") throw new MetaError("Meta API: objeto no existe (código 100)"); return stat(7); };
  const rows = await collectPostStats([p1, p2], { now: NOW, fetchMedia });
  assert.equal(calls, 2);
  assert.equal(rows.find((r) => r.post.mediaId === "m1").stats.reach, 7);
  assert.equal(rows.find((r) => r.post.mediaId === "m2").stats, null);
  await collectPostStats([p1], { now: NOW + 10 * 60_000, fetchMedia });
  assert.equal(calls, 2, "m1 sale de la caché");
  await collectPostStats([p1], { now: NOW + 45 * 60_000, fetchMedia });
  assert.equal(calls, 3, "pasados 30 min se vuelve a consultar");
});

test("metricsReport funciona aunque falle la consulta de la cuenta", async () => {
  const s = loadState();
  s.posts["2026-10-26-m"] = post({ date: "2026-10-26", publishedAt: hoursAgo(60), mediaId: "mm1" });
  saveState();
  const text = await metricsReport(7, { now: NOW, fetchAccount: async () => { throw new Error("sin red"); }, fetchMedia: async () => stat(12) });
  assert.match(text, /no pude consultarla \(sin red\)/);
  assert.match(text, /alcance 12/);
});

test("getMediaStats reintenta con menos métricas (código 100) y degrada si falta el permiso", async () => {
  const realFetch = globalThis.fetch;
  const asked = [];
  const reply = (body) => ({ ok: !body.error, status: body.error ? 400 : 200, json: async () => body });
  try {
    globalThis.fetch = async (url) => {
      const u = new URL(url);
      if (!u.pathname.endsWith("/insights")) return reply({ like_count: 3, comments_count: 1 });
      asked.push(u.searchParams.get("metric"));
      if (u.searchParams.get("metric").includes("views")) return reply({ error: { message: "metric views no soportada", code: 100 } });
      return reply({ data: [{ name: "reach", values: [{ value: 40 }] }, { name: "saved", values: [{ value: 2 }] }, { name: "shares", values: [{ value: 1 }] }, { name: "total_interactions", values: [{ value: 7 }] }] });
    };
    const s1 = await getMediaStats("123");
    assert.equal(asked.length, 2);
    assert.deepEqual([s1.likes, s1.comments, s1.reach, s1.saved, s1.shares, s1.interactions, s1.views], [3, 1, 40, 2, 1, 7, null]);

    globalThis.fetch = async (url) => (new URL(url).pathname.endsWith("/insights") ? reply({ error: { message: "permiso insuficiente", code: 10 } }) : reply({ like_count: 5, comments_count: 0 }));
    const s2 = await getMediaStats("123");
    assert.equal(s2.likes, 5);
    assert.equal(s2.reach, null);
    assert.match(s2.insightsError, /permiso insuficiente/);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("/metricas valida los días y sin publicaciones lo dice", async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw Object.assign(new Error("offline"), { cause: { code: "ENOTFOUND" } }); };
  try {
    assert.match(await say("/metricas 99"), /de 1 a 30/);
    assert.match(await say("/metricas abc"), /de 1 a 30/);
    const out = await say("/metricas 1");
    assert.match(out, /Consultando Instagram/);
    assert.match(out, /Métricas · últimos 1 días/);
  } finally {
    globalThis.fetch = realFetch;
  }
});

// ---------- /salud ----------
const goodProbes = {
  instagram: async () => ({ me: { username: "cuenta" }, quota: { data: [{ quota_usage: 2, config: { quota_total: 100 } }] } }),
  gemini: async () => ({ text: "gemini-x", image: "img-y" }),
  publicUrl: async () => true,
  disk: () => ({ freeBytes: 5000 * 1024 * 1024, totalBytes: 10000 * 1024 * 1024, images: 12, imageBytes: 30 * 1024 * 1024 }),
};

test("salud: todo en orden", async () => {
  markTick();
  const s = loadState();
  s.token = { expiresAt: new Date(Date.now() + 40 * 86400000).toISOString() };
  const checks = await collectHealth({ probes: goodProbes });
  assert.ok(checks.every((c) => c.level !== "fail"), JSON.stringify(checks.filter((c) => c.level === "fail")));
  const text = formatHealth(checks);
  assert.match(text, /Instagram: @cuenta · token vence en (39|40) días · cuota 2\/100/);
  assert.match(text, /Gemini: clave válida/);
  assert.match(text, /Almacenamiento: 5000 MB libres/);
});

test("salud: cada fallo se reporta sin romper el resto", async () => {
  markTick();
  const s = loadState();
  s.token = { expiresAt: new Date(Date.now() + 2 * 86400000).toISOString() };
  const probes = {
    instagram: goodProbes.instagram,
    gemini: async () => { throw new Error("API key not valid"); },
    publicUrl: async () => { throw new Error("timeout"); },
    disk: () => ({ freeBytes: 20 * 1024 * 1024, totalBytes: 1000 * 1024 * 1024, images: 1, imageBytes: 1 }),
  };
  const checks = await collectHealth({ probes });
  const by = Object.fromEntries(checks.map((c) => [c.name, c]));
  assert.equal(by.Gemini.level, "fail");
  assert.match(by.Gemini.detail, /API key not valid/);
  assert.equal(by["URL pública"].level, "fail");
  assert.equal(by.Almacenamiento.level, "fail");
  assert.equal(by.Instagram.level, "fail", "token a 2 días");
  assert.equal(by["Programador"].level, "ok");
  assert.match(formatHealth(checks), /❌ 4 fallo\(s\)/);
});

test("/salud usa las sondas reales reemplazables y avisa mientras trabaja", async () => {
  Object.assign(defaultProbes, goodProbes);
  const out = await say("/salud");
  assert.match(out, /Revisando servicios/);
  assert.match(out, /Salud del bot/);
  assert.match(out, /Resultado:/);
});

test("dayLabel formatea el día de la semana en español", () => {
  assert.equal(dayLabel("2026-10-28"), "mié 28-oct");
  assert.equal(dayLabel("2026-11-01", { month: false }), "dom 01");
});
