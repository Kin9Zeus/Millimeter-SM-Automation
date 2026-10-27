// Formato de texto compartido por los comandos de Telegram.

const DOW = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** «mié 28-oct» (o «mié 28» con month:false) a partir de YYYY-MM-DD. */
export function dayLabel(date, { month = true } = {}) {
  const d = new Date(`${date}T12:00:00Z`);
  return `${DOW[d.getUTCDay()]} ${date.slice(8, 10)}${month ? `-${MONTHS[d.getUTCMonth()]}` : ""}`;
}

/** Suma `n` días a una fecha YYYY-MM-DD (aritmética de calendario, sin husos). */
export const addDays = (date, n) => new Date(Date.parse(`${date}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

export const fmtKind = (p) => (p.format === "single" ? "1 imagen" : `carrusel de ${p.count}`);
export const fmtTopic = (p) => (p.ideaText ? `idea: «${p.ideaText.slice(0, 60)}»` : p.topic);
