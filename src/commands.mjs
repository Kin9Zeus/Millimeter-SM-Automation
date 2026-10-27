import { timingSafeEqual } from "node:crypto";
import { cfg, localParts, log, logError } from "./config.mjs";
import { isRunning, runDaily } from "./pipeline.mjs";
import { hhmm, isPaused, isPastPostTime, pausedByEnv, schedule, setPaused, setSchedule } from "./runtime.mjs";
import { addIdea, listIdeas, loadState, removeIdea } from "./state.mjs";
import { AGENDA_DAYS, formatAgenda, upcomingDays } from "./agenda.mjs";
import { dayLabel, fmtKind, fmtTopic } from "./format.mjs";
import { collectHealth, formatHealth } from "./health.mjs";
import { metricsReport } from "./metrics.mjs";
import { formatSpend, spendReport } from "./spend.mjs";
import { isLinkBlocked, isLinked, linkChat, linkedChats, registerLinkFailure, sendText, unlinkChat } from "./telegram.mjs";

// Interfaz de órdenes por Telegram. Solo atiende chats privados vinculados con el código secreto.

let reply = sendText;
/** Solo para pruebas: sustituye el envío real. */
export const _setReply = (fn) => { reply = fn; };

export function parseCommand(text) {
  const m = String(text ?? "").trim().match(/^\/([a-z_0-9]+)(?:@\w+)?(?:\s+([\s\S]*))?$/i);
  return m ? { cmd: m[1].toLowerCase(), args: (m[2] ?? "").trim() } : null;
}

const safeEqual = (a, b) => {
  const A = Buffer.from(String(a)), B = Buffer.from(String(b));
  return A.length === B.length && timingSafeEqual(A, B);
};

const HELP = `Comandos (solo para chats vinculados):

/estado — qué se publicó hoy y qué viene
/semana — qué se publicará los próximos 7 días (formato, tema o idea)
/cambiar <n> <idea> — fija una idea para el día n de /semana (/cambiar <n> auto la quita)
/metricas [días] — alcance, guardados y mejores posts (7 por defecto, máx. 30)
/gasto — gasto estimado de Gemini (hoy, mes y proyección)
/salud — revisa que todo funcione: Instagram, Gemini, token, disco…
/forzar — publica un post extra ahora (tarda 2–5 min)
/forzar <idea> — igual, pero sobre tu idea
/idea <texto> — guarda una idea para la próxima publicación programada
/ideas — ver las ideas en cola
/borrar_idea <n> — quitar una idea de la cola
/previa — genera un borrador SIN publicar y te lo envía
/pausar · /reanudar — detiene o reactiva las publicaciones automáticas
/hora HH:MM — cambia la hora diaria (ej. /hora 11:30)
/usuarios · /quitar <n> · /desvincular — gestionar quién puede dar órdenes

Las ideas pasan por las mismas reglas de datos oficiales: el bot no publica precios, garantías ni datos que no estén en la información de MILLIMETER.`;

const NOT_LINKED = "Este chat no está vinculado. Si eres parte del equipo, envía /vincular <código> con el código que te dieron.";

/** Cuándo sale la próxima publicación programada, según el estado real de hoy (publicada, pendiente, pausada…). */
export function nextPublication() {
  const { date } = localParts();
  const today = loadState().posts[date];
  const sch = hhmm(schedule());
  const done = today?.status === "published" || (today?.attempts ?? 0) >= cfg.maxAttemptsPerDay;
  const when = done ? `mañana a las ${sch}` : isPastPostTime() ? "en los próximos minutos (la hora de hoy ya pasó y aún no se publicó)" : `hoy a las ${sch}`;
  return isPaused() ? `${when}, pero las publicaciones están PAUSADAS (reanuda con /reanudar)` : when;
}

function estado() {
  const s = loadState();
  const { date } = localParts();
  const sch = schedule();
  const posts = Object.values(s.posts).filter((p) => !p.dry);
  const today = posts.filter((p) => p.date === date);
  const published = today.filter((p) => p.status === "published");
  const lastPub = posts.filter((p) => p.status === "published").sort((a, b) => ((a.publishedAt ?? a.date) < (b.publishedAt ?? b.date) ? 1 : -1))[0];
  const gens = Object.values(s.posts).filter((p) => p.date === date).reduce((n, p) => n + (p.imageGenerations ?? 0), 0);
  const days = s.token?.expiresAt ? Math.floor((Date.parse(s.token.expiresAt) - Date.now()) / 86400000) : null;
  const L = [];
  L.push(`📊 Estado · ${date}`);
  L.push(`Programación: todos los días a las ${hhmm(sch)} (${cfg.tz}) — ${isPaused() ? "⏸ PAUSADA" : "activa"}${pausedByEnv() ? " (pausa fijada en el servidor)" : ""}`);
  if (isRunning()) L.push("⏳ Hay una publicación generándose ahora mismo.");
  if (published.length) L.push(`Hoy: ✅ ${published.length} publicación(es)\n${published.map((p) => `  • ${fmtKind(p)} · ${fmtTopic(p)}\n    ${p.permalink ?? ""}`).join("\n")}`);
  else L.push(`Hoy: aún no se ha publicado (próxima: ${nextPublication()}).`);
  const failed = today.find((p) => p.lastError && p.status !== "published");
  if (failed) L.push(`⚠️ Último error de hoy: ${failed.lastError.slice(0, 200)}`);
  L.push(`Ideas en cola: ${listIdeas().length}`);
  L.push(`Imágenes generadas hoy: ${gens} (máx. ${cfg.maxImagesPerDay})`);
  if (days != null) L.push(`Token de Instagram: vence en ${days} días (se renueva solo).`);
  if (lastPub) L.push(`Última publicación: ${lastPub.publishedAt?.slice(0, 10) ?? lastPub.date} · ${fmtKind(lastPub)} · ${fmtTopic(lastPub)}\n${lastPub.permalink ?? ""}`);
  return L.join("\n");
}

const cleanIdea = (t) => String(t).replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();

function launch(opts, label) {
  if (isRunning()) return "Ya hay una publicación en curso; espera a que termine (te aviso por aquí).";
  runDaily(opts).then((r) => log(`${label} OK`, r?.skipped ?? "")).catch((e) => logError(`${label} falló: ${e.message}`)); // el propio pipeline avisa del resultado
  return null;
}

const HANDLERS = {
  async estado() { return estado(); },

  async forzar({ args }) {
    const idea = cleanIdea(args);
    if (idea && (idea.length < 10 || idea.length > 400)) return "La idea debe tener entre 10 y 400 caracteres.";
    const busy = launch({ extra: true, idea: idea || undefined }, "forzar");
    return busy ?? `⏳ Generando un post extra${idea ? ` sobre tu idea: «${idea.slice(0, 80)}»` : ""}… Tarda entre 2 y 5 minutos; te aviso por aquí cuando salga (o si algo falla).`;
  },

  async idea({ args, chat }) {
    const text = cleanIdea(args);
    if (text.length < 10) return "Cuéntame la idea con un poco más de detalle (mínimo 10 caracteres). Ej.: /idea Un post sobre cómo las chimeneas de MILLIMETER renuevan un salón sin demoler";
    if (text.length > 400) return "La idea es muy larga (máximo 400 caracteres). Resúmela un poco.";
    if (listIdeas().length >= 10) return "Ya hay 10 ideas en cola. Quita alguna con /borrar_idea <n>.";
    addIdea(text, chat.name);
    const n = listIdeas().length;
    return `💡 Idea guardada (#${n} en la cola). ${n === 1 ? `Se usará en la próxima publicación programada: ${nextPublication()}.` : `Se usará en una de las próximas publicaciones programadas, una idea por día (la primera sale ${nextPublication()}).`}\nPasa por las mismas reglas de datos oficiales; si no puedo convertirla en un post válido te aviso y publico un tema automático.`;
  },

  async ideas() {
    const q = listIdeas();
    if (!q.length) return "No hay ideas en cola. Agrega una con /idea <texto>.";
    return `💡 Ideas en cola (una por publicación programada):\n${q.map((i, n) => `${n + 1}. ${i.text}${i.forDate ? ` — fijada para ${dayLabel(i.forDate)}` : ""}`).join("\n")}\n\nQuita una con /borrar_idea <n>. Mira cómo queda la semana con /semana.`;
  },

  async semana() { return formatAgenda(upcomingDays()); },

  async cambiar({ args, chat }) {
    const m = args.match(/^(\d+)\s+([\s\S]+)$/);
    if (!m) return `Formato: /cambiar <n> <idea> (n = número del día en /semana, 1–${AGENDA_DAYS}). Ej.: /cambiar 3 Un post sobre duchas amplias con poca junta. Para volver al tema automático: /cambiar 3 auto`;
    const n = parseInt(m[1], 10);
    if (n < 1 || n > AGENDA_DAYS) return `El día debe estar entre 1 y ${AGENDA_DAYS} (mira /semana).`;
    const day = upcomingDays()[n - 1];
    const label = dayLabel(day.date);
    const reserved = listIdeas().find((i) => i.forDate === day.date);

    if (/^(auto|autom[aá]tico|quitar)$/i.test(m[2].trim())) {
      if (reserved) { removeIdea(reserved.id); return `↩️ ${label} vuelve al tema automático.`; }
      const k = day.idea ? listIdeas().indexOf(day.idea) + 1 : 0;
      return k ? `${label} usa la idea #${k} de la cola, que no está fijada a un día. Quítala con /borrar_idea ${k}.` : `${label} ya usa un tema automático.`;
    }

    const text = cleanIdea(m[2]);
    if (text.length < 10 || text.length > 400) return "La idea debe tener entre 10 y 400 caracteres.";
    if (reserved) removeIdea(reserved.id);
    if (listIdeas().length >= 10) return "Ya hay 10 ideas en cola. Quita alguna con /borrar_idea <n>.";
    addIdea(text, chat.name, day.date);
    return `📌 Idea fijada para ${label} (${fmtKind(day)}): «${text.slice(0, 80)}»\nPasa por las mismas reglas de datos oficiales; si no puedo convertirla en un post válido te aviso y ese día publico un tema automático.${day.idea && !day.idea.forDate ? "\nLa idea que ocupaba ese día pasa al siguiente día libre." : ""}`;
  },

  async metricas({ args, chat }) {
    const days = args ? parseInt(args, 10) : 7;
    if (!Number.isInteger(days) || days < 1 || days > 30) return "Formato: /metricas [días], de 1 a 30 (por defecto 7). Ej.: /metricas 30";
    await reply(chat.id, "⏳ Consultando Instagram…");
    return metricsReport(days);
  },

  async gasto() { return formatSpend(spendReport()); },

  async salud({ chat }) {
    await reply(chat.id, "⏳ Revisando servicios…");
    return formatHealth(await collectHealth());
  },

  async borrar_idea({ args }) {
    const q = listIdeas();
    const n = parseInt(args, 10);
    if (!Number.isInteger(n) || n < 1 || n > q.length) return `Indica el número de la idea (1–${q.length || 0}). Mira la lista con /ideas.`;
    removeIdea(q[n - 1].id);
    return `🗑 Idea #${n} eliminada.`;
  },

  async previa({ args }) {
    const idea = cleanIdea(args);
    const busy = launch({ dry: true, idea: idea || undefined }, "previa");
    return busy ?? `🧪 Generando un borrador (NO se publica)${idea ? ` sobre tu idea` : ""}… En 2–5 minutos te llega por aquí. Genera imágenes reales (unos USD 0.4–1 de Gemini).`;
  },

  async pausar() {
    setPaused(true);
    return `⏸ Publicaciones automáticas pausadas. /forzar sigue funcionando. Reactiva con /reanudar.`;
  },

  async reanudar() {
    if (pausedByEnv()) return "La pausa está fijada en el servidor (variable PAUSED); quítala en Railway para reanudar.";
    setPaused(false);
    return `▶️ Publicaciones reanudadas. Próxima: ${nextPublication()}.`;
  },

  async hora({ args }) {
    const m = args.match(/^(\d{1,2})[:.h]?(\d{2})?$/);
    const h = m ? parseInt(m[1], 10) : NaN;
    const min = m?.[2] ? parseInt(m[2], 10) : 0;
    if (!m || h > 23 || min > 59) return "Formato: /hora HH:MM en 24 h, p. ej. /hora 11:30";
    setSchedule(h, min);
    return `🕐 Hora diaria cambiada a ${hhmm({ hour: h, minute: min })} (${cfg.tz}). Próxima publicación: ${nextPublication()}.`;
  },

  async usuarios() {
    const chats = Object.entries(linkedChats());
    return `👥 Chats vinculados (${chats.length}/${cfg.telegram.maxChats}):\n${chats.map(([id, c], n) => `${n + 1}. ${c.name} (…${id.slice(-4)}) · desde ${c.linkedAt.slice(0, 10)}`).join("\n")}\n\nQuita uno con /quitar <n>.`;
  },

  async quitar({ args, chat }) {
    const chats = Object.entries(linkedChats());
    const n = parseInt(args, 10);
    if (!Number.isInteger(n) || n < 1 || n > chats.length) return "Indica el número del chat (mira /usuarios).";
    const [id, c] = chats[n - 1];
    unlinkChat(id);
    if (id !== chat.id) await reply(id, "Este chat fue desvinculado del bot de MILLIMETER.").catch(() => {});
    return `Chat «${c.name}» desvinculado.`;
  },

  async desvincular({ chat }) {
    unlinkChat(chat.id);
    return "Chat desvinculado: ya no recibirás avisos ni podrás dar órdenes. Para volver, usa /vincular <código>.";
  },

  async ayuda() { return HELP; },
};

/** Punto de entrada: recibe un mensaje de Telegram (ya filtrado a tipo texto). */
export async function handleMessage(msg) {
  if (msg.chat?.type !== "private") return; // nunca en grupos
  const chat = { id: String(msg.chat.id), name: [msg.from?.first_name, msg.from?.last_name].filter(Boolean).join(" ") || msg.from?.username || "sin nombre" };
  const parsed = parseCommand(msg.text);

  // --- Vinculación (único comando permitido a chats desconocidos) ---
  if (parsed?.cmd === "vincular") {
    if (isLinked(chat.id)) return reply(chat.id, "Este chat ya está vinculado. Usa /ayuda para ver los comandos.");
    if (!cfg.telegram.linkCode) return reply(chat.id, "La vinculación no está habilitada en el servidor (falta TELEGRAM_LINK_CODE).");
    if (isLinkBlocked(chat.id)) return reply(chat.id, "Demasiados intentos fallidos. Espera una hora.");
    if (!safeEqual(parsed.args, cfg.telegram.linkCode)) {
      registerLinkFailure(chat.id);
      return reply(chat.id, "Código incorrecto.");
    }
    if (Object.keys(linkedChats()).length >= cfg.telegram.maxChats) return reply(chat.id, `Ya hay ${cfg.telegram.maxChats} chats vinculados. Quita uno con /quitar desde un chat vinculado.`);
    linkChat(chat.id, chat.name);
    log(`Telegram: chat vinculado (${chat.name}, …${chat.id.slice(-4)})`);
    return reply(chat.id, `✅ Vinculado, ${chat.name}. Desde aquí recibirás los avisos del bot y podrás darle órdenes.\n\n${HELP}`);
  }

  if (!isLinked(chat.id)) return reply(chat.id, parsed?.cmd === "start" || parsed?.cmd === "ayuda" ? `Hola 👋 Soy el bot de contenido de MILLIMETER by Casanova.\n\n${NOT_LINKED}` : NOT_LINKED);

  if (!parsed) return reply(chat.id, "Usa un comando: /idea <texto> para sugerir un post, /estado para ver cómo va, /ayuda para todo lo demás.");
  const handler = parsed.cmd === "start" ? HANDLERS.ayuda : HANDLERS[parsed.cmd];
  if (!handler) return reply(chat.id, `No conozco el comando /${parsed.cmd}. Usa /ayuda.`);
  try {
    const out = await handler({ args: parsed.args, chat });
    if (out) await reply(chat.id, out);
  } catch (e) {
    logError(`Comando /${parsed.cmd}: ${e.message}`);
    await reply(chat.id, "Ocurrió un error al ejecutar el comando; revisa /estado o inténtalo de nuevo.").catch(() => {});
  }
}
