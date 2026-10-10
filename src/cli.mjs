// Uso local:  npm run once -- --dry     genera contenido + imagen sin publicar
//             npm run once -- --content  solo texto (barato; útil para revisar el criterio editorial)
import { parseArgs } from "node:util";
import { localParts } from "./config.mjs";
import { createDailyContent } from "./content.mjs";
import { runDaily } from "./pipeline.mjs";

const { values: a } = parseArgs({ options: { dry: { type: "boolean", default: false }, content: { type: "boolean", default: false }, publish: { type: "boolean", default: false }, whoami: { type: "boolean", default: false } } });

if (a.whoami) {
  const { whoami } = await import("./meta.mjs");
  const me = await whoami();
  console.log("Token válido. Cuenta:", me);
  console.log("Usa user_id como META_IG_USER_ID.");
} else if (a.content) {
  const c = await createDailyContent(localParts().date);
  console.log(JSON.stringify(c, null, 2));
} else if (a.dry || a.publish) {
  console.log(await runDaily({ dry: !a.publish, force: true }));
} else {
  console.log("Usa --whoami (verifica el token), --content (solo texto), --dry (texto+imagen, sin publicar) o --publish (publica de verdad).");
  process.exit(1);
}
