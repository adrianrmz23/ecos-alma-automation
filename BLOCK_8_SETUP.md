# BLOCK 8 — Facebook Publisher

## Objetivo
Cerrar el circuito real:

`Programación masiva → Cola → Scheduler → Facebook → Historial`

Este bloque publica principalmente **solo imágenes**. Si un elemento de la cola no tiene caption, no se envía texto adicional a Facebook.

## Qué agrega
- publicación real de fotos a una Facebook Page;
- botón `Publicar ahora` conectado a Facebook;
- scheduler manual que publica vencidas;
- endpoint `/api/scheduler/tick` que también publica cuando se invoque desde cron;
- prueba de conexión desde Configuración;
- historial con Facebook Post ID, intentos y errores;
- tabla `facebook_publish_logs`.

---

## 1. Copia el proyecto
Usa este ZIP como nueva base del proyecto y conserva tu `.env.local` real.

## 2. Ejecuta la migración
En Supabase > SQL Editor ejecuta únicamente:

`supabase/migrations/008_block_8_facebook_publisher.sql`

No vuelvas a ejecutar las migraciones anteriores.

## 3. Obtén Page ID + Page Access Token
Para la primera integración usamos un token configurado manualmente porque el proyecto es privado y solo controla Ecos del Alma.

En Meta for Developers:

1. Crea/usa tu App de Meta.
2. Tu cuenta de Facebook debe tener acceso a Ecos del Alma y, mientras la app esté en Development Mode, debe ser usuario con rol dentro de la App.
3. Abre Graph API Explorer y selecciona tu App.
4. Genera un **User Access Token** solicitando los permisos de Pages necesarios. Para este flujo conviene incluir:
   - `pages_show_list`
   - `pages_manage_metadata`
   - `pages_read_engagement`
   - `pages_manage_posts`
5. Ejecuta en Graph API Explorer:

   `GET /me/accounts?fields=id,name,access_token,tasks`

6. Busca **Ecos del Alma** en la respuesta.
7. Copia:
   - `id` → será `FACEBOOK_PAGE_ID`
   - `access_token` → será `FACEBOOK_PAGE_ACCESS_TOKEN`

Meta documenta `/me/accounts` como el flujo para obtener IDs y Page Access Tokens de las páginas que el usuario puede administrar.

> El Page Access Token es secreto. Nunca lo subas a GitHub y nunca uses un nombre `NEXT_PUBLIC_...` para guardarlo.

## 4. Configura `.env.local`
Agrega:

```env
FACEBOOK_GRAPH_VERSION=v25.0
FACEBOOK_PAGE_ID=1234567890
FACEBOOK_PAGE_ACCESS_TOKEN=EA...
```

Después reinicia Next.js:

```bash
Ctrl + C
npm run dev
```

## 5. Prueba la conexión
Ve a:

`Configuración → Conexión con Facebook → Probar conexión`

Debe mostrar el nombre y Page ID de Ecos del Alma.

Esta prueba confirma que el token puede identificar la página. La primera publicación real será la prueba definitiva de `pages_manage_posts`.

## 6. Primera prueba de publicación
Recomendación: usa **una sola imagen de prueba**.

1. Ve a `Programación masiva` y sube 1 imagen.
2. Ve a `Cola`.
3. Presiona `Publicar ahora`.
4. Confirma.
5. Comprueba que la imagen apareció en la página de Facebook.
6. La fila debe desaparecer de Cola y aparecer en Historial como `Publicada` con su Facebook Post ID.

## 7. Publicación por horario
Cuando una publicación llega a su horario:

- `scheduled` → `ready_to_publish`
- el publicador la reclama como `publishing`
- descarga la imagen privada desde Supabase Storage
- la envía a `/{PAGE_ID}/photos`
- si Facebook confirma: `published`
- si Facebook devuelve error: `failed`

No hay reintentos automáticos en este bloque para evitar duplicar publicaciones ante fallos ambiguos de red.

## 8. Scheduler local vs automático
### Localhost
En localhost usa el botón:

`Cola → Procesar y publicar`

El servidor local **no despierta solo** a la hora programada.

### Despliegue
El endpoint ya preparado es:

`POST /api/scheduler/tick`

Headers:

`Authorization: Bearer TU_SCHEDULER_SECRET`

Para usarlo en producción necesitas:

```env
SUPABASE_SERVICE_ROLE_KEY=...
SCHEDULER_SECRET=...
```

Y un cron que invoque el endpoint periódicamente. Eso se conectará en la etapa final de despliegue.

## 9. Seguridad
- `FACEBOOK_PAGE_ACCESS_TOKEN` solo se usa en código de servidor.
- no se guarda en Supabase;
- no se envía al navegador;
- no debe entrar al repositorio Git;
- `.env.local` ya está ignorado por Next/Git en una instalación normal.

## 10. Si Facebook devuelve error
Historial guarda:
- cantidad de intentos;
- último error;
- fecha del intento.

`facebook_publish_logs` conserva un registro técnico de cada llamada para depuración.
