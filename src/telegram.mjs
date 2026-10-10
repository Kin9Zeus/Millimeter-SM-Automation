import { cfg, log, logError } from "./config.mjs";
import { loadState, saveState } from "./state.mjs";

// Capa mínima sobre la Bot API de Telegram. Usa long polling (getUpdates): no hace falta URL pública ni secreto de webhook.

export const telegramEnabled = () => Boolean(cfg.telegram.token);

export async function tg(method, body = {}, { timeoutMs = 40000 } = {}) {
  const res = await fetch(`https://api.telegram.org/bot${cfg.telegram.token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const json = await res.json().catch(() => ({}));
  if (!json.ok) {
    const e = new Error(`Telegram ${method}: ${json.description ?? `HTTP ${res.status}`}`); // nunca incluye la URL (lleva el token)
    e.code = json.error_code;
    throw e;
  }
  return json.result;
}

// ---------- Chats vinculados ----------
const tgState = () => {
  const s = loadState();
  s.telegram ??= { chats: {}, offset: 0, failed: {} };
  s.telegram.chats ??= {};
  s.telegram.failed ??= {};
  return s.telegram;
};

export const linkedChats = () => tgState().chats;
export const isLinked = (chatId) => Boolean(tgState().chats[String(chatId)]);

export function linkChat(chatId, name) {
  tgState().chats[String(chatId)] = { name: name || "sin nombre", linkedAt: new Date().toISOString() };
  saveState();
}

export function unlinkChat(chatId) {
  const t = tgState();
  const had = Boolean(t.chats[String(chatId)]);
  delete t.chats[String(chatId)];
  saveState();
  return had;
}

/** Control de fuerza bruta del código de vinculación: 5 fallos por hora y por chat. */
export function registerLinkFailure(chatId) {
  const t = tgState();
  const now = Date.now();
  const recent = (t.failed[chatId] ?? []).filter((ts) => now - ts < 3600_000);
  recent.push(now);
  t.failed[chatId] = recent;
  saveState();
  return recent.length;
}
export const isLinkBlocked = (chatId) => (tgState().failed[chatId] ?? []).filter((ts) => Date.now() - ts < 3600_000).length >= 5;

export const recipients = () => {
  const ids = new Set(Object.keys(tgState().chats));
  if (cfg.telegram.chatId) ids.add(String(cfg.telegram.chatId));
  return [...ids];
};

// ---------- Envío ----------
const chunk = (text, n = 3900) => {
  const out = [];
  for (let i = 0; i < text.length; i += n) out.push(text.slice(i, i + n));
  return out.length ? out : [""];
};

export async function sendText(chatId, text) {
  for (const part of chunk(String(text))) await tg("sendMessage", { chat_id: chatId, text: part, disable_web_page_preview: true });
}

export async function sendPhotos(chatId, urls, caption = "") {
  if (urls.length === 1) return tg("sendPhoto", { chat_id: chatId, photo: urls[0], caption: caption.slice(0, 1000) });
  return tg("sendMediaGroup", { chat_id: chatId, media: urls.slice(0, 10).map((u, i) => ({ type: "photo", media: u, ...(i === 0 ? { caption: caption.slice(0, 1000) } : {}) })) });
}

/** Aviso a todos los chats vinculados. Nunca lanza: un fallo de Telegram no debe romper una publicación. */
export async function broadcast(text, { photoUrls } = {}) {
  if (!telegramEnabled()) return;
  for (const chatId of recipients()) {
    try {
      if (photoUrls?.length) {
        await sendPhotos(chatId, photoUrls, text);
        if (text.length > 1000) await sendText(chatId, text);
      } else await sendText(chatId, text);
    } catch (e) {
      logError(`Telegram → chat ${String(chatId).slice(-4)}: ${e.message}`);
    }
  }
}

// ---------- Recepción (long polling) ----------
export const BOT_COMMANDS = [
  ["estado", "Qué se publicó hoy y qué viene"],
  ["forzar", "Publicar un post extra ahora (opcional: /forzar <idea>)"],
  ["idea", "Dar una idea para la próxima publicación"],
  ["ideas", "Ver las ideas en cola"],
  ["borrar_idea", "Quitar una idea de la cola"],
  ["previa", "Generar un borrador sin publicar"],
  ["pausar", "Pausar las publicaciones automáticas"],
  ["reanudar", "Reanudar las publicaciones"],
  ["hora", "Cambiar la hora diaria (ej. /hora 11:30)"],
  ["ayuda", "Ver todos los comandos"],
];

let stopped = false;
export const stopPolling = () => { stopped = true; };

export function startPolling(onMessage) {
  if (!telegramEnabled()) { log("Telegram: sin TELEGRAM_BOT_TOKEN; los comandos están desactivados."); return; }
  stopped = false;
  (async () => {
    try {
      await tg("deleteWebhook", { drop_pending_updates: false });
      await tg("setMyCommands", { commands: BOT_COMMANDS.map(([command, description]) => ({ command, description })) });
      const me = await tg("getMe");
      log(`Telegram listo: @${me.username} · chats vinculados: ${Object.keys(linkedChats()).length}`);
    } catch (e) { logError(`Telegram (arranque): ${e.message}`); }

    while (!stopped) {
      try {
        const t = tgState();
        const updates = await tg("getUpdates", { offset: t.offset ?? 0, timeout: 25, allowed_updates: ["message"] }, { timeoutMs: 40000 });
        for (const u of updates) {
          t.offset = u.update_id + 1;
          saveState(); // se guarda ANTES de procesar: un reinicio nunca repite una orden (p. ej. /forzar)
          if (u.message?.text) await Promise.resolve(onMessage(u.message)).catch((e) => logError(`Telegram (mensaje): ${e.message}`));
        }
      } catch (e) {
        if (stopped) break;
        // 409 = otra instancia está haciendo polling (p. ej. durante un redeploy): se espera y se reintenta.
        logError(`Telegram (polling): ${e.message}`);
        await new Promise((r) => setTimeout(r, e.code === 409 ? 10000 : 5000));
      }
    }
  })();
}
