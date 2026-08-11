# Ecos del Alma Publisher

Aplicación privada para programar publicaciones de imagen en Facebook.

## Flujo actual

1. Subir hasta 10 imágenes en **Programar**.
2. Revisar orden y horarios.
3. Confirmar el lote.
4. La **Cola** conserva y procesa las publicaciones.
5. Facebook publica automáticamente cuando el scheduler ejecuta el ciclo correspondiente.
6. **Historial** registra publicaciones, cancelaciones y errores.

## Secciones

- **Inicio** — próxima publicación y salud operativa.
- **Programar** — carga masiva de imágenes.
- **Cola** — horarios, publicación inmediata, cancelación y reintentos.
- **Historial** — resultados y recuperación segura.
- **Configuración** — horarios, scheduler y conexión con Facebook.

## Estado del proyecto

La lógica funcional está preparada hasta el Bloque 9. El Bloque 10 aplica el pulido visual/UX previo al despliegue.

El despliegue final en Vercel y la activación de Supabase Cron se realizarán después de validar esta versión localmente.
