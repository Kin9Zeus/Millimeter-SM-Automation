import { log } from "./config.mjs";
import { broadcast } from "./telegram.mjs";

// Aviso a los chats de Telegram vinculados (si no hay ninguno, queda solo en los logs).
export async function notify(text, { photoUrl, photoUrls } = {}) {
  log(`[aviso] ${text.replace(/\n+/g, " ⏎ ").slice(0, 300)}`);
  await broadcast(text, { photoUrls: photoUrls ?? (photoUrl ? [photoUrl] : undefined) });
}
