-- Estado del job
select jobid, jobname, schedule, active
from cron.job
where jobname = 'ecos-alma-publisher-every-minute';

-- Últimas 20 ejecuciones de pg_cron
select
  jobid,
  runid,
  status,
  start_time,
  end_time,
  return_message
from cron.job_run_details
where jobid in (
  select jobid from cron.job where jobname = 'ecos-alma-publisher-every-minute'
)
order by start_time desc
limit 20;

-- Salud que reporta la propia app
select
  status,
  last_tick_at,
  last_success_at,
  last_published_at,
  consecutive_failures,
  last_duration_ms,
  last_error
from public.scheduler_health
order by updated_at desc;
