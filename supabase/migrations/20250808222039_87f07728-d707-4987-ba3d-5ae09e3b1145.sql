
-- 1) Create table to track Browse.ai robot/task runs
create table if not exists public.browseai_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  robot_id text not null,
  task_id text,
  status text not null default 'queued',
  input_params jsonb,                -- store only non-sensitive inputs; avoid passwords
  raw_result jsonb,
  error text,
  credit_report_id uuid references public.credit_reports(id),
  webhook_received_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Helpful indexes
create index if not exists idx_browseai_runs_user_id on public.browseai_runs(user_id);
create index if not exists idx_browseai_runs_credit_report_id on public.browseai_runs(credit_report_id);
create unique index if not exists uidx_browseai_runs_task_id on public.browseai_runs(task_id) where task_id is not null;

-- Keep updated_at fresh
drop trigger if exists trg_browseai_runs_updated_at on public.browseai_runs;
create trigger trg_browseai_runs_updated_at
before update on public.browseai_runs
for each row execute function public.update_updated_at_column();

-- 2) Enable Row Level Security
alter table public.browseai_runs enable row level security;

-- 3) RLS policies: users manage their own rows
do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'browseai_runs' and policyname = 'Users can view their own browseai runs'
  ) then
    create policy "Users can view their own browseai runs"
      on public.browseai_runs
      for select
      using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'browseai_runs' and policyname = 'Users can insert their own browseai runs'
  ) then
    create policy "Users can insert their own browseai runs"
      on public.browseai_runs
      for insert
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'browseai_runs' and policyname = 'Users can update their own browseai runs'
  ) then
    create policy "Users can update their own browseai runs"
      on public.browseai_runs
      for update
      using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'browseai_runs' and policyname = 'Users can delete their own browseai runs'
  ) then
    create policy "Users can delete their own browseai runs"
      on public.browseai_runs
      for delete
      using (auth.uid() = user_id);
  end if;

  -- 4) Superadmins can manage all
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'browseai_runs' and policyname = 'Superadmins can manage all browseai runs'
  ) then
    create policy "Superadmins can manage all browseai runs"
      on public.browseai_runs
      for all
      using (has_role(auth.uid(), 'superadmin'::app_role))
      with check (has_role(auth.uid(), 'superadmin'::app_role));
  end if;
end$$;
