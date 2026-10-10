# Millimeter SM Automation

Bot autónomo que **cada día genera y publica una imagen en Instagram** para [MILLIMETER by Casanova](https://www.millimetersouthamerica.com/) (`@casanova_southamerica`), usando solo APIs oficiales:

- **Gemini** (texto) → idea, caption y prompt, **basados únicamente en la información oficial** de [`knowledge/facts.json`](knowledge/facts.json).
- **Nano Banana Pro** (`gemini-3-pro-image`, 2K, 4:5) → la imagen.
- **Instagram API (Meta)** → publicación, marcada siempre como *generada con IA*.
- **Railway** → ejecución 24/7. Sin Metricool ni otras plataformas de terceros.

## Cómo funciona

```
cada 5 min ─ ¿ya es la hora y no se ha publicado hoy?
   1. Pilar del día (rota por día de la semana)  →  Gemini escribe topic + caption + prompt de imagen
   2. Validación determinista: todo número/correo/URL debe existir en la base oficial; sin precios,
      garantías, certificaciones; sin repetir temas recientes
   3. Auditor (segunda llamada a Gemini) revisa el borrador contra la base oficial
   4. Nano Banana Pro genera la imagen 2K → JPEG (Meta no acepta PNG) → /data/images (URL pública)
   5. Meta: crea contenedor (is_ai_generated=true) → espera FINISHED → publica
   6. Aviso por Telegram (opcional) + registro en state.json
```

Si el contenido no supera la validación tras 4 rondas, **ese día no se publica** (mejor silencio que un dato inventado) y se avisa.

### Garantías
- **Idempotente**: cada etapa se guarda en `state.json`; un reinicio retoma donde quedó, no regenera (ni cobra) ni publica dos veces. Tras un fallo ambiguo al publicar, verifica en Instagram si ya salió.
- **Tope de gasto**: máx. 4 intentos/día; el contenido y la imagen ya generados se reutilizan.
- **Token**: el de larga duración (60 días) se renueva solo y se guarda en el Volume; avisa si no puede.
- **Imágenes**: sin texto, personas, logotipos ni proyectos reconocibles (política de IA del proyecto). Siempre declaradas como IA.

## Variables de entorno
Ver [`.env.example`](.env.example). **Este repo es público: jamás subas claves.** En Railway van en *Variables*.

| Variable | Obligatoria | Nota |
|---|---|---|
| `GEMINI_API_KEY` | ✅ | Con facturación activa (Nano Banana Pro es de pago) |
| `META_ACCESS_TOKEN` | ✅ | Token de larga duración de Instagram Login |
| `META_IG_USER_ID` | ✅ | `npm run once -- --whoami` lo muestra |
| `DATA_DIR` | ✅ en Railway | `/data` (Volume) |
| `ADMIN_TOKEN` | recomendada | Habilita `/admin/*`; usa una cadena larga y aleatoria |
| `TZ_NAME`, `POST_HOUR`, `POST_MINUTE` | no | Por defecto `America/Bogota`, 10:00 |
| `PAUSED`, `DRY_RUN` | no | Interruptor de emergencia / modo ensayo |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | no | Avisos |

## Despliegue en Railway
1. Railway → **New Project → Deploy from GitHub repo** → este repositorio.
2. **Settings → Networking → Generate Domain** (Meta descarga la imagen desde ahí; el bot usa `RAILWAY_PUBLIC_DOMAIN` automáticamente).
3. **Volumes → New Volume** montado en `/data` y variable `DATA_DIR=/data`.
4. Carga las variables de la tabla.
5. Prueba sin publicar: `curl -X POST -H "Authorization: Bearer $ADMIN_TOKEN" "https://<dominio>/admin/run?dry=1"` y mira `GET /admin/status` y los logs.
6. Con el ensayo aprobado, deja `DRY_RUN=false`. El bot publica solo cada día a la hora configurada.

## Uso local
```bash
npm install
cp .env.example .env        # completa las claves
npm run once -- --whoami    # verifica el token de Meta y muestra tu user_id
npm run once -- --content   # solo texto (centavos)
npm run once -- --dry       # texto + imagen, sin publicar (~USD 0.13)
npm test                    # pruebas de las reglas de validación
```

## Ampliar el conocimiento
Todo lo que el bot puede afirmar sale de `knowledge/facts.json`. Añade hechos **validados por el cliente**; lo que no esté ahí, el bot no lo dirá. Tono y estética: `knowledge/voice.md`.

## Límites conocidos
- Meta exige URL pública para imágenes: se sirven desde el propio servicio (`/media/<archivo>.jpg`, nombres no enumerables, se borran a los 30 días).
- Los stickers interactivos de stories no existen en la API; este bot publica posts de feed.
- Revisión humana: el bot es autónomo por diseño. Revisa el feed periódicamente y usa `PAUSED=true` si algo no te gusta.
