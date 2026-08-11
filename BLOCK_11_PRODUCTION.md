# BLOQUE 11 — Producción

Este bloque prepara la app para Vercel + Supabase Cron.

## Cambios técnicos incluidos

- `/api/scheduler/tick` queda fuera de la autenticación de navegador; sigue protegido por `Authorization: Bearer <SCHEDULER_SECRET>`.
- Se agrega `/api/health` para comprobar rápidamente que Vercel responde.
- El scheduler procesa como máximo 3 publicaciones por ciclo para mantener margen dentro del tiempo de ejecución.
- Se agrega `.env.production.example`.
- Se agregan scripts SQL para instalar, revisar y desactivar Supabase Cron.

## Variables de producción en Vercel

Configura estas variables:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SECRET_KEY=
FACEBOOK_APP_ID=
FACEBOOK_APP_SECRET=
FACEBOOK_LOGIN_CONFIG_ID=1037204389124133
FACEBOOK_GRAPH_VERSION=v26.0
FACEBOOK_TOKEN_ENCRYPTION_KEY=
SCHEDULER_SECRET=
```

Genera secretos independientes con Node:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Ejecuta el comando dos veces: una para `FACEBOOK_TOKEN_ENCRYPTION_KEY` y otra para `SCHEDULER_SECRET`.

## Orden de despliegue

1. Sube este proyecto final a GitHub o impórtalo a Vercel.
2. Configura todas las variables de Production en Vercel.
3. Despliega.
4. Abre `https://TU-DOMINIO/api/health` y comprueba `{"ok":true,...}`.
5. Entra en la app y verifica login, Configuración y Facebook.
6. Configura el dominio de producción en la Meta App.
7. Ejecuta `supabase/production/setup_scheduler_cron.sql`, reemplazando la URL y el `SCHEDULER_SECRET`.
8. Comprueba `supabase/production/verify_scheduler.sql`.
9. Programa una sola imagen unos minutos en el futuro.
10. Espera sin abrir la app y confirma que Facebook la publique automáticamente.

## Meta en producción

Después de conocer el dominio definitivo de Vercel:

- En **Configuración de la app > Básica > Dominios de la app**, agrega el hostname de producción.
- En la configuración de Facebook Login for Business donde viste **Dominios permitidos para el SDK para JavaScript**, agrega el origen HTTPS de producción.
- Mantén la configuración y permisos ya probados: `business_management`, `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`.

No cambies el flujo de tokens: la conexión existente está almacenada en Supabase y continuará utilizándose. La configuración de dominio es especialmente importante para futuras reconexiones desde producción.

## Supabase Cron

Edita primero:

`supabase/production/setup_scheduler_cron.sql`

Reemplaza:

```text
https://TU-DOMINIO.vercel.app/api/scheduler/tick
TU_SCHEDULER_SECRET
```

El secreto debe coincidir exactamente con `SCHEDULER_SECRET` de Vercel.

Después ejecuta el archivo completo en SQL Editor.

Para revisar:

`supabase/production/verify_scheduler.sql`

Para detener el scheduler inmediatamente:

`supabase/production/disable_scheduler.sql`

## Prueba final recomendada

No empieces con diez publicaciones.

1. Sube una imagen.
2. Prográmala 3–5 minutos en el futuro.
3. Cierra la aplicación.
4. Espera al horario.
5. Confirma la publicación en Facebook.
6. Abre Historial y verifica que quede `published`.
7. Revisa `scheduler_health` y `cron.job_run_details`.

Cuando esa prueba pase, puedes programar el lote real.
