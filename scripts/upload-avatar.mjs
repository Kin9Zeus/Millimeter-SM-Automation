// Sube la foto BASE de Oscar al Volume del bot en producción (PUT /admin/avatar). La foto nunca entra al repo (es público).
// Uso, con las variables de Railway inyectadas (el token no se imprime):
//   railway run npm run avatar:base -- ../../oscar_avatar.jpg
import { readFileSync } from "node:fs";

const file = process.argv[2] || "../../oscar_avatar.jpg";
const base = (process.env.PUBLIC_BASE_URL || (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : "")).replace(/\/+$/, "");
if (!base || !process.env.ADMIN_TOKEN) { console.error("Faltan PUBLIC_BASE_URL/RAILWAY_PUBLIC_DOMAIN o ADMIN_TOKEN (corre con `railway run`)."); process.exit(1); }
const res = await fetch(`${base}/admin/avatar`, { method: "PUT", headers: { authorization: `Bearer ${process.env.ADMIN_TOKEN}`, "content-type": "image/jpeg" }, body: readFileSync(file) });
console.log(res.status, await res.text());
process.exit(res.ok ? 0 : 1);
