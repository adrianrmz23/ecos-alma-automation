# Checklist de producción

## Vercel
- [ ] Proyecto importado
- [ ] `NEXT_PUBLIC_SUPABASE_URL`
- [ ] `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- [ ] `SUPABASE_SECRET_KEY` (Sensitive)
- [ ] `FACEBOOK_APP_ID`
- [ ] `FACEBOOK_APP_SECRET` (Sensitive)
- [ ] `FACEBOOK_LOGIN_CONFIG_ID`
- [ ] `FACEBOOK_GRAPH_VERSION=v26.0`
- [ ] `FACEBOOK_TOKEN_ENCRYPTION_KEY` (Sensitive)
- [ ] `SCHEDULER_SECRET` (Sensitive)
- [ ] Deployment Production exitoso
- [ ] `/api/health` responde 200

## App
- [ ] Login funciona en producción
- [ ] Facebook aparece conectado
- [ ] `Probar conexión` funciona
- [ ] Programación masiva funciona
- [ ] Cola funciona
- [ ] Publicar ahora funciona

## Meta
- [ ] Dominio de producción agregado a App Domains
- [ ] Dominio HTTPS de producción agregado al campo de dominios permitidos del SDK JS
- [ ] Permisos siguen en `Listo para la prueba`

## Supabase Cron
- [ ] Cron/pg_cron habilitado
- [ ] pg_net habilitado
- [ ] URL del scheduler guardada en Vault
- [ ] SCHEDULER_SECRET guardado en Vault
- [ ] Job `ecos-alma-publisher-every-minute` activo
- [ ] Últimos runs del Cron exitosos
- [ ] `scheduler_health.last_tick_at` se actualiza

## Prueba end-to-end
- [ ] 1 imagen programada 3–5 min adelante
- [ ] App cerrada durante la espera
- [ ] Facebook publicó automáticamente
- [ ] Historial registra `published`
- [ ] Facebook Post ID guardado
