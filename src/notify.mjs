import { cfg, log, logError } from "./config.mjs";

// Aviso opcional por Telegram. Solo notifica: no aprueba nada. Sin credenciales, queda en los logs.
export async function notify(text, { photoUrl } = {}) {
  log(`[aviso] ${text.replace(/\n+/g, " ⏎ ").slice(0, 300)}`);
  const { token, chatId } = cfg.telegram;
  if (!token || !chatId) return;
  try {
    const method = photoUrl ? "sendPhoto" : "sendMessage";
    const body = photoUrl ? { chat_id: chatId, photo: photoUrl, caption: text.slice(0, 1000) } : { chat_id: chatId, text: text.slice(0, 4000), disable_web_page_preview: true };
    const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    if (!res.ok) logError(`Telegram respondió HTTP ${res.status}`);
  } catch (e) {
    logError(`Telegram falló: ${e.message}`);
  }
}
