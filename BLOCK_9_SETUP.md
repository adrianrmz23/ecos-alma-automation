# Bloque 9 — Operación automática + recuperación segura

## Objetivo
Cerrar la operación del publicador antes del despliegue final:

- scheduler reutilizable manual/cron;
- reintentos automáticos solo cuando son seguros;
- protección contra publicaciones duplicadas;
- detección de procesos `publishing` abandonados;
- historial con recuperación manual;
- estado de salud del scheduler;
- endpoint protegido listo para producción.

## 1. Ejecutar migración
En Supabase > SQL Editor ejecuta:

`supabase/migrations/009_block_9_operations_recovery.sql`

## 2. Variables privadas
Además de tus variables actuales agrega:

```env
SUPABASE_SECRET_KEY=sb_secret_TU_KEY
SCHEDULER_SECRET=una_cadena_aleatoria_larga
```

Si tu proyecto todavía usa la llave legacy puedes usar:

```env
SUPABASE_SERVICE_ROLE_KEY=...
```

La app prioriza `SUPABASE_SECRET_KEY`.

Para generar un secreto desde terminal puedes usar, por ejemplo:

```bash
openssl rand -hex 32
```

No uses prefijo `NEXT_PUBLIC_` para ninguna de estas variables.

## 3. Qué hace el scheduler
Cada ciclo:

1. Detecta publicaciones `scheduled` cuya hora ya llegó.
2. Libera `retry_wait` cuando llega `next_retry_at`.
3. Detecta `publishing` abandonados por más de 10 minutos y los manda a `needs_review`.
4. Publica hasta 5 elementos listos por página en un ciclo.
5. Registra el resultado en `scheduler_runs`.
6. Actualiza `scheduler_health`.

## 4. Política de reintentos
El Bloque 9 es conservador para evitar duplicados.

### Automático
Se reintenta automáticamente cuando sabemos que es seguro, por ejemplo:
- lectura temporal fallida desde Storage (la imagen nunca llegó a Facebook);
- rate limit explícito de Facebook;
- error temporal explícito de Graph API;
- Page Access Token renovado automáticamente.

Backoff: aproximadamente 2, 5 y 15 minutos. Máximo 3 reintentos automáticos.

### Revisión manual
Si la conexión se corta durante el envío o Facebook devuelve un resultado ambiguo, la publicación pasa a:

`needs_review`

Antes de reintentar, la interfaz exige confirmar que revisaste la Página y que la imagen NO se publicó.
También puedes marcarla como "Sí se publicó" si verificaste que Facebook sí la recibió.

## 5. Localhost
En local el scheduler no puede trabajar solo cuando tu PC/app está apagada.
Usa:

Cola > Ejecutar ciclo ahora

para probar toda la lógica.

## 6. Producción
La ruta queda lista en:

`GET/POST /api/scheduler/tick`

Debe recibir:

`Authorization: Bearer <SCHEDULER_SECRET>`

En el Bloque 10, una vez desplegado el proyecto, conectaremos Supabase Cron para llamar este endpoint cada minuto.

No se incluye un `vercel.json` con cron de 1 minuto a propósito: Vercel Hobby no permite cron con frecuencia mayor a una vez al día. Supabase Cron sí permite trabajos frecuentes y llamadas HTTP.

## 7. Prueba sugerida
1. Ejecuta la migración 009.
2. Agrega las dos variables privadas.
3. Reinicia `npm run dev`.
4. En Cola pulsa `Ejecutar ciclo ahora`.
5. Revisa que Inicio muestre un `Último ciclo`.
6. Programa una imagen unos minutos adelante y vuelve a ejecutar el ciclo cuando llegue su horario.

## Resultado esperado
- publicación normal -> `published`;
- error temporal seguro -> `retry_wait`;
- error ambiguo -> `needs_review`;
- token recuperable -> reintento automático;
- token no recuperable -> Facebook `reconnect_required`, publicación conservada.
