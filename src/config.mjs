import { existsSync } from "node:fs";
import { resolve } from "node:path";

// Desarrollo local: carga .env si existe. En Railway las variables ya vienen en el entorno.
const envFile = resolve(process.cwd(), ".env");
if (existsSync(envFile)) process.loadEnvFile(envFile);

const env = process.env;
const bool = (v, d = false) => (v == null || v === "" ? d : /^(1|true|yes|si|sí)$/i.test(v));
const int = (v, d) => (Number.isFinite(parseInt(v, 10)) ? parseInt(v, 10) : d);
const num = (v, d) => (v != null && v !== "" && Number.isFinite(Number(v)) ? Number(v) : d);

const railwayDomain = env.RAILWAY_PUBLIC_DOMAIN ? `https://${env.RAILWAY_PUBLIC_DOMAIN}` : "";

export const cfg = {
  port: int(env.PORT, 3000),
  dataDir: resolve(env.DATA_DIR || "./data"),
  publicBaseUrl: (env.PUBLIC_BASE_URL || railwayDomain).replace(/\/+$/, ""),
  tz: env.TZ_NAME || "America/Bogota",
  postHour: int(env.POST_HOUR, 10),
  postMinute: int(env.POST_MINUTE, 0),
  paused: bool(env.PAUSED),
  dryRun: bool(env.DRY_RUN),
  adminToken: env.ADMIN_TOKEN || "",
  maxAttemptsPerDay: 4,
  maxGenerationsPerSlide: 3, // intentos de foto por pieza (el inspector rechaza y se regenera con correcciones)
  maxImagesPerDay: int(env.MAX_IMAGES_PER_DAY, 18), // tope duro de gasto: ~USD 0.13 por imagen
  // Precios de referencia en USD para estimar el gasto (/gasto). Son estimaciones: la factura real está en ai.studio/spend.
  pricing: {
    imageUsd: num(env.IMAGE_COST_USD, (env.IMAGE_SIZE || "2K") === "4K" ? 0.24 : 0.134),
    textCallUsd: num(env.TEXT_CALL_USD, 0.035), // plan, auditor
    inspectCallUsd: num(env.INSPECT_CALL_USD, 0.005), // inspector visual
  },
  monthlyBudgetUsd: num(env.MONTHLY_BUDGET_USD, 0), // 0 = sin presupuesto: /gasto solo informa y no avisa de umbrales
  retryEveryMs: 10 * 60 * 1000,
  tickEveryMs: 5 * 60 * 1000,
  keepImagesDays: 30,
  gemini: {
    apiKey: env.GEMINI_API_KEY || "",
    textModel: env.GEMINI_TEXT_MODEL || "",
    // Candidatos en orden de preferencia; el bot usa el primero que la API acepte.
    textModelCandidates: ["gemini-3.1-pro-preview", "gemini-3.1-pro", "gemini-3-pro-preview", "gemini-3-flash-preview", "gemini-2.5-pro", "gemini-2.5-flash"],
    imageModel: env.GEMINI_IMAGE_MODEL || "gemini-3-pro-image",
    imageSize: env.IMAGE_SIZE || "2K",
    imageAspect: env.IMAGE_ASPECT || "3:4",
  },
  meta: {
    token: env.META_ACCESS_TOKEN || "",
    igUserId: env.META_IG_USER_ID || "",
    apiVersion: env.META_API_VERSION || "v22.0",
  },
  telegram: {
    token: env.TELEGRAM_BOT_TOKEN || "",
    chatId: env.TELEGRAM_CHAT_ID || "", // opcional: chat extra que solo recibe avisos
    linkCode: env.TELEGRAM_LINK_CODE || "", // código secreto para /vincular (sin él nadie puede dar órdenes)
    maxChats: int(env.TELEGRAM_MAX_CHATS, 4),
  },
};

export function missingConfig({ forPublishing = true } = {}) {
  const miss = [];
  if (!cfg.gemini.apiKey) miss.push("GEMINI_API_KEY");
  if (forPublishing) {
    if (!cfg.meta.token) miss.push("META_ACCESS_TOKEN");
    if (!cfg.publicBaseUrl) miss.push("PUBLIC_BASE_URL (o RAILWAY_PUBLIC_DOMAIN)");
  }
  return miss;
}

// --- Fecha y hora en la zona del cliente ---
export function localParts(date = new Date(), tz = cfg.tz) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(date)
      .map((p) => [p.type, p.value])
  );
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: +parts.hour, minute: +parts.minute };
}

export function isPastPostTime(date = new Date()) {
  const t = localParts(date);
  return t.hour * 60 + t.minute >= cfg.postHour * 60 + cfg.postMinute;
}

// Día "de calendario" como entero, para rotar los pilares de contenido de forma determinista.
export function dayNumber(dateStr) {
  return Math.floor(Date.parse(`${dateStr}T00:00:00Z`) / 86400000);
}

export const log = (...a) => console.log(new Date().toISOString(), ...a);
export const logError = (...a) => console.error(new Date().toISOString(), ...a);
