import { createServer } from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { timingSafeEqual } from "node:crypto";
import { join } from "node:path";
import { cfg, localParts, log, logError, missingConfig } from "./config.mjs";
import { imagesDir } from "./image.mjs";
import { housekeeping, isRunning, runDaily, tick } from "./pipeline.mjs";
import { loadState } from "./state.mjs";

const json = (res, status, body) => {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
};

function authorized(req) {
  if (!cfg.adminToken) return false;
  const given = Buffer.from((req.headers.authorization ?? "").replace(/^Bearer\s+/i, ""));
  const want = Buffer.from(cfg.adminToken);
  return given.length === want.length && timingSafeEqual(given, want);
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  try {
    // Salud mínima: no expone estado interno.
    if (req.method === "GET" && url.pathname === "/health") return json(res, 200, { ok: true });

    // Imágenes públicas que Meta descarga. Solo nombres con el formato exacto generado por el bot.
    const m = url.pathname.match(/^\/media\/([a-z0-9-]+\.jpg)$/);
    if (req.method === "GET" && m) {
      const file = join(imagesDir(), m[1]);
      if (!existsSync(file)) return json(res, 404, { error: "not_found" });
      res.writeHead(200, { "content-type": "image/jpeg", "content-length": statSync(file).size, "cache-control": "public, max-age=3600" });
      return createReadStream(file).pipe(res);
    }

    if (url.pathname.startsWith("/admin/")) {
      if (!authorized(req)) return json(res, cfg.adminToken ? 401 : 404, { error: cfg.adminToken ? "unauthorized" : "not_found" });

      if (req.method === "GET" && url.pathname === "/admin/status") {
        const s = loadState();
        const posts = Object.values(s.posts).sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 10)
          .map(({ date, status, topic, attempts, lastError, permalink, dry }) => ({ date, status, topic, attempts, lastError, permalink, dry }));
        return json(res, 200, { now: localParts(), paused: cfg.paused, dryRun: cfg.dryRun, running: isRunning(), missingConfig: missingConfig(), tokenExpiresAt: s.token?.expiresAt ?? null, posts });
      }

      // POST /admin/run?dry=1  → ensayo sin publicar · POST /admin/run → corre el pipeline de hoy ahora
      if (req.method === "POST" && url.pathname === "/admin/run") {
        const dry = url.searchParams.get("dry") === "1";
        const force = url.searchParams.get("force") === "1";
        if (isRunning()) return json(res, 409, { error: "already_running" });
        runDaily({ dry, force }).then((r) => log("admin/run OK", r)).catch((e) => logError("admin/run falló:", e.message));
        return json(res, 202, { accepted: true, dry, hint: "Sigue el progreso en GET /admin/status o en los logs." });
      }
    }
    return json(res, 404, { error: "not_found" });
  } catch (e) {
    logError("HTTP:", e.message);
    return json(res, 500, { error: "internal" });
  }
});

server.listen(cfg.port, () => {
  const miss = missingConfig();
  log(`Servidor en :${cfg.port} · zona ${cfg.tz} · publica a las ${String(cfg.postHour).padStart(2, "0")}:${String(cfg.postMinute).padStart(2, "0")} · pausado=${cfg.paused} · dryRun=${cfg.dryRun}`);
  if (miss.length) logError(`⚠ Variables sin configurar: ${miss.join(", ")}`);
});

// Scheduler: latido cada 5 min. El propio pipeline decide si ya toca y evita duplicar.
setTimeout(() => { tick(); housekeeping(); }, 15_000);
const heartbeat = setInterval(tick, cfg.tickEveryMs);
const cleaner = setInterval(housekeeping, 24 * 3600 * 1000);

for (const sig of ["SIGTERM", "SIGINT"]) {
  process.on(sig, () => {
    log(`${sig}: cerrando…`);
    clearInterval(heartbeat);
    clearInterval(cleaner);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 8000).unref();
  });
}
process.on("unhandledRejection", (e) => logError("unhandledRejection:", e?.message ?? e));
