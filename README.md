# Millimeter SM Automation

Bot autónomo que **cada día genera y publica en Instagram** (post de una imagen o carrusel) para [MILLIMETER by Casanova](https://www.millimetersouthamerica.com/) (`@casanova_southamerica`), usando solo APIs oficiales:

- **Gemini** (texto) → plan, textos de cada pieza, escenas y caption, basados **únicamente** en la información oficial de [`knowledge/`](knowledge/) y en la guía editorial del cliente.
- **Nano Banana Pro** (`gemini-3-pro-image`, 2K, 3:4) → las fotos, **sin texto**.
- **Compositor propio** (`sharp` + `resvg`) → monta el layout y la tipografía de marca (Cormorant Garamond / Montserrat) sobre cada foto: el nombre, las tildes y las cifras salen siempre exactos.
- **Instagram API (Meta)** → publicación (imagen o carrusel), marcada siempre como *generada con IA*.
- **Railway** → ejecución 24/7. Sin Metricool ni otras plataformas de terceros.

## Qué publica
El foco son **los productos y servicios**: aplicaciones (muros, duchas, chimeneas, techos, puertas, mobiliario, curvas), ventajas técnicas (peso, comparativa), materiales del catálogo, salud (sílice), huella de carbono y cómo se trabaja un proyecto. Cada día:

| Decisión | Cómo se toma |
|---|---|
| **Formato** | 35 % una imagen · 65 % carrusel de 3 a 6 imágenes (aleatorio, estable por fecha) |
| **Tema** | El menos usado recientemente de `knowledge/topics.json`; si repite, exige un ángulo nuevo |
| **Layout de cada pieza** | 7 layouts (A franja oscura, B arco crema, C textura + dato, D dividido, E portada a sangre, F marco revista, G tipográfica). La portada nunca repite las 3 anteriores y no se repite layout dentro de un post |
| **Material** | Uno de los 9 del catálogo, variando respecto a los últimos posts |
| **Caption** | Esqueleto fijo del cliente: titular · problema · solución · 4 viñetas ✦ · «Misma piedra. Sin el espesor.» · CTA + contacto · 🇨🇴🇦🇷🇵🇪🇧🇷 · máx. 5 hashtags |

## Cómo funciona

```
cada 5 min ─ ¿ya es la hora y no se ha publicado hoy?
 1. Plan (Gemini): tema + ángulo + textos de cada pieza + escena fotográfica + caption
 2. Validación determinista: todo número/correo/URL debe existir en la base oficial; sin precios, garantías,
    certificaciones ni «sin juntas» absoluto; escenas sin personas ni cantos; textos dentro de los límites
 3. Auditor (segunda llamada a Gemini) revisa el plan contra la base oficial
 4. Por pieza: foto (Nano Banana Pro) → INSPECTOR visual (juntas, espesor, piedra doblada, texto, personas…)
    → si falla, regenera con correcciones; si sigue fallando, cae a un primer plano de la piedra
 5. Composición: layout + tipografía de marca → JPEG 1440×1920 (3:4) → /data/images (URL pública)
 6. Meta: contenedor (o hijos + contenedor de carrusel) → FINISHED → publicar
 7. Aviso por Telegram (opcional) + registro en state.json
```

### Garantías
- **Idempotente**: cada etapa y cada pieza se guardan en `state.json`; un reinicio retoma donde quedó, no regenera lo ya hecho ni publica dos veces (tras un fallo ambiguo al publicar, verifica en Instagram si ya salió).
- **Tope de gasto**: máx. 4 intentos/día, 3 intentos de foto por pieza y `MAX_IMAGES_PER_DAY` (18) imágenes al día. Si se alcanza, no se publica y se avisa.
- **Token**: el de larga duración (60 días) se renueva solo y se guarda en el Volume; avisa si no puede.
- **Sin inventar**: si el plan no supera validación + auditor en 4 rondas, ese día no se publica.
- **Realismo**: reglas del cliente en cada prompt (panel continuo, sin juntas, sin cantos/espesor, puertas cerradas, nada doblado ni flotante). Las fotos rechazadas se guardan 3 días en `/data/rejected` para diagnóstico.

## Conocimiento (lo que el bot «sabe»)
| Archivo | Para qué |
|---|---|
| `knowledge/facts.json` | Única fuente de datos afirmables (brochure + web oficial). Lo que no esté aquí, el bot no lo dice |
| `knowledge/guia-editorial.md` | Prompt maestro del cliente adaptado: marca, realismo, sistema de diseño, estructura, copy y tono |
| `knowledge/prompt-maestro-original.md` | Copia íntegra del prompt del cliente (referencia; no se carga) |
| `knowledge/topics.json` | Banco de temas y lista de «ya publicados» |
| `knowledge/materiales.json` | Los 9 materiales y su descripción visual genérica (validar con muestras reales) |

## Variables de entorno
Ver [`.env.example`](.env.example). **Este repo es público: jamás subas claves.** En Railway van en *Variables*.

| Variable | Obligatoria | Nota |
|---|---|---|
| `GEMINI_API_KEY` | ✅ | Con facturación activa (Nano Banana Pro es de pago) |
| `META_ACCESS_TOKEN` | ✅ | Token de larga duración de Instagram Login |
| `DATA_DIR` | ✅ en Railway | `/data` (Volume) |
| `ADMIN_TOKEN` | recomendada | Habilita `/admin/*`; cadena larga y aleatoria |
| `IMAGE_ASPECT`, `IMAGE_SIZE` | no | `3:4` y `2K` |
| `MAX_IMAGES_PER_DAY` | no | Tope duro de imágenes generadas por día (18) |
| `TZ_NAME`, `POST_HOUR`, `POST_MINUTE` | no | Por defecto `America/Bogota`, 10:00 |
| `PAUSED`, `DRY_RUN` | no | Interruptor de emergencia / modo ensayo |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | no | Avisos |

## Despliegue en Railway
1. Railway → **New Project → Deploy from GitHub repo** → este repositorio.
2. **Networking → Generate Domain** (Meta descarga las imágenes desde ahí; el bot usa `RAILWAY_PUBLIC_DOMAIN`).
3. **Volume** montado en `/data` y `DATA_DIR=/data`.
4. Carga las variables. Ensayo sin publicar: `curl -X POST -H "Authorization: Bearer $ADMIN_TOKEN" "https://<dominio>/admin/run?dry=1&count=3"` (`count` fuerza el nº de imágenes solo en ensayos) y mira `GET /admin/status` y los logs.
5. Con el ensayo aprobado, el bot publica solo cada día a la hora configurada.

## Uso local
```bash
npm install
cp .env.example .env          # completa las claves
npm run once -- --whoami      # verifica el token de Meta
npm run once -- --content     # solo plan y textos (centavos)
npm run once -- --dry --count 3   # plan + fotos + composición, sin publicar (~USD 0.4–1)
npm test                      # reglas de validación y de diseño
```

## Límites conocidos
- Meta exige URL pública para las imágenes: se sirven desde el propio servicio (`/media/<archivo>.jpg`, nombres no enumerables, 30 días).
- Los stickers interactivos de stories no existen en la API; este bot publica posts de feed.
- Las descripciones visuales de cada material son genéricas: el bot no puede garantizar que una piedra se vea idéntica a la real. Las imágenes son conceptuales, siempre etiquetadas como IA, y **nunca** representan proyectos reales.
- El bot es autónomo por diseño: revisa el feed periódicamente y usa `PAUSED=true` si algo no te gusta.
