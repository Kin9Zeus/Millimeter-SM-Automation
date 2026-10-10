// Uso local:  npm run once -- --dry     genera contenido + imagen sin publicar
//             npm run once -- --content  solo texto (barato; útil para revisar el criterio editorial)
import { parseArgs } from "node:util";
import { localParts } from "./config.mjs";
import { createDailyPlan } from "./content.mjs";
import { runDaily } from "./pipeline.mjs";

const { values: a } = parseArgs({ options: { dry: { type: "boolean", default: false }, content: { type: "boolean", default: false }, publish: { type: "boolean", default: false }, whoami: { type: "boolean", default: false }, count: { type: "string" } } });

if (a.whoami) {
  const { whoami } = await import("./meta.mjs");
  const me = await whoami();
  console.log("Token válido. Cuenta:", me);
  console.log("Usa user_id como META_IG_USER_ID.");
} else if (a.content) {
  const c = await createDailyPlan(localParts().date);
  console.log(c.caption);
  console.log(JSON.stringify({ ...c, caption: undefined, captionBody: undefined }, null, 2));
} else if (a.dry || a.publish) {
  console.log(await runDaily({ dry: !a.publish, force: true, count: a.count ? Number(a.count) : undefined }));
} else {
  console.log("Usa --whoami (verifica el token), --content (solo plan y textos, sin imágenes), --dry (texto+imagen, sin publicar) o --publish (publica de verdad).");
  process.exit(1);
}
