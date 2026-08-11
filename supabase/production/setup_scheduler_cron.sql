-- ECOS DEL ALMA — Scheduler de producción
-- Ejecutar DESPUÉS de desplegar en Vercel.
--
-- ANTES DE EJECUTAR, reemplaza SOLO estos dos valores:
--   https://TU-DOMINIO.vercel.app/api/scheduler/tick
--   TU_SCHEDULER_SECRET
--
-- TU_SCHEDULER_SECRET debe ser EXACTAMENTE el mismo valor configurado
-- como SCHEDULER_SECRET en Vercel Production.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Guarda/actualiza la URL del scheduler en Vault.
do $$
declare
  secret_id uuid;
begin
  select id into secret_id
  from vault.secrets
  where name = 'ecos_alma_scheduler_url'
  limit 1;

  if secret_id is null then
    perform vault.create_secret(
      'https://TU-DOMINIO.vercel.app/api/scheduler/tick',
      'ecos_alma_scheduler_url',
      'Endpoint HTTPS de producción para Ecos del Alma Scheduler'
    );
  else
    perform vault.update_secret(
      secret_id,
      'https://TU-DOMINIO.vercel.app/api/scheduler/tick',
      'ecos_alma_scheduler_url',
      'Endpoint HTTPS de producción para Ecos del Alma Scheduler'
    );
  end if;
end $$;

-- Guarda/actualiza el Bearer secret en Vault.
do $$
declare
  secret_id uuid;
begin
  select id into secret_id
  from vault.secrets
  where name = 'ecos_alma_scheduler_secret'
  limit 1;

  if secret_id is null then
    perform vault.create_secret(
      'TU_SCHEDULER_SECRET',
      'ecos_alma_scheduler_secret',
      'Bearer secret del scheduler de Ecos del Alma'
    );
  else
    perform vault.update_secret(
      secret_id,
      'TU_SCHEDULER_SECRET',
      'ecos_alma_scheduler_secret',
      'Bearer secret del scheduler de Ecos del Alma'
    );
  end if;
end $$;

-- El mismo nombre sobrescribe la definición anterior si vuelves a ejecutar el script.
select cron.schedule(
  'ecos-alma-publisher-every-minute',
  '* * * * *',
  $$
    select net.http_post(
      url := (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'ecos_alma_scheduler_url'
        limit 1
      ),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'ecos_alma_scheduler_secret'
          limit 1
        )
      ),
      body := jsonb_build_object(
        'source', 'supabase-cron',
        'time', now()
      ),
      timeout_milliseconds := 50000
    ) as request_id;
  $$
);

-- Verificación rápida.
select jobid, jobname, schedule, active, command
from cron.job
where jobname = 'ecos-alma-publisher-every-minute';
