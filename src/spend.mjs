import { cfg, localParts } from "./config.mjs";
import { addDays, dayLabel } from "./format.mjs";
import { loadState, saveState } from "./state.mjs";

// Gasto estimado de Gemini. Las imágenes se cuentan desde los posts (cada intento de foto, incluidos ensayos y extras);
// las llamadas de texto y de inspección visual se anotan en un libro diario (state.usage) desde gemini.mjs.
// Es una ESTIMACIÓN con los precios de config.pricing; la factura real está en ai.studio/spend.

/** Anota una llamada exitosa a Gemini. kind: "text" (plan, auditor) | "inspect" (inspector visual). */
export function recordUsage(kind, date = localParts().date) {
  const s = loadState();
  s.usage ??= {};
  const day = (s.usage[date] ??= { text: 0, inspect: 0 });
  day[kind] = (day[kind] ?? 0) + 1;
  saveState();
}

const usd = ({ images = 0, text = 0, inspect = 0 }) =>
  images * cfg.pricing.imageUsd + text * cfg.pricing.textCallUsd + inspect * cfg.pricing.inspectCallUsd;


function dayTotals(state, date) {
  const images = Object.values(state.posts).filter((p) => p.date === date).reduce((n, p) => n + (p.imageGenerations ?? 0), 0);
  const u = state.usage?.[date] ?? {};
  const t = { images, text: u.text ?? 0, inspect: u.inspect ?? 0 };
  return { date, ...t, usd: usd(t) };
}

/** Gasto de hoy, del mes en curso (con proyección a fin de mes) y de los últimos 7 días. */
export function spendReport(now = new Date()) {
  const state = loadState();
  const { date: today } = localParts(now);
  const [y, m, d] = today.split("-").map(Number);
  const monthPrefix = today.slice(0, 7);
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();

  const dates = new Set([...Object.values(state.posts).map((p) => p.date), ...Object.keys(state.usage ?? {})].filter((x) => typeof x === "string" && x.startsWith(monthPrefix)));
  const month = [...dates].map((x) => dayTotals(state, x)).reduce((a, t) => ({ images: a.images + t.images, text: a.text + t.text, inspect: a.inspect + t.inspect, usd: a.usd + t.usd }), { images: 0, text: 0, inspect: 0, usd: 0 });
  const last7 = Array.from({ length: 7 }, (_, i) => dayTotals(state, addDays(today, i - 6)));

  const budget = cfg.monthlyBudgetUsd;
  return {
    today: dayTotals(state, today),
    month: { ...month, label: monthPrefix, daysElapsed: d, daysInMonth, projectedUsd: (month.usd / d) * daysInMonth },
    last7,
    imageCap: cfg.maxImagesPerDay,
    budget: budget > 0 ? { usd: budget, usedPct: (month.usd / budget) * 100, projectedPct: (((month.usd / d) * daysInMonth) / budget) * 100 } : null,
  };
}

/** Umbral de presupuesto mensual superado (80 % y 100 %). Devuelve null si no hay presupuesto o aún no se llega. */
export function budgetAlert(report) {
  if (!report.budget) return null;
  const { usedPct } = report.budget;
  const { label } = report.month;
  if (usedPct >= 100) return { key: `gasto-100-${label}`, text: `🚨 El gasto estimado de Gemini este mes (USD ${report.month.usd.toFixed(2)}) ya superó el presupuesto de USD ${report.budget.usd.toFixed(2)}. Revisa ai.studio/spend y decide si pausar (/pausar).` };
  if (usedPct >= 80) return { key: `gasto-80-${label}`, text: `⚠️ El gasto estimado de Gemini este mes llegó al ${usedPct.toFixed(0)} % del presupuesto (USD ${report.month.usd.toFixed(2)} de ${report.budget.usd.toFixed(2)}). Proyección a fin de mes: USD ${report.month.projectedUsd.toFixed(2)}.` };
  return null;
}

const money = (n) => `USD ${n.toFixed(2)}`;

export function formatSpend(r) {
  const L = ["💵 Gasto estimado de Gemini"];
  L.push(`\nHoy (${r.today.date}): ${money(r.today.usd)}`);
  L.push(`  • ${r.today.images} imágenes (tope ${r.imageCap}/día) · ${r.today.text} llamadas de texto · ${r.today.inspect} inspecciones`);
  L.push(`\nMes ${r.month.label}: ${money(r.month.usd)} en ${r.month.daysElapsed} de ${r.month.daysInMonth} días`);
  L.push(`  • ${r.month.images} imágenes (${money(r.month.images * cfg.pricing.imageUsd)}) · ${r.month.text} textos · ${r.month.inspect} inspecciones`);
  L.push(`  • Proyección a fin de mes: ${money(r.month.projectedUsd)}`);
  if (r.budget) L.push(`  • Presupuesto mensual: ${money(r.budget.usd)} → usado ${r.budget.usedPct.toFixed(0)} %, proyectado ${r.budget.projectedPct.toFixed(0)} %${r.budget.projectedPct > 100 ? " ⚠️ se pasaría" : ""}`);
  else L.push("  • Sin presupuesto definido (variable MONTHLY_BUDGET_USD): no se avisa de umbrales.");
  L.push("\nÚltimos 7 días:");
  for (const t of r.last7) L.push(`  ${dayLabel(t.date, { month: false })}  ${money(t.usd).padStart(9)}  ${"█".repeat(Math.min(20, t.images))}${t.images ? ` ${t.images}` : ""}`);
  L.push(`\nEs una estimación (imagen ≈ USD ${cfg.pricing.imageUsd.toFixed(3)}). Las llamadas de texto e inspección solo se cuentan desde que existe este registro. La cifra real está en ai.studio/spend.`);
  return L.join("\n");
}
