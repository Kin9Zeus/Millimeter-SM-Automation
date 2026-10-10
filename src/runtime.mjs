import { cfg, localParts } from "./config.mjs";
import { loadState, saveState } from "./state.mjs";

// Ajustes que el cliente cambia desde Telegram (se guardan en el Volume y se suman a las variables de entorno).
export const pausedByEnv = () => cfg.paused;
export const isPaused = () => cfg.paused || Boolean(loadState().runtime?.paused);

export function setPaused(value) {
  const s = loadState();
  s.runtime = { ...(s.runtime ?? {}), paused: Boolean(value) };
  saveState();
}

export function schedule() {
  const r = loadState().runtime ?? {};
  return { hour: r.hour ?? cfg.postHour, minute: r.minute ?? cfg.postMinute };
}

export function setSchedule(hour, minute) {
  const s = loadState();
  s.runtime = { ...(s.runtime ?? {}), hour, minute };
  saveState();
}

export function isPastPostTime(date = new Date()) {
  const t = localParts(date);
  const s = schedule();
  return t.hour * 60 + t.minute >= s.hour * 60 + s.minute;
}

export const hhmm = ({ hour, minute }) => `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
