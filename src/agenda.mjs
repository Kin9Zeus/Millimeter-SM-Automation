import { cfg, localParts } from "./config.mjs";
import { chooseFormat, chooseTopic } from "./design.mjs";
import { addDays, dayLabel } from "./format.mjs";
import { loadKnowledge } from "./knowledge.mjs";
import { hhmm, isPaused, schedule } from "./runtime.mjs";
import { ideaForDate, listIdeas, loadState } from "./state.mjs";

// Agenda de la semana. Formato y tema de cada día salen de funciones deterministas (semilla = fecha), así que la vista previa
// es EXACTA mientras no cambien las publicaciones previas: se simula el avance día a día igual que lo hará el pipeline,
// sin llamar a Gemini (costo cero). Lo único que no se puede adelantar es la redacción, que la genera el modelo ese día.

export const AGENDA_DAYS = 7;

/** Primer día que aún está por publicarse: hoy si no se ha publicado ni agotó los intentos; si no, mañana. */
export function firstOpenDate(state = loadState()) {
  const { date } = localParts();
  const today = state.posts[date];
  const done = today?.status === "published" || (today?.attempts ?? 0) >= cfg.maxAttemptsPerDay;
  return done ? addDays(date, 1) : date;
}

/** Los próximos `n` días de publicación con formato, tema o idea asignados. */
export function upcomingDays({ n = AGENDA_DAYS, state = loadState(), kb = loadKnowledge(), queue = listIdeas(), from = firstOpenDate(state) } = {}) {
  const first = from;
  const left = [...queue];
  let posts = { ...state.posts };
  const days = [];
  for (let i = 0; i < n; i++) {
    const date = addDays(first, i);
    const { format, count } = chooseFormat(date);
    const idea = ideaForDate(date, left);
    let day;
    if (idea) {
      left.splice(left.indexOf(idea), 1);
      day = { date, format, count, idea };
      posts[`sim-${date}`] = { date, status: "published", topicId: "idea" };
    } else {
      const { topic, repeated } = chooseTopic(kb, posts, date);
      day = { date, format, count, topic: topic.titulo, topicId: topic.id, repeated };
      posts[`sim-${date}`] = { date, status: "published", topicId: topic.id };
    }
    days.push(day);
  }
  return days;
}

const kind = (d) => (d.format === "single" ? "1 imagen" : `carrusel de ${d.count}`);

export function formatAgenda(days) {
  const sch = hhmm(schedule());
  const L = [`🗓 Próximos ${days.length} días (publica a las ${sch}, ${cfg.tz})`];
  if (isPaused()) L.push("⏸ Las publicaciones están PAUSADAS: nada saldrá hasta /reanudar.");
  days.forEach((d, i) => {
    const what = d.idea ? `💡 idea${d.idea.forDate ? " fijada" : ""}: «${d.idea.text.slice(0, 70)}»` : `🎯 ${d.topic}${d.repeated ? " (ángulo nuevo)" : ""}`;
    L.push(`${i + 1}. ${dayLabel(d.date)} · ${kind(d)}\n    ${what}`);
  });
  L.push("\nFormato y tema están decididos desde ya; la redacción, las escenas y las fotos las genera el bot ese día.");
  L.push("Cambia un día con /cambiar <n> <idea> · vuelve al tema automático con /cambiar <n> auto · más ideas con /idea.");
  return L.join("\n");
}
